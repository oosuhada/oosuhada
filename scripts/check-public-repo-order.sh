#!/usr/bin/env bash

set -euo pipefail

OWNER="${GITHUB_REPOSITORY_OWNER:-oosuhada}"
PROFILE_REPOSITORY="${PROFILE_REPOSITORY:-${OWNER}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORDER_FILE="${ORDER_FILE:-${SCRIPT_DIR}/repository-display-order.txt}"
MAX_MISMATCHES="${MAX_MISMATCHES:-12}"

command -v gh >/dev/null 2>&1 || { echo "gh CLI is required." >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "jq is required." >&2; exit 2; }
[[ -f "${ORDER_FILE}" ]] || { echo "Repository order file not found: ${ORDER_FILE}" >&2; exit 2; }

REPOSITORY_JSON="$(mktemp)"
trap 'rm -f "${REPOSITORY_JSON}"' EXIT

if ! gh api --paginate "user/repos?per_page=100&visibility=all&affiliation=owner" \
  | jq -s --arg owner "${OWNER}" '
      add
      | map(
          select(
            .owner.login == $owner
            and .disabled == false
            and .default_branch != null
          )
        )
    ' > "${REPOSITORY_JSON}"; then
  echo "Unable to load repository metadata for ${OWNER}." >&2
  exit 2
fi

ALL_REPOSITORIES=()
PROFILE_FOUND=false
while IFS= read -r ROW; do
  [[ -z "${ROW}" ]] && continue
  IFS=$'\t' read -r CREATED_AT REPOSITORY_NAME PUSHED_AT <<< "${ROW}"
  if [[ "${REPOSITORY_NAME}" == "${PROFILE_REPOSITORY}" ]]; then
    PROFILE_FOUND=true
    continue
  fi
  ALL_REPOSITORIES+=("${ROW}")
done < <(
  jq -r '
    sort_by(.created_at, .name)
    | .[]
    | [.created_at, .name, (.pushed_at // "")] | @tsv
  ' "${REPOSITORY_JSON}"
)

FIXED_DISPLAY_ORDER=()
while IFS= read -r REPOSITORY_NAME; do
  [[ -z "${REPOSITORY_NAME}" || "${REPOSITORY_NAME}" == \#* ]] && continue
  FIXED_DISPLAY_ORDER+=("${REPOSITORY_NAME}")
done < "${ORDER_FILE}"

repository_exists() {
  local TARGET_NAME="$1"
  local ROW
  local ROW_CREATED_AT
  local ROW_NAME
  local ROW_PUSHED_AT

  for ROW in "${ALL_REPOSITORIES[@]}"; do
    IFS=$'\t' read -r ROW_CREATED_AT ROW_NAME ROW_PUSHED_AT <<< "${ROW}"
    [[ "${ROW_NAME}" == "${TARGET_NAME}" ]] && return 0
  done
  return 1
}

is_fixed_repository() {
  local TARGET_NAME="$1"
  local FIXED_NAME

  for FIXED_NAME in "${FIXED_DISPLAY_ORDER[@]}"; do
    [[ "${FIXED_NAME}" == "${TARGET_NAME}" ]] && return 0
  done
  return 1
}

EXPECTED_ORDER=()
[[ "${PROFILE_FOUND}" == true ]] && EXPECTED_ORDER+=("${PROFILE_REPOSITORY}")

# Unlisted repositories are pushed oldest -> newest, so the GitHub display should show
# them newest -> oldest directly below the profile repository.
for ((INDEX=${#ALL_REPOSITORIES[@]}-1; INDEX>=0; INDEX--)); do
  IFS=$'\t' read -r ROW_CREATED_AT ROW_NAME ROW_PUSHED_AT <<< "${ALL_REPOSITORIES[${INDEX}]}"
  if ! is_fixed_repository "${ROW_NAME}"; then
    EXPECTED_ORDER+=("${ROW_NAME}")
  fi
done

# Fixed repositories should appear exactly in the order declared by the snapshot file.
for REPOSITORY_NAME in "${FIXED_DISPLAY_ORDER[@]}"; do
  if repository_exists "${REPOSITORY_NAME}"; then
    EXPECTED_ORDER+=("${REPOSITORY_NAME}")
  fi
done

ACTUAL_ORDER=()
while IFS= read -r REPOSITORY_NAME; do
  [[ -n "${REPOSITORY_NAME}" ]] && ACTUAL_ORDER+=("${REPOSITORY_NAME}")
done < <(
  jq -r '
    sort_by([(.pushed_at // ""), .name])
    | reverse
    | .[].name
  ' "${REPOSITORY_JSON}"
)

if [[ "${#EXPECTED_ORDER[@]}" -ne "${#ACTUAL_ORDER[@]}" ]]; then
  echo "Repository order drift detected: expected ${#EXPECTED_ORDER[@]} repositories, found ${#ACTUAL_ORDER[@]}." >&2
  exit 1
fi

MISMATCH_COUNT=0
for ((INDEX=0; INDEX<${#EXPECTED_ORDER[@]}; INDEX++)); do
  if [[ "${EXPECTED_ORDER[${INDEX}]}" != "${ACTUAL_ORDER[${INDEX}]}" ]]; then
    MISMATCH_COUNT=$((MISMATCH_COUNT + 1))
    if [[ "${MISMATCH_COUNT}" -le "${MAX_MISMATCHES}" ]]; then
      printf 'Mismatch #%d at display position %d: expected %s, actual %s\n' \
        "${MISMATCH_COUNT}" \
        "$((INDEX + 1))" \
        "${EXPECTED_ORDER[${INDEX}]}" \
        "${ACTUAL_ORDER[${INDEX}]}" >&2
    fi
  fi
done

if [[ "${MISMATCH_COUNT}" -gt 0 ]]; then
  if [[ "${MISMATCH_COUNT}" -gt "${MAX_MISMATCHES}" ]]; then
    echo "... plus $((MISMATCH_COUNT - MAX_MISMATCHES)) additional mismatches." >&2
  fi
  echo "Repository order drift detected across ${MISMATCH_COUNT} display positions." >&2
  exit 1
fi

echo "Repository display order is current across ${#EXPECTED_ORDER[@]} repositories."
