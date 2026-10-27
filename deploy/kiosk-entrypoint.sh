#!/bin/sh
set -eu

apk add --no-cache chromium dbus-x11 mosquitto-clients >/dev/null
mkdir -p /tmp/runtime-root
rm -f /tmp/kiosk-exit-requested

chromium-browser \
  --kiosk \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions \
  --disable-background-networking \
  --disable-sync \
  --noerrdialogs \
  --disable-translate \
  --disable-features=TranslateUI \
  --disable-infobars \
  --disable-notifications \
  --disable-popup-blocking \
  --disable-prompt-on-repost \
  --disable-gpu \
  --disable-software-rasterizer \
  --start-maximized \
  "${CHROME_URL:-http://localhost:5000}" &
chromium_pid=$!

(
  while :; do
    if mosquitto_sub -h mosquitto -t risecare/command/exit-kiosk -C 1 >/dev/null; then
      touch /tmp/kiosk-exit-requested
      kill "$chromium_pid" 2>/dev/null || true
      exit
    fi
    sleep 2
  done
) &
exit_listener_pid=$!

set +e
wait "$chromium_pid"
chromium_status=$?
set -e

if [ -f /tmp/kiosk-exit-requested ]; then
  wait "$exit_listener_pid" 2>/dev/null || true
  echo "Kiosk program exited; container remains idle until restarted."
  while :; do sleep 3600; done
fi

exit "$chromium_status"
