#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  printf 'Run this installer as root on the staging VPS.\n' >&2
  exit 1
fi
if ! id -u istemerdeploy >/dev/null 2>&1; then
  printf 'Required service/deployment account istemerdeploy does not exist.\n' >&2
  exit 1
fi
if ! systemctl cat istemer-staging.service >/dev/null 2>&1; then
  printf 'istemer-staging.service is not installed.\n' >&2
  exit 1
fi
if [[ ! -d /srv/istemer-staging/releases || "$(stat -c '%U' /srv/istemer-staging/releases)" != "istemerdeploy" ]]; then
  printf 'Expected istemerdeploy-owned staging releases directory is missing.\n' >&2
  exit 1
fi
if ! command -v visudo >/dev/null 2>&1; then
  printf 'visudo is required to validate the restricted sudoers rule.\n' >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
libexec=/usr/local/libexec
activate=/usr/local/sbin/istemer-staging-activate
receive=/usr/local/sbin/istemer-staging-receive
verify="$libexec/istemer-staging-verify.py"
sudoers=/etc/sudoers.d/istemer-staging-deploy
expected_sudoers='istemerdeploy ALL=(root) NOPASSWD: /usr/local/sbin/istemer-staging-activate *'

# Never replace an existing host helper or sudoers policy unless it is byte-identical.
for pair in \
  "$script_dir/istemer-staging-activate.sh:$activate" \
  "$script_dir/istemer-staging-receive.py:$receive" \
  "$script_dir/verify-staging.py:$verify"; do
  source_file="${pair%%:*}"
  target_file="${pair#*:}"
  if [[ -e "$target_file" || -L "$target_file" ]]; then
    if [[ -L "$target_file" || ! -f "$target_file" ]] || ! cmp -s "$source_file" "$target_file"; then
      printf 'Refusing to overwrite an existing, non-identical helper: %s\n' "$target_file" >&2
      exit 1
    fi
  fi
done
if [[ -e "$sudoers" || -L "$sudoers" ]]; then
  if [[ -L "$sudoers" || ! -f "$sudoers" ]] || [[ "$(<"$sudoers")" != "$expected_sudoers" ]]; then
    printf 'Refusing to overwrite an existing, non-identical sudoers policy.\n' >&2
    exit 1
  fi
fi

install -d -o root -g root -m 0755 "$libexec"
install -o root -g root -m 0755 "$script_dir/istemer-staging-activate.sh" "$activate"
install -o root -g root -m 0755 "$script_dir/istemer-staging-receive.py" "$receive"
install -o root -g root -m 0755 "$script_dir/verify-staging.py" "$verify"

if [[ ! -e "$sudoers" ]]; then
  sudoers_tmp="$(mktemp /etc/sudoers.d/.istemer-staging-deploy.XXXXXX)"
  trap 'rm -f "$sudoers_tmp"' EXIT
  printf '%s\n' "$expected_sudoers" > "$sudoers_tmp"
  chmod 0440 "$sudoers_tmp"
  visudo -cf "$sudoers_tmp"
  mv -f "$sudoers_tmp" "$sudoers"
  trap - EXIT
fi
visudo -cf "$sudoers"
printf 'Installed the restricted i-STEMer staging deployment helpers. No service restart or release switch was performed.\n'
