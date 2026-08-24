#!/usr/bin/env bash

# 오류, 미정의 변수, 파이프라인 중간 실패를 즉시 감지한다.
set -euo pipefail

# Actions에서는 저장소 소유자를 자동 사용하고, 로컬 실행에서는 oosuhada를 기본값으로 사용한다.
OWNER="${GITHUB_REPOSITORY_OWNER:-oosuhada}"
# GitHub의 pushed_at 초 단위 정렬이 겹치지 않도록 저장소 사이 기본 간격을 3초로 둔다.
PUSH_DELAY_SECONDS="${PUSH_DELAY_SECONDS:-3}"
# DRY_RUN=1이면 실제 clone/commit/push 없이 정렬 대상과 순서만 검증한다.
DRY_RUN="${DRY_RUN:-0}"
# 자동 커밋의 작성자 이름을 GitHub 계정과 일치시킨다.
GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Oosu}"
# 자동 커밋의 작성자 이메일을 GitHub 계정에 연결된 noreply 주소로 고정한다.
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-185910926+oosuhada@users.noreply.github.com}"
# 매일 생성되는 empty commit임을 명확히 하고 일반 push CI 연쇄 실행을 줄이기 위해 skip-ci 표식을 사용한다.
COMMIT_MESSAGE="${COMMIT_MESSAGE:-chore: preserve repository creation order [skip ci]}"

# 필수 CLI가 runner 또는 로컬 환경에 존재하는지 먼저 확인한다.
command -v gh >/dev/null 2>&1 || { echo "gh CLI is required." >&2; exit 1; }
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

# public + owner 본인 소유 + non-archived + non-fork + non-disabled + default branch 존재 조건만 선택한다.
# macOS 기본 Bash 3.2에서도 동작하도록 mapfile 대신 while read로 배열을 채운다.
REPOSITORIES=()
# API의 created 정렬에 더해 로컬 sort를 한 번 더 적용해 실행 순서를 결정적으로 유지한다.
while IFS= read -r REPOSITORY_ROW; do
  # 빈 줄은 배열에 넣지 않아 잘못된 저장소 처리 시도를 방지한다.
  [[ -n "${REPOSITORY_ROW}" ]] && REPOSITORIES+=("${REPOSITORY_ROW}")
done < <(
  gh api --paginate "users/${OWNER}/repos?per_page=100&type=owner&sort=created&direction=asc" \
    --jq '.[] | select(.private == false and .archived == false and .fork == false and .disabled == false and .default_branch != null) | [.created_at, .name, .default_branch] | @tsv' \
    | LC_ALL=C sort -t $'\t' -k1,1 -k2,2
)

# 대상이 하나도 없으면 오류가 아니라 정상적인 no-op으로 종료한다.
if [[ "${#REPOSITORIES[@]}" -eq 0 ]]; then
  echo "No eligible public repositories found for ${OWNER}."
  exit 0
fi

# 실제 실행 전에 총 대상 수와 정렬 기준을 로그에 남긴다.
echo "Found ${#REPOSITORIES[@]} eligible public repositories for ${OWNER}."
# 가장 오래된 저장소부터 push해야 가장 최근 생성 저장소가 마지막 pushed_at을 갖는다.
echo "Push order: oldest created_at -> newest created_at."

# 실패한 저장소를 모아서 중간 한 건의 실패가 나머지 정렬 작업을 막지 않도록 한다.
FAILURES=()
# 처리 순서를 로그에 사람이 읽기 쉽게 표시하기 위한 카운터다.
INDEX=0

# 생성일 오름차순으로 저장소를 하나씩 처리한다.
for ROW in "${REPOSITORIES[@]}"; do
  # 현재 처리 순번을 증가시킨다.
  INDEX=$((INDEX + 1))
  # TSV 한 줄에서 생성일, 저장소 이름, default branch를 분리한다.
  IFS=$'\t' read -r CREATED_AT REPOSITORY DEFAULT_BRANCH <<< "${ROW}"
  # 현재 저장소와 전체 진행률을 Actions 로그에 표시한다.
  printf '[%02d/%02d] %s | %s | %s\n' "${INDEX}" "${#REPOSITORIES[@]}" "${CREATED_AT}" "${REPOSITORY}" "${DEFAULT_BRANCH}"

  # dry-run에서는 순서만 확인하고 GitHub 저장소에는 아무 변경도 만들지 않는다.
  if [[ "${DRY_RUN}" == "1" ]]; then
    continue
  fi

  # 저장소마다 독립된 임시 clone 경로를 사용한다.
  REPOSITORY_DIR="${WORK_ROOT}/${REPOSITORY}"
  # 전체 이력을 받을 필요가 없으므로 default branch의 최신 커밋 한 개만 shallow clone 한다.
  if ! git clone --quiet --depth 1 --single-branch --branch "${DEFAULT_BRANCH}" "https://github.com/${OWNER}/${REPOSITORY}.git" "${REPOSITORY_DIR}"; then
    echo "Clone failed: ${REPOSITORY}" >&2
    FAILURES+=("${REPOSITORY}:clone")
    continue
  fi

  # empty commit도 GitHub 계정에 정상 귀속되도록 저장소별 작성자 이름을 설정한다.
  git -C "${REPOSITORY_DIR}" config user.name "${GIT_AUTHOR_NAME}"
  # empty commit도 GitHub 계정에 정상 귀속되도록 저장소별 noreply 이메일을 설정한다.
  git -C "${REPOSITORY_DIR}" config user.email "${GIT_AUTHOR_EMAIL}"

  # 파일을 수정하지 않고 순서 보정용 empty commit 한 개만 생성한다.
  if ! git -C "${REPOSITORY_DIR}" commit --quiet --allow-empty -m "${COMMIT_MESSAGE}"; then
    echo "Commit failed: ${REPOSITORY}" >&2
    FAILURES+=("${REPOSITORY}:commit")
    rm -rf "${REPOSITORY_DIR}"
    continue
  fi

  # 현재 HEAD를 해당 저장소의 default branch로 직접 push해 pushed_at을 갱신한다.
  if ! git -C "${REPOSITORY_DIR}" push --quiet origin "HEAD:${DEFAULT_BRANCH}"; then
    echo "Push failed: ${REPOSITORY}" >&2
    FAILURES+=("${REPOSITORY}:push")
    rm -rf "${REPOSITORY_DIR}"
    continue
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
