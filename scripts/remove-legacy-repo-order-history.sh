#!/usr/bin/env bash

set -euo pipefail

OWNER="${GITHUB_REPOSITORY_OWNER:-oosuhada}"
LEGACY_MESSAGE="${LEGACY_MESSAGE:-chore: preserve repository creation order [skip ci]}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# By default, treat the parent directory that contains this repository checkout
# as the local repository workspace. Override LOCAL_REPOS_ROOT when running from
# a different layout.
LOCAL_REPOS_ROOT="${LOCAL_REPOS_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
DRY_RUN="${DRY_RUN:-0}"
ONLY_REPOSITORIES="${ONLY_REPOSITORIES:-}"
SETUP_GIT_AUTH="${SETUP_GIT_AUTH:-1}"
WORK_ROOT="${WORK_ROOT:-$(mktemp -d)}"
BACKUP_ROOT="${BACKUP_ROOT:-${LOCAL_REPOS_ROOT}/../history-cleanup-backups/$(date +%Y%m%d-%H%M%S)}"

command -v git >/dev/null 2>&1 || { echo "git is required" >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "gh is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

if [[ "${SETUP_GIT_AUTH}" == "1" ]]; then
  gh auth setup-git >/dev/null
fi
mkdir -p "${BACKUP_ROOT}"
trap 'rm -rf "${WORK_ROOT}"' EXIT

repository_selected() {
  local repository="$1"
  [[ -z "${ONLY_REPOSITORIES}" ]] && return 0

  local selected
  IFS=',' read -r -a selected <<< "${ONLY_REPOSITORIES}"
  local item
  for item in "${selected[@]}"; do
    [[ "${repository}" == "${item}" ]] && return 0
  done
  return 1
}

legacy_commits() {
  local repository_dir="$1"
  local refs=("${@:2}")
  [[ "${#refs[@]}" -eq 0 ]] && return 0
  git -C "${repository_dir}" log "${refs[@]}" --format='%H%x09%s' --no-decorate \
    | awk -F '\t' -v message="${LEGACY_MESSAGE}" '$2 == message { print $1 }'
}

delete_non_target_refs() {
  local repository_dir="$1"
  while IFS= read -r ref; do
    case "${ref}" in
      refs/heads/*|refs/tags/*) ;;
      *) git -C "${repository_dir}" update-ref -d "${ref}" ;;
    esac
  done < <(git -C "${repository_dir}" for-each-ref --format='%(refname)')
}

verify_head_trees() {
  local repository_dir="$1"
  local before_file="$2"
  local failed=0
  local ref old_tree new_tree
  while IFS=$'\t' read -r ref old_tree; do
    [[ -z "${ref}" ]] && continue
    if ! new_tree="$(git -C "${repository_dir}" rev-parse "${ref}^{tree}" 2>/dev/null)"; then
      echo "Missing rewritten branch ref: ${ref}" >&2
      failed=1
      continue
    fi
    if [[ "${old_tree}" != "${new_tree}" ]]; then
      echo "Tree mismatch for ${ref}: before=${old_tree} after=${new_tree}" >&2
      failed=1
    fi
  done < "${before_file}"
  return "${failed}"
}

restore_missing_head_refs() {
  local repository_dir="$1"
  local before_file="$2"
  local ref old_tree new_commit

  git -C "${repository_dir}" config user.name "Oosu"
  git -C "${repository_dir}" config user.email "185910926+oosuhada@users.noreply.github.com"

  while IFS=$'\t' read -r ref old_tree; do
    [[ -z "${ref}" ]] && continue
    if ! git -C "${repository_dir}" show-ref --verify --quiet "${ref}"; then
      new_commit="$(printf '%s\n' 'chore: retain repository snapshot after history cleanup' \
        | git -C "${repository_dir}" commit-tree "${old_tree}")"
      git -C "${repository_dir}" update-ref "${ref}" "${new_commit}"
      echo "RETAIN ${ref}: legacy-only branch replaced with one clean snapshot commit"
    fi
  done < "${before_file}"
}

process_repository() {
  local repository="$1"
  local archived="$2"
  local repository_dir="${WORK_ROOT}/${repository}.git"
  local remote_url="https://github.com/${OWNER}/${repository}.git"
  local local_source="${LOCAL_REPOS_ROOT}/${repository}"
  local backup_dir="${BACKUP_ROOT}/${repository}"

  rm -rf "${repository_dir}"
  mkdir -p "${backup_dir}"

  if [[ -d "${local_source}/.git" ]]; then
    git clone --quiet --mirror "${local_source}" "${repository_dir}"
    git -C "${repository_dir}" remote set-url origin "${remote_url}"
    git -C "${repository_dir}" config remote.origin.mirror false
    git -C "${repository_dir}" fetch --quiet --prune origin \
      '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*'
  else
    git clone --quiet --mirror "${remote_url}" "${repository_dir}"
    git -C "${repository_dir}" config remote.origin.mirror false
  fi

  delete_non_target_refs "${repository_dir}"

  local refs=()
  while IFS= read -r ref; do
    [[ -n "${ref}" ]] && refs+=("${ref}")
  done < <(git -C "${repository_dir}" for-each-ref refs/heads refs/tags --format='%(refname)')

  git -C "${repository_dir}" for-each-ref refs/heads refs/tags \
    --format='%(refname)%09%(objectname)' > "${backup_dir}/refs-before.tsv"

  : > "${backup_dir}/head-trees-before.tsv"
  local ref tree
  while IFS= read -r ref; do
    if tree="$(git -C "${repository_dir}" rev-parse "${ref}^{tree}" 2>/dev/null)"; then
      printf '%s\t%s\n' "${ref}" "${tree}" >> "${backup_dir}/head-trees-before.tsv"
    fi
  done < <(git -C "${repository_dir}" for-each-ref refs/heads --format='%(refname)')

  local legacy_file="${backup_dir}/legacy-commits-before.txt"
  legacy_commits "${repository_dir}" "${refs[@]}" | sort -u > "${legacy_file}"
  local legacy_count
  legacy_count="$(wc -l < "${legacy_file}" | tr -d ' ')"

  if [[ "${legacy_count}" == "0" ]]; then
    echo "SKIP ${repository}: no legacy repo-order commits"
    rm -rf "${repository_dir}"
    return 2
  fi

  echo "FOUND ${repository}: ${legacy_count} legacy commit(s)"
  if [[ "${DRY_RUN}" == "1" ]]; then
    rm -rf "${repository_dir}"
    return 3
  fi

  # Rewrite only refs that actually contain at least one legacy commit. Running
  # filter-branch over unrelated deployment/history refs needlessly changes their
  # descendants and can fail on old malformed metadata that is unrelated to this
  # cleanup. Unaffected refs should remain byte-for-byte unchanged.
  local affected_refs=()
  local candidate_ref
  for candidate_ref in "${refs[@]}"; do
    if git -C "${repository_dir}" log "${candidate_ref}" --format='%s' \
      | grep -Fx "${LEGACY_MESSAGE}" >/dev/null; then
      affected_refs+=("${candidate_ref}")
    fi
  done
  if [[ "${#affected_refs[@]}" -eq 0 ]]; then
    echo "Unable to identify refs containing legacy commits in ${repository}" >&2
    return 1
  fi
  echo "Affected refs for ${repository}: ${affected_refs[*]}"

  export LEGACY_MESSAGE
  FILTER_BRANCH_SQUELCH_WARNING=1 git -C "${repository_dir}" filter-branch --force \
    --commit-filter '
      if [ "$(git log -1 --format=%s "$GIT_COMMIT")" = "$LEGACY_MESSAGE" ]; then
        skip_commit "$@";
      else
        git commit-tree "$@";
      fi
    ' \
    --tag-name-filter cat -- "${affected_refs[@]}" >/dev/null

  while IFS= read -r original_ref; do
    [[ -n "${original_ref}" ]] && git -C "${repository_dir}" update-ref -d "${original_ref}"
  done < <(git -C "${repository_dir}" for-each-ref refs/original --format='%(refname)')

  restore_missing_head_refs "${repository_dir}" "${backup_dir}/head-trees-before.tsv"

  refs=()
  while IFS= read -r ref; do
    [[ -n "${ref}" ]] && refs+=("${ref}")
  done < <(git -C "${repository_dir}" for-each-ref refs/heads refs/tags --format='%(refname)')

  local remaining_file="${backup_dir}/legacy-commits-after.txt"
  legacy_commits "${repository_dir}" "${refs[@]}" | sort -u > "${remaining_file}"
  if [[ -s "${remaining_file}" ]]; then
    echo "Legacy commits remain after rewrite in ${repository}" >&2
    return 1
  fi

  if ! verify_head_trees "${repository_dir}" "${backup_dir}/head-trees-before.tsv"; then
    return 1
  fi

  git -C "${repository_dir}" for-each-ref refs/heads refs/tags \
    --format='%(refname)%09%(objectname)' > "${backup_dir}/refs-after.tsv"

  # Read all remote heads/tags once. Large repositories can have hundreds of refs,
  # so one ls-remote snapshot is much faster and less failure-prone than one HTTPS
  # request per ref.
  local remote_refs_before_file="${backup_dir}/remote-refs-before-push.tsv"
  if ! git -C "${repository_dir}" ls-remote --refs origin \
    'refs/heads/*' 'refs/tags/*' \
    | awk '{ print $2 "\t" $1 }' > "${remote_refs_before_file}"; then
    echo "Unable to snapshot remote refs before rewrite push: ${repository}" >&2
    return 1
  fi

  local push_refspecs=()
  local old_sha new_sha remote_sha
  while IFS=$'\t' read -r ref old_sha; do
    [[ -z "${ref}" ]] && continue
    if git -C "${repository_dir}" show-ref --verify --quiet "${ref}"; then
      new_sha="$(git -C "${repository_dir}" rev-parse "${ref}")"
      [[ "${new_sha}" == "${old_sha}" ]] && continue
      remote_sha="$(awk -F '\t' -v target="${ref}" '$1 == target { print $2; exit }' "${remote_refs_before_file}")"
      if [[ "${remote_sha}" != "${old_sha}" ]]; then
        echo "Remote ref changed during rewrite: ${repository} ${ref} expected=${old_sha} actual=${remote_sha:-missing}" >&2
        return 1
      fi
      push_refspecs+=("${ref}:${ref}")
    else
      remote_sha="$(awk -F '\t' -v target="${ref}" '$1 == target { print $2; exit }' "${remote_refs_before_file}")"
      if [[ "${remote_sha}" != "${old_sha}" ]]; then
        echo "Remote ref changed during rewrite: ${repository} ${ref} expected=${old_sha} actual=${remote_sha:-missing}" >&2
        return 1
      fi
      push_refspecs+=(":${ref}")
    fi
  done < "${backup_dir}/refs-before.tsv"

  if [[ "${#push_refspecs[@]}" -eq 0 ]]; then
    echo "SKIP ${repository}: rewrite produced no ref changes"
    rm -rf "${repository_dir}"
    return 2
  fi

  if [[ "${archived}" == "true" ]]; then
    gh api --method PATCH "repos/${OWNER}/${repository}" -F archived=false >/dev/null
  fi

  local push_failed=0
  if ! git -C "${repository_dir}" -c http.lowSpeedLimit=1 -c http.lowSpeedTime=90 \
    push --quiet --force origin "${push_refspecs[@]}"; then
    push_failed=1
  fi

  if [[ "${archived}" == "true" ]]; then
    gh api --method PATCH "repos/${OWNER}/${repository}" -F archived=true >/dev/null || true
  fi

  if [[ "${push_failed}" == "1" ]]; then
    echo "Force push failed for ${repository}" >&2
    return 1
  fi

  local remote_refs_after_file="${backup_dir}/remote-refs-after-push.tsv"
  if ! git -C "${repository_dir}" ls-remote --refs origin \
    'refs/heads/*' 'refs/tags/*' \
    | awk '{ print $2 "\t" $1 }' > "${remote_refs_after_file}"; then
    echo "Unable to snapshot remote refs after rewrite push: ${repository}" >&2
    return 1
  fi

  while IFS=$'\t' read -r ref new_sha; do
    [[ -z "${ref}" ]] && continue
    old_sha="$(awk -F '\t' -v target="${ref}" '$1 == target { print $2 }' "${backup_dir}/refs-before.tsv")"
    [[ "${new_sha}" == "${old_sha}" ]] && continue
    remote_sha="$(awk -F '\t' -v target="${ref}" '$1 == target { print $2; exit }' "${remote_refs_after_file}")"
    if [[ "${remote_sha}" != "${new_sha}" ]]; then
      echo "Remote verification failed: ${repository} ${ref}" >&2
      return 1
    fi
  done < "${backup_dir}/refs-after.tsv"

  while IFS=$'\t' read -r ref old_sha; do
    [[ -z "${ref}" ]] && continue
    if git -C "${repository_dir}" show-ref --verify --quiet "${ref}"; then
      continue
    fi
    remote_sha="$(awk -F '\t' -v target="${ref}" '$1 == target { print $2; exit }' "${remote_refs_after_file}")"
    if [[ -n "${remote_sha}" ]]; then
      echo "Remote deleted-ref verification failed: ${repository} ${ref}" >&2
      return 1
    fi
  done < "${backup_dir}/refs-before.tsv"

  echo "CLEAN ${repository}: removed ${legacy_count} legacy commit(s), branch-tip trees preserved"
  rm -rf "${repository_dir}"
  return 0
}

TOTAL=0
CLEANED=0
SKIPPED=0
DRY_FOUND=0
FAILURES=()

while IFS=$'\t' read -r repository archived; do
  repository_selected "${repository}" || continue
  TOTAL=$((TOTAL + 1))
  set +e
  process_repository "${repository}" "${archived}"
  status=$?
  set -e
  case "${status}" in
    0) CLEANED=$((CLEANED + 1)) ;;
    2) SKIPPED=$((SKIPPED + 1)) ;;
    3) DRY_FOUND=$((DRY_FOUND + 1)) ;;
    *) FAILURES+=("${repository}") ;;
  esac
done < <(
  gh api --paginate "user/repos?per_page=100&visibility=all&affiliation=owner&sort=created&direction=asc" \
    | jq -r --arg owner "${OWNER}" '
        .[]
        | select(.owner.login == $owner)
        | select(.disabled == false and .default_branch != null)
        | [.name, .archived] | @tsv
      '
)

echo "Summary: total=${TOTAL} cleaned=${CLEANED} skipped=${SKIPPED} dry_found=${DRY_FOUND} failures=${#FAILURES[@]}"
echo "Pre-rewrite ref snapshots: ${BACKUP_ROOT}"

if [[ "${#FAILURES[@]}" -gt 0 ]]; then
  printf 'Failed repositories: %s\n' "${FAILURES[*]}" >&2
  exit 1
fi
