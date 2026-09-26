#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
  printf 'This activation helper must run as root.\n' >&2
  exit 1
fi
if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Usage: %s <40-character-commit-sha>\n' "$0" >&2
  exit 2
fi
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "istemerdeploy" ]]; then
  printf 'Activation is restricted to the staging deployment account.\n' >&2
  exit 1
fi

sha="$1"
staging_root=/srv/istemer-staging
releases="$staging_root/releases"
release="$releases/$sha"
active_link="$staging_root/active-release"
service=istemer-staging.service
dropin_dir=/etc/systemd/system/istemer-staging.service.d
dropin="$dropin_dir/50-managed-release.conf"
verify=/usr/local/libexec/istemer-staging-verify.py
lock=/run/lock/istemer-staging-activate.lock
previous_target=""
had_dropin=false
mutation_started=false
rollback_done=false
temp_link=""

exec 9>"$lock"
if ! flock -n 9; then
  printf 'Another i-STEMer staging activation is in progress.\n' >&2
  exit 1
fi

if [[ ! -d "$release" || -L "$release" ]]; then
  printf 'Release directory is missing or unsafe: %s\n' "$release" >&2
  exit 1
fi
if [[ "$(stat -c '%U' "$release")" != "istemerdeploy" ]]; then
  printf 'Release directory is not owned by istemerdeploy.\n' >&2
  exit 1
fi
if [[ ! -f "$verify" || -L "$verify" ]]; then
  printf 'Staging verifier is missing or unsafe.\n' >&2
  exit 1
fi
/usr/bin/python3 "$verify" --release "$release" --sha "$sha"

expected_dropin="$(printf '[Service]\nWorkingDirectory=\nWorkingDirectory=%s/active-release\nExecStart=\nExecStart=%s/runtime/node %s/active-release/apps/istemer-demo/.next/standalone/apps/istemer-demo/server.js\nReadWritePaths=\nReadWritePaths=%s/active-release' "$staging_root" "$staging_root" "$staging_root" "$staging_root")"
if [[ -L "$dropin_dir" || -L "$dropin" ]]; then
  printf 'Refusing to follow a symlink in the managed systemd drop-in path.\n' >&2
  exit 1
fi
if [[ -e "$dropin" ]]; then
  actual_dropin="$(<"$dropin")"
  if [[ "$actual_dropin" != "$expected_dropin" ]]; then
    printf 'Existing systemd drop-in differs from the managed staging configuration; refusing to overwrite it.\n' >&2
    exit 1
  fi
  had_dropin=true
fi
if [[ -e "$active_link" && ! -L "$active_link" ]]; then
  printf 'Refusing to replace a non-symlink active-release path.\n' >&2
  exit 1
fi
if [[ -L "$active_link" ]]; then
  previous_target="$(readlink -f "$active_link")"
  if [[ "$previous_target" != "$releases/"* || ! -d "$previous_target" ]]; then
    printf 'Existing active-release symlink points outside the staging releases directory.\n' >&2
    exit 1
  fi
fi
if [[ "$had_dropin" == true && -z "$previous_target" ]]; then
  printf 'Managed systemd drop-in exists without an active release symlink.\n' >&2
  exit 1
fi
if [[ "$had_dropin" == false && -n "$previous_target" ]]; then
  printf 'Active release symlink exists without the managed systemd drop-in.\n' >&2
  exit 1
fi

rollback() {
  local reason="$1"
  local restored=false
  trap - ERR HUP INT TERM
  set +e
  printf 'Activation failed (%s); restoring the previous staging release.\n' "$reason" >&2
  if [[ -n "$temp_link" ]]; then
    rm -f "$temp_link"
  fi
  if [[ -n "$previous_target" ]]; then
    local rollback_link="$staging_root/.active-release-rollback-$$"
    if ln -s "$previous_target" "$rollback_link" && mv -Tf "$rollback_link" "$active_link"; then
      restored=true
    else
      rm -f "$rollback_link"
    fi
  else
    rm -f "$active_link"
    if [[ "$had_dropin" == false ]]; then
      rm -f "$dropin"
      rmdir "$dropin_dir" 2>/dev/null
    fi
    restored=true
  fi
  if [[ "$restored" == true ]]; then
    systemctl daemon-reload
    systemctl restart "$service"
    for _ in {1..20}; do
      if systemctl is-active --quiet "$service" && curl --noproxy '*' --fail --silent --show-error --max-time 3 http://127.0.0.1:3240/ >/dev/null 2>&1; then
        printf 'Previous service is responding after rollback.\n' >&2
        rollback_done=true
        return 0
      fi
      sleep 1
    done
  fi
  printf 'Critical: rollback did not restore a healthy staging service.\n' >&2
  rollback_done=true
  return 1
}

on_error() {
  local status=$?
  trap - ERR HUP INT TERM
  if [[ "$mutation_started" == true && "$rollback_done" == false ]]; then
    rollback "unexpected error (status $status)" || true
  fi
  exit "$status"
}
on_signal() {
  trap - ERR HUP INT TERM
  if [[ "$mutation_started" == true && "$rollback_done" == false ]]; then
    rollback 'activation interrupted' || true
  fi
  exit 1
}
trap on_error ERR
trap 'on_signal' HUP INT TERM

if [[ "$had_dropin" == false ]]; then
  if [[ -d "$dropin_dir" ]]; then
    shopt -s nullglob
    existing_dropins=("$dropin_dir"/*)
    shopt -u nullglob
    if (( ${#existing_dropins[@]} > 0 )); then
      printf 'Unexpected systemd drop-ins exist; refusing to modify the unit.\n' >&2
      exit 1
    fi
  fi
  mutation_started=true
  install -d -o root -g root -m 0755 "$dropin_dir"
  temp_dropin="$(mktemp "$dropin_dir/.managed-release.XXXXXX")"
  printf '%s\n' "$expected_dropin" > "$temp_dropin"
  chmod 0644 "$temp_dropin"
  mv -f "$temp_dropin" "$dropin"
fi

mutation_started=true
temp_link="$staging_root/.active-release-$sha-$$"
ln -s "$release" "$temp_link"
mv -Tf "$temp_link" "$active_link"
temp_link=""

if ! systemctl daemon-reload || ! systemctl restart "$service"; then
  rollback 'systemd restart failed' || true
  exit 1
fi

ready=false
for _ in {1..30}; do
  if systemctl is-active --quiet "$service" && curl --noproxy '*' --fail --silent --show-error --max-time 2 http://127.0.0.1:3240/ >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  rollback 'service did not become HTTP-ready' || true
  exit 1
fi
if ! /usr/bin/python3 "$verify" --base-url http://127.0.0.1:3240 --timeout 5; then
  rollback 'route and role-label smoke check failed' || true
  exit 1
fi

mutation_started=false
trap - ERR HUP INT TERM
printf 'Activated staging commit %s at %s\n' "$sha" "$release"
