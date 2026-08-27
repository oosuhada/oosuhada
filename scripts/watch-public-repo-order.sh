#!/usr/bin/env bash

set -euo pipefail

OWNER="${GITHUB_REPOSITORY_OWNER:-oosuhada}"
PROFILE_REPOSITORY="${PROFILE_REPOSITORY:-${OWNER}}"
WATCH_TIMEZONE="${WATCH_TIMEZONE:-Asia/Seoul}"
MIN_LOCAL_HOUR="${MIN_LOCAL_HOUR:-5}"
RECOVERY_GRACE_SECONDS="${RECOVERY_GRACE_SECONDS:-420}"
PRIMARY_STALE_SECONDS="${PRIMARY_STALE_SECONDS:-1800}"
GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Repository Order Bot}"
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-repo-order-bot@users.noreply.github.com}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-chore: preserve repository creation order [skip ci]}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REFRESH_SCRIPT="${SCRIPT_DIR}/refresh-public-repo-order.sh"
CHECK_SCRIPT="${SCRIPT_DIR}/check-public-repo-order.sh"
ORDER_FILE="${ORDER_FILE:-${SCRIPT_DIR}/repository-display-order.txt}"
LOCK_ROOT="${TMPDIR:-/tmp}/com.oosu.public-repo-order-watchdog.lock"

