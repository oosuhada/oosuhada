#!/usr/bin/env bash

set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="${HOME}/.local/share/oosuhada-repo-order"
LAUNCH_AGENT="${HOME}/Library/LaunchAgents/com.oosu.public-repo-order.plist"
DOMAIN="gui/$(id -u)"
LABEL="com.oosu.public-repo-order"

command -v plutil >/dev/null 2>&1 || { echo "plutil is required." >&2; exit 1; }
command -v launchctl >/dev/null 2>&1 || { echo "launchctl is required." >&2; exit 1; }

mkdir -p "${INSTALL_ROOT}" "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs"
install -m 0755 "${SOURCE_ROOT}/scripts/refresh-public-repo-order.sh" "${INSTALL_ROOT}/refresh-public-repo-order.sh"
install -m 0644 "${SOURCE_ROOT}/scripts/repository-display-order.txt" "${INSTALL_ROOT}/repository-display-order.txt"
install -m 0644 "${SOURCE_ROOT}/automation/com.oosu.public-repo-order.plist" "${LAUNCH_AGENT}"

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

echo "Installed ${LABEL}; next scheduled run is daily at 04:17 local time."
