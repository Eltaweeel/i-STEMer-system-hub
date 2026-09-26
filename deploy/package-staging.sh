#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  printf 'Usage: %s <40-char-commit-sha> <output-archive>\n' "$0" >&2
  exit 2
fi

commit_sha="$1"
output_archive="$2"
if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Invalid commit SHA.\n' >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
if [[ "$(git rev-parse HEAD)" != "$commit_sha" ]]; then
  printf 'Refusing to package: HEAD does not match the requested commit.\n' >&2
  exit 1
fi

standalone="$repo_root/apps/istemer-demo/.next/standalone"
static_assets="$repo_root/apps/istemer-demo/.next/static"
public_assets="$repo_root/apps/istemer-demo/public"
if [[ ! -f "$standalone/apps/istemer-demo/server.js" || ! -d "$static_assets" || ! -d "$public_assets" ]]; then
  printf 'Required Next.js standalone, static, or public output is missing.\n' >&2
  exit 1
fi

mkdir -p "$(dirname "$output_archive")"
stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT

release_standalone="$stage_dir/apps/istemer-demo/.next/standalone"
mkdir -p "$release_standalone"
cp -a "$standalone/." "$release_standalone/"
mkdir -p "$release_standalone/apps/istemer-demo/.next/static"
cp -a "$static_assets/." "$release_standalone/apps/istemer-demo/.next/static/"
mkdir -p "$release_standalone/apps/istemer-demo/public"
cp -a "$public_assets/." "$release_standalone/apps/istemer-demo/public/"
printf '{"package_version":1,"commit_sha":"%s"}\n' "$commit_sha" > "$stage_dir/release-manifest.json"

# The receiver rejects links and non-regular files; fail early if a future
# Next.js output changes that assumption.
python3 - "$stage_dir" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
links = [str(path.relative_to(root)) for path in root.rglob('*') if path.is_symlink()]
if links:
    print('Staging package contains unsupported symlinks:', *links[:20], sep='\n', file=sys.stderr)
    raise SystemExit(1)
PY

tar -C "$stage_dir" -czf "$output_archive" .
chmod 600 "$output_archive"
printf 'Packaged commit %s to %s\n' "$commit_sha" "$output_archive"