command -v gh >/dev/null 2>&1 || { echo "gh CLI is required." >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "jq is required." >&2; exit 2; }
command -v git >/dev/null 2>&1 || { echo "git CLI is required." >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required." >&2; exit 2; }

CURRENT_HOUR="$(TZ="${WATCH_TIMEZONE}" date +%H)"
CURRENT_HOUR="${CURRENT_HOUR#0}"
[[ -n "${CURRENT_HOUR}" ]] || CURRENT_HOUR=0
if [[ "${CURRENT_HOUR}" -lt "${MIN_LOCAL_HOUR}" ]]; then
  echo "Repository-order watchdog is idle before ${MIN_LOCAL_HOUR}:00 ${WATCH_TIMEZONE}."
  exit 0
fi

acquire_lock() {
  if mkdir "${LOCK_ROOT}" 2>/dev/null; then
    printf '%s\n' "$$" > "${LOCK_ROOT}/pid"
    return 0
  fi

  if [[ -f "${LOCK_ROOT}/pid" ]]; then
    EXISTING_PID="$(cat "${LOCK_ROOT}/pid" 2>/dev/null || true)"
    if [[ -n "${EXISTING_PID}" ]] && kill -0 "${EXISTING_PID}" 2>/dev/null; then
      echo "Repository-order watchdog is already running as PID ${EXISTING_PID}; skipping duplicate invocation."
      return 1
    fi
  fi

  rm -rf "${LOCK_ROOT}"
  mkdir "${LOCK_ROOT}"
  printf '%s\n' "$$" > "${LOCK_ROOT}/pid"
}

if ! acquire_lock; then
  exit 0
fi
trap 'rm -rf "${LOCK_ROOT}"' EXIT

sync_runtime_file() {
  local REMOTE_PATH="$1"
  local LOCAL_PATH="$2"
  local MODE="$3"
  local TEMP_PATH="${LOCAL_PATH}.tmp.$$"

  if gh api \
    -H "Accept: application/vnd.github.raw+json" \
    "repos/${OWNER}/${PROFILE_REPOSITORY}/contents/${REMOTE_PATH}?ref=main" \
    > "${TEMP_PATH}"; then
    chmod "${MODE}" "${TEMP_PATH}"
    mv "${TEMP_PATH}" "${LOCAL_PATH}"
  else
    rm -f "${TEMP_PATH}"
    if [[ ! -f "${LOCAL_PATH}" ]]; then
      echo "Unable to sync required runtime file ${REMOTE_PATH}." >&2
      return 1
    fi
    echo "Warning: unable to update ${REMOTE_PATH}; using the last installed copy." >&2
  fi
}

sync_runtime() {
  sync_runtime_file "scripts/refresh-public-repo-order.sh" "${REFRESH_SCRIPT}" 0755
  sync_runtime_file "scripts/check-public-repo-order.sh" "${CHECK_SCRIPT}" 0755
  sync_runtime_file "scripts/repository-display-order.txt" "${ORDER_FILE}" 0644
}

first_push_repository() {
  local FIXED_REPOSITORIES=()
  local REPOSITORY_NAME
  local INDEX

  while IFS= read -r REPOSITORY_NAME; do
    [[ -z "${REPOSITORY_NAME}" || "${REPOSITORY_NAME}" == \#* ]] && continue
    FIXED_REPOSITORIES+=("${REPOSITORY_NAME}")
  done < "${ORDER_FILE}"

  for ((INDEX=${#FIXED_REPOSITORIES[@]}-1; INDEX>=0; INDEX--)); do
    REPOSITORY_NAME="${FIXED_REPOSITORIES[${INDEX}]}"
    if gh api "repos/${OWNER}/${REPOSITORY_NAME}" >/dev/null 2>&1; then
      printf '%s\n' "${REPOSITORY_NAME}"
      return 0
    fi
  done

  return 1
}

latest_order_bot_commit_date() {
  local REPOSITORY_NAME="$1"

  gh api "repos/${OWNER}/${REPOSITORY_NAME}/commits?per_page=100" \
    | jq -r \
      --arg email "${GIT_AUTHOR_EMAIL}" \
      --arg message "${COMMIT_MESSAGE}" '
        [
          .[]
          | select(
              (.commit.author.email == $email or .commit.committer.email == $email)
              and .commit.message == $message
            )
        ][0].commit.author.date // empty
      '
}

iso_to_epoch() {
  python3 - "$1" <<'PY'
from datetime import datetime
import sys

value = sys.argv[1]
print(int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()))
PY
}

primary_run_is_active() {
  local FIRST_REPOSITORY
  local START_DATE
  local COMPLETE_DATE
  local START_EPOCH
  local COMPLETE_EPOCH=0
  local NOW_EPOCH
  local AGE_SECONDS

  FIRST_REPOSITORY="$(first_push_repository)" || return 1
  START_DATE="$(latest_order_bot_commit_date "${FIRST_REPOSITORY}")"
  COMPLETE_DATE="$(latest_order_bot_commit_date "${PROFILE_REPOSITORY}")"

  [[ -n "${START_DATE}" ]] || return 1

  START_EPOCH="$(iso_to_epoch "${START_DATE}")"
  if [[ -n "${COMPLETE_DATE}" ]]; then
    COMPLETE_EPOCH="$(iso_to_epoch "${COMPLETE_DATE}")"
  fi

  if [[ "${START_EPOCH}" -le "${COMPLETE_EPOCH}" ]]; then
    return 1
  fi

  NOW_EPOCH="$(date +%s)"
  AGE_SECONDS=$((NOW_EPOCH - START_EPOCH))

  if [[ "${AGE_SECONDS}" -lt "${PRIMARY_STALE_SECONDS}" ]]; then
    echo "Primary repository-order run appears active: ${FIRST_REPOSITORY} started ${AGE_SECONDS}s ago and profile completion has not landed yet."
    return 0
  fi

  echo "Detected an incomplete repository-order run older than ${PRIMARY_STALE_SECONDS}s; fallback recovery is allowed."
  return 1
}

check_order() {
  local STATUS
  set +e
  ORDER_FILE="${ORDER_FILE}" \
    GITHUB_REPOSITORY_OWNER="${OWNER}" \
    PROFILE_REPOSITORY="${PROFILE_REPOSITORY}" \
    "${CHECK_SCRIPT}"
  STATUS=$?
  set -e

  if [[ "${STATUS}" -gt 1 ]]; then
    echo "Repository-order verification failed unexpectedly with status ${STATUS}; refusing recovery." >&2
    exit "${STATUS}"
  fi
  return "${STATUS}"
}

sync_runtime

if check_order; then
  echo "Repository-order watchdog found no drift; no recovery is needed."
  exit 0
fi

echo "Repository-order watchdog detected drift."

if primary_run_is_active; then
  echo "Deferring fallback writes while the primary runner is still within its active window."
  exit 0
fi

# If the MacBook Air primary runner woke late and is currently finishing a full 75+ repository
# refresh but has not pushed its first marker yet, give it a short window to become observable.
if [[ "${RECOVERY_GRACE_SECONDS}" -gt 0 ]]; then
  echo "Waiting ${RECOVERY_GRACE_SECONDS}s before recovery, then rechecking for a late primary run."
  sleep "${RECOVERY_GRACE_SECONDS}"
  sync_runtime
  if check_order; then
    echo "Repository order recovered during the grace period; fallback writes are unnecessary."
    exit 0
  fi
  if primary_run_is_active; then
    echo "Primary repository-order run became visible during the grace period; deferring fallback writes."
    exit 0
  fi
fi

echo "Repository order is still stale; starting fallback refresh."

ORDER_FILE="${ORDER_FILE}" \
GITHUB_REPOSITORY_OWNER="${OWNER}" \
PROFILE_REPOSITORY="${PROFILE_REPOSITORY}" \
PUSH_DELAY_SECONDS="${PUSH_DELAY_SECONDS:-3}" \
GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME}" \
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL}" \
COMMIT_MESSAGE="${COMMIT_MESSAGE}" \
"${REFRESH_SCRIPT}"

if ! check_order; then
  echo "Fallback refresh completed, but repository order is still stale." >&2
  exit 1
fi

echo "Repository-order watchdog successfully restored the configured display order."
