#!/usr/bin/env bash

# 오류, 미정의 변수, 파이프라인 중간 실패를 즉시 감지한다.
set -euo pipefail

# Actions에서는 저장소 소유자를 자동 사용하고, 로컬 실행에서는 oosuhada를 기본값으로 사용한다.
OWNER="${GITHUB_REPOSITORY_OWNER:-oosuhada}"
# GitHub의 pushed_at 초 단위 정렬이 겹치지 않도록 저장소 사이 기본 간격을 3초로 둔다.
PUSH_DELAY_SECONDS="${PUSH_DELAY_SECONDS:-3}"
# DRY_RUN=1이면 실제 fetch/commit/push 없이 정렬 대상과 순서만 검증한다.
DRY_RUN="${DRY_RUN:-0}"
# 중간 실패 후 이어서 실행할 때 사용할 시작 순번이며 일반 일일 실행은 항상 1부터 시작한다.
START_INDEX="${START_INDEX:-1}"
# 프로필 README 저장소는 GitHub 목록에서 항상 가장 위에 보이도록 마지막에 push한다.
PROFILE_REPOSITORY="${PROFILE_REPOSITORY:-${OWNER}}"
# 고정 저장소 표시 순서는 스크립트와 같은 디렉터리의 텍스트 파일에서 읽는다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORDER_FILE="${ORDER_FILE:-${SCRIPT_DIR}/repository-display-order.txt}"
# 자동 커밋의 작성자 이름을 GitHub 계정과 일치시킨다.
GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Oosu}"
# 자동 커밋의 작성자 이메일을 GitHub 계정에 연결된 noreply 주소로 고정한다.
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-185910926+oosuhada@users.noreply.github.com}"
# 매일 생성되는 empty commit임을 명확히 하고 일반 push CI 연쇄 실행을 줄이기 위해 skip-ci 표식을 사용한다.
COMMIT_MESSAGE="${COMMIT_MESSAGE:-chore: preserve repository creation order [skip ci]}"

# 필수 CLI가 runner 또는 로컬 환경에 존재하는지 먼저 확인한다.
command -v gh >/dev/null 2>&1 || { echo "gh CLI is required." >&2; exit 1; }
# authenticated API 결과에서 public + private 예외를 안전하게 필터링하기 위해 jq를 사용한다.
command -v jq >/dev/null 2>&1 || { echo "jq is required." >&2; exit 1; }
[[ -f "${ORDER_FILE}" ]] || { echo "Repository order file not found: ${ORDER_FILE}" >&2; exit 1; }
# 실제 push 모드에서는 git CLI도 반드시 필요하다.
if [[ "${DRY_RUN}" != "1" ]]; then
  command -v git >/dev/null 2>&1 || { echo "git CLI is required." >&2; exit 1; }
fi

# GH_TOKEN이 주입된 Actions 환경에서도 git clone/push가 같은 인증을 사용하도록 credential helper를 연결한다.
if [[ -n "${GH_TOKEN:-}" && "${DRY_RUN}" != "1" ]]; then
  gh auth setup-git >/dev/null
fi

# 임시 clone 디렉터리를 만들고 workflow 종료 시 항상 정리한다.
WORK_ROOT="$(mktemp -d)"
# 정상 종료와 오류 종료 모두에서 임시 디렉터리를 제거한다.
trap 'rm -rf "${WORK_ROOT}"' EXIT

# owner 본인 소유 저장소를 visibility와 fork 여부에 관계없이 가져온다.
# archived 저장소는 실제 push 직전에만 잠시 unarchive하고 즉시 원상 복구한다.
ALL_REPOSITORIES=()
PROFILE_REPOSITORY_ROW=""
while IFS= read -r REPOSITORY_ROW; do
  if [[ -n "${REPOSITORY_ROW}" ]]; then
    IFS=$'\t' read -r ROW_CREATED_AT REPOSITORY_NAME ROW_DEFAULT_BRANCH ROW_ARCHIVED <<< "${REPOSITORY_ROW}"
    if [[ "${REPOSITORY_NAME}" == "${PROFILE_REPOSITORY}" ]]; then
      PROFILE_REPOSITORY_ROW="${REPOSITORY_ROW}"
    else
      ALL_REPOSITORIES+=("${REPOSITORY_ROW}")
    fi
  fi
