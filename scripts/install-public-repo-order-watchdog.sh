#!/usr/bin/env bash

set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="${HOME}/.local/share/oosuhada-repo-order-watchdog"
LAUNCH_AGENT="${HOME}/Library/LaunchAgents/com.oosu.public-repo-order-watchdog.plist"
DOMAIN="gui/$(id -u)"
LABEL="com.oosu.public-repo-order-watchdog"

command -v plutil >/dev/null 2>&1 || { echo "plutil is required." >&2; exit 1; }
command -v launchctl >/dev/null 2>&1 || { echo "launchctl is required." >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "gh CLI is required." >&2; exit 1; }

gh auth status >/dev/null 2>&1 || { echo "gh CLI must be authenticated before installing the watchdog." >&2; exit 1; }

mkdir -p "${INSTALL_ROOT}" "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs"
install -m 0755 "${SOURCE_ROOT}/scripts/refresh-public-repo-order.sh" "${INSTALL_ROOT}/refresh-public-repo-order.sh"
install -m 0755 "${SOURCE_ROOT}/scripts/check-public-repo-order.sh" "${INSTALL_ROOT}/check-public-repo-order.sh"
install -m 0755 "${SOURCE_ROOT}/scripts/watch-public-repo-order.sh" "${INSTALL_ROOT}/watch-public-repo-order.sh"
install -m 0644 "${SOURCE_ROOT}/scripts/repository-display-order.txt" "${INSTALL_ROOT}/repository-display-order.txt"

sed "s|__HOME__|${HOME}|g" \
  "${SOURCE_ROOT}/automation/com.oosu.public-repo-order-watchdog.plist" \
  > "${LAUNCH_AGENT}"
chmod 0644 "${LAUNCH_AGENT}"

plutil -lint "${LAUNCH_AGENT}"
launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true

BOOTSTRAPPED=false
for _ in {1..20}; do
  if launchctl bootstrap "${DOMAIN}" "${LAUNCH_AGENT}" 2>/dev/null; then
    BOOTSTRAPPED=true
    break
  fi
  sleep 0.25
done

if [[ "${BOOTSTRAPPED}" != true ]]; then
  echo "Unable to bootstrap ${LABEL}." >&2
  launchctl bootstrap "${DOMAIN}" "${LAUNCH_AGENT}"
  exit 1
fi

launchctl enable "${DOMAIN}/${LABEL}"

echo "Installed ${LABEL}; checks run at 05:43, 13:43, and 21:43 local time, plus once at login after 05:00."