done < <(
  gh api --paginate "user/repos?per_page=100&visibility=all&affiliation=owner&sort=created&direction=asc" \
    | jq -r --arg owner "${OWNER}" '
        .[] as $repo
        | $repo
        | select(.owner.login == $owner)
        | select(.disabled == false and .default_branch != null)
        | [.created_at, .name, .default_branch, .archived] | @tsv
      ' \
    | LC_ALL=C sort -t $'\t' -k1,1 -k2,2
)

# 우선순위 파일을 GitHub 화면에 보일 정방향 배열로 읽는다.
FIXED_DISPLAY_ORDER=()
while IFS= read -r REPOSITORY_NAME; do
  [[ -z "${REPOSITORY_NAME}" || "${REPOSITORY_NAME}" == \#* ]] && continue
  FIXED_DISPLAY_ORDER+=("${REPOSITORY_NAME}")
done < "${ORDER_FILE}"

# 이름에 해당하는 API 행을 stdout으로 반환한다.
repository_row_for_name() {
  local TARGET_NAME="$1"
  local ROW
  local ROW_CREATED_AT
  local ROW_NAME
  local ROW_DEFAULT_BRANCH
  local ROW_ARCHIVED
  for ROW in "${ALL_REPOSITORIES[@]}"; do
    IFS=$'\t' read -r ROW_CREATED_AT ROW_NAME ROW_DEFAULT_BRANCH ROW_ARCHIVED <<< "${ROW}"
    if [[ "${ROW_NAME}" == "${TARGET_NAME}" ]]; then
      printf '%s\n' "${ROW}"
      return 0
    fi
  done
  return 1
}

# 저장소가 고정 목록에 포함되는지 확인한다.
is_fixed_repository() {
  local TARGET_NAME="$1"
  local FIXED_NAME
  for FIXED_NAME in "${FIXED_DISPLAY_ORDER[@]}"; do
    [[ "${FIXED_NAME}" == "${TARGET_NAME}" ]] && return 0
  done
  return 1
}

# GitHub 화면은 최신 push가 위에 오므로 고정 표시 순서를 역순으로 처리한다.
REPOSITORIES=()
for ((ORDER_INDEX=${#FIXED_DISPLAY_ORDER[@]}-1; ORDER_INDEX>=0; ORDER_INDEX--)); do
  REPOSITORY_NAME="${FIXED_DISPLAY_ORDER[${ORDER_INDEX}]}"
  if REPOSITORY_ROW="$(repository_row_for_name "${REPOSITORY_NAME}")"; then
    REPOSITORIES+=("${REPOSITORY_ROW}")
  else
    echo "Warning: fixed repository not found or unavailable: ${REPOSITORY_NAME}" >&2
  fi
done

# 목록에 없는 신규 저장소는 오래된 것부터 push한다. 화면에서는 최신 신규 저장소가 2번이 된다.
for REPOSITORY_ROW in "${ALL_REPOSITORIES[@]}"; do
  IFS=$'\t' read -r ROW_CREATED_AT REPOSITORY_NAME ROW_DEFAULT_BRANCH ROW_ARCHIVED <<< "${REPOSITORY_ROW}"
  if ! is_fixed_repository "${REPOSITORY_NAME}"; then
    REPOSITORIES+=("${REPOSITORY_ROW}")
  fi
done

# 프로필 저장소는 무조건 마지막에 push해 화면 1번을 유지한다.
[[ -n "${PROFILE_REPOSITORY_ROW}" ]] && REPOSITORIES+=("${PROFILE_REPOSITORY_ROW}")

# 대상이 하나도 없으면 오류가 아니라 정상적인 no-op으로 종료한다.
if [[ "${#REPOSITORIES[@]}" -eq 0 ]]; then
  echo "No eligible public or explicitly included private repositories found for ${OWNER}."
  exit 0
fi

# 실제 실행 전에 총 대상 수와 정렬 기준을 로그에 남긴다.
echo "Found ${#REPOSITORIES[@]} eligible repositories for ${OWNER}."
echo "Push order: reverse fixed display order -> unlisted repositories oldest to newest -> profile repository last."

# 실패한 저장소를 모아서 중간 한 건의 실패가 나머지 정렬 작업을 막지 않도록 한다.
FAILURES=()
# 처리 순서를 로그에 사람이 읽기 쉽게 표시하기 위한 카운터다.
INDEX=0

# 생성일 오름차순으로 저장소를 하나씩 처리한다.
for ROW in "${REPOSITORIES[@]}"; do
  # 현재 처리 순번을 증가시킨다.
  INDEX=$((INDEX + 1))
  # TSV 한 줄에서 생성일, 저장소 이름, default branch, archived 상태를 분리한다.
  IFS=$'\t' read -r CREATED_AT REPOSITORY DEFAULT_BRANCH IS_ARCHIVED <<< "${ROW}"
  # 현재 저장소와 전체 진행률을 로그에 표시한다.
  printf '[%02d/%02d] %s | %s | %s\n' "${INDEX}" "${#REPOSITORIES[@]}" "${CREATED_AT}" "${REPOSITORY}" "${DEFAULT_BRANCH}"

  # 복구 실행에서는 이미 성공한 앞쪽 저장소를 건너뛰어 같은 날 중복 empty commit이 생기지 않게 한다.
  if [[ "${INDEX}" -lt "${START_INDEX}" ]]; then
    echo "Skipping already completed repository at index ${INDEX}."
    continue
  fi

  # dry-run에서는 순서만 확인하고 GitHub 저장소에는 아무 변경도 만들지 않는다.
  if [[ "${DRY_RUN}" == "1" ]]; then
    continue
  fi

  # 저장소마다 독립된 임시 Git 디렉터리를 사용한다.
  REPOSITORY_DIR="${WORK_ROOT}/${REPOSITORY}"
  # 실제 파일 checkout 없이 commit/tree 객체만 다루기 위해 빈 Git 저장소를 초기화한다.
  mkdir -p "${REPOSITORY_DIR}"
  # 조용한 모드로 로컬 Git 메타데이터만 만든다.
  git -C "${REPOSITORY_DIR}" init --quiet
  # 현재 owner 저장소를 origin으로 등록한다.
  git -C "${REPOSITORY_DIR}" remote add origin "https://github.com/${OWNER}/${REPOSITORY}.git"
  # 새 commit의 author/committer를 GitHub 계정에 연결된 정보로 설정한다.
  git -C "${REPOSITORY_DIR}" config user.name "${GIT_AUTHOR_NAME}"
  # noreply 이메일을 사용해 GitHub contribution 연결을 유지한다.
  git -C "${REPOSITORY_DIR}" config user.email "${GIT_AUTHOR_EMAIL}"

  # 최신 default-branch commit과 tree만 가져오고 blob 파일은 내려받지 않아 대형 저장소도 빠르게 처리한다.
  HAS_PARENT=true
  if ! git -C "${REPOSITORY_DIR}" fetch --quiet --depth 1 --filter=blob:none origin "refs/heads/${DEFAULT_BRANCH}"; then
    # GitHub가 default branch 이름만 갖고 있지만 아직 첫 commit이 없는 빈 저장소는 루트 commit을 만든다.
    REPOSITORY_SIZE="$(gh api "repos/${OWNER}/${REPOSITORY}" --jq '.size')"
    if [[ "${REPOSITORY_SIZE}" == "0" ]]; then
      HAS_PARENT=false
      echo "No remote branch found; creating the initial empty commit for ${REPOSITORY}."
    else
      echo "Fetch failed: ${REPOSITORY}" >&2
      FAILURES+=("${REPOSITORY}:fetch")
      rm -rf "${REPOSITORY_DIR}"
      continue
    fi
  fi

  if [[ "${HAS_PARENT}" == "true" ]]; then
    # 원격 default branch의 현재 최신 commit과 동일한 tree를 재사용한다.
    PARENT_COMMIT="$(git -C "${REPOSITORY_DIR}" rev-parse FETCH_HEAD)"
    PARENT_TREE="$(git -C "${REPOSITORY_DIR}" show -s --format=%T "${PARENT_COMMIT}")"
    NEW_COMMIT="$(printf '%s\n' "${COMMIT_MESSAGE}" | git -C "${REPOSITORY_DIR}" commit-tree "${PARENT_TREE}" -p "${PARENT_COMMIT}")" || NEW_COMMIT=""
  else
    # 완전히 빈 저장소에는 빈 tree를 가진 최초 root commit을 만든다.
    PARENT_TREE="$(git -C "${REPOSITORY_DIR}" mktree </dev/null)"
    NEW_COMMIT="$(printf '%s\n' "${COMMIT_MESSAGE}" | git -C "${REPOSITORY_DIR}" commit-tree "${PARENT_TREE}")" || NEW_COMMIT=""
  fi

  if [[ -z "${NEW_COMMIT}" ]]; then
    echo "Commit creation failed: ${REPOSITORY}" >&2
    FAILURES+=("${REPOSITORY}:commit")
    rm -rf "${REPOSITORY_DIR}"
    continue
  fi

  # archived 저장소는 push가 차단되므로 처리 순간에만 잠시 unarchive한다.
  if [[ "${IS_ARCHIVED}" == "true" ]]; then
    if ! gh api --method PATCH "repos/${OWNER}/${REPOSITORY}" -F archived=false >/dev/null; then
      echo "Unarchive failed: ${REPOSITORY}" >&2
      FAILURES+=("${REPOSITORY}:unarchive")
      rm -rf "${REPOSITORY_DIR}"
      continue
    fi
  fi

  # 새 empty commit SHA를 해당 저장소의 실제 default branch로 직접 push해 pushed_at을 갱신한다.
  if ! git -C "${REPOSITORY_DIR}" push --quiet origin "${NEW_COMMIT}:refs/heads/${DEFAULT_BRANCH}"; then
    echo "Push failed: ${REPOSITORY}" >&2
    FAILURES+=("${REPOSITORY}:push")
    [[ "${IS_ARCHIVED}" == "true" ]] && gh api --method PATCH "repos/${OWNER}/${REPOSITORY}" -F archived=true >/dev/null || true
    rm -rf "${REPOSITORY_DIR}"
    continue
  fi

  # 원래 archived였던 저장소는 성공 직후 다시 archived 상태로 돌린다.
  if [[ "${IS_ARCHIVED}" == "true" ]]; then
    if ! gh api --method PATCH "repos/${OWNER}/${REPOSITORY}" -F archived=true >/dev/null; then
      echo "Re-archive failed: ${REPOSITORY}" >&2
      FAILURES+=("${REPOSITORY}:rearchive")
    fi
  fi

  # 성공한 저장소의 임시 clone을 즉시 지워 runner 디스크 사용량을 최소화한다.
  rm -rf "${REPOSITORY_DIR}"

  # 마지막 저장소가 아니라면 pushed_at 초 단위가 겹치지 않도록 다음 push 전에 잠시 기다린다.
  if [[ "${INDEX}" -lt "${#REPOSITORIES[@]}" ]]; then
    sleep "${PUSH_DELAY_SECONDS}"
  fi
done

# dry-run은 정렬 검증만 수행했으므로 성공 메시지를 남기고 종료한다.
if [[ "${DRY_RUN}" == "1" ]]; then
  echo "Dry run completed without modifying repositories."
  exit 0
fi

# 일부 저장소가 실패했어도 끝까지 처리한 뒤 실패 목록 전체를 한 번에 보고한다.
if [[ "${#FAILURES[@]}" -gt 0 ]]; then
  printf 'Repository ordering completed with %d failure(s): %s\n' "${#FAILURES[@]}" "${FAILURES[*]}" >&2
  exit 1
fi

# 모든 public 저장소의 push가 생성일 순서대로 성공했음을 명시한다.
echo "Repository ordering completed successfully for all ${#REPOSITORIES[@]} repositories."
