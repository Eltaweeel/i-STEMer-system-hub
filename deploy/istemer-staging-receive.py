#!/usr/bin/env python3
"""Forced-command SSH receiver for a verified i-STEMer staging release."""

from __future__ import annotations

import json
import os
import pwd
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

RELEASES = Path("/srv/istemer-staging/releases")
ACTIVATE = "/usr/bin/sudo"
ACTIVATION_SCRIPT = "/usr/local/sbin/istemer-staging-activate"
MAX_COMPRESSED_BYTES = 300 * 1024 * 1024
MAX_EXPANDED_BYTES = 512 * 1024 * 1024
MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_MEMBERS = 100_000
STANDALONE_ROOT = "apps/istemer-demo/.next/standalone"
ALLOWED_PARENT_DIRECTORIES = frozenset(
    {
        "apps",
        "apps/istemer-demo",
        "apps/istemer-demo/.next",
        STANDALONE_ROOT,
    }
)


class BoundedReader:
    def __init__(self, raw, limit: int) -> None:
        self.raw = raw
        self.limit = limit
        self.consumed = 0

    def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            size = 64 * 1024
        remaining = self.limit - self.consumed
        if remaining <= 0:
            extra = self.raw.read(1)
            if extra:
                raise ValueError("compressed deployment archive exceeds size limit")
            return b""
        chunk = self.raw.read(min(size, remaining))
        self.consumed += len(chunk)
        return chunk


def command_sha() -> str:
    original = os.environ.get("SSH_ORIGINAL_COMMAND", "")
    match = re.fullmatch(r"deploy ([0-9a-f]{40})", original)
    if not match:
        raise ValueError("only 'deploy <40-character-commit-sha>' is allowed")
    return match.group(1)


def normalize_member_name(name: str) -> str:
    if "\x00" in name or "\\" in name:
        raise ValueError("archive contains an invalid path")
    while name.startswith("./"):
        name = name[2:]
    if name in {"", "."}:
        return ""
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"archive path is not safe: {name!r}")
    normalized = path.as_posix()
    allowed = (
        normalized in ALLOWED_PARENT_DIRECTORIES
        or normalized == "release-manifest.json"
        or normalized.startswith(f"{STANDALONE_ROOT}/")
    )
    if not allowed:
        raise ValueError(f"archive contains an unexpected path: {normalized}")
    if any(part == ".env" or part.startswith(".env.") for part in path.parts):
        raise ValueError("environment files are not allowed in a staging artifact")
    return normalized


def safe_extract(stream, destination: Path, expected_sha: str) -> None:
    seen: set[str] = set()
    manifest_data: bytes | None = None
    expanded = 0
    bounded = BoundedReader(stream, MAX_COMPRESSED_BYTES)

    with tarfile.open(fileobj=bounded, mode="r|gz") as archive:
        for index, member in enumerate(archive, start=1):
            if index > MAX_MEMBERS:
                raise ValueError("archive contains too many entries")
            name = normalize_member_name(member.name)
            if not name:
                if not member.isdir():
                    raise ValueError("archive root entry is not a directory")
                continue
            if name in seen:
                raise ValueError(f"archive contains a duplicate path: {name}")
            seen.add(name)
            if member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
                raise ValueError(f"archive contains an unsupported entry type: {name}")
            if name in ALLOWED_PARENT_DIRECTORIES and not member.isdir():
                raise ValueError(f"archive parent path must be a directory: {name}")
            if member.size < 0 or member.size > MAX_FILE_BYTES:
                raise ValueError(f"archive file is too large: {name}")
            expanded += member.size
            if expanded > MAX_EXPANDED_BYTES:
                raise ValueError("expanded deployment archive exceeds size limit")

            target = destination.joinpath(*PurePosixPath(name).parts)
            parent = target.parent
            parent.mkdir(mode=0o750, parents=True, exist_ok=True)
            if not parent.resolve().is_relative_to(destination.resolve()):
                raise ValueError(f"archive path escapes the release directory: {name}")
            if member.isdir():
                target.mkdir(mode=0o750, exist_ok=True)
                if target.is_symlink() or not target.is_dir():
                    raise ValueError(f"archive directory conflicts with another entry: {name}")
                os.chmod(target, 0o750)
                continue

            source = archive.extractfile(member)
            if source is None:
                raise ValueError(f"archive file cannot be read: {name}")
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor = os.open(target, flags, 0o640)
            try:
                with os.fdopen(descriptor, "wb") as output:
                    remaining = member.size
                    while remaining:
                        chunk = source.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError(f"archive file is truncated: {name}")
                        output.write(chunk)
                        remaining -= len(chunk)
            except Exception:
                target.unlink(missing_ok=True)
                raise
            os.chmod(target, 0o640)
            if name == "release-manifest.json":
                manifest_data = target.read_bytes()

    if manifest_data is None:
        raise ValueError("release manifest is missing")
    manifest = json.loads(manifest_data.decode("utf-8"))
    if manifest.get("package_version") != 1 or manifest.get("commit_sha") != expected_sha:
        raise ValueError("release manifest does not match the requested commit")

    app_root = destination / "apps/istemer-demo/.next/standalone/apps/istemer-demo"
    server = app_root / "server.js"
    static_root = app_root / ".next/static"
    public_root = app_root / "public"
    if server.is_symlink() or not server.is_file():
        raise ValueError("standalone Next.js server.js is missing")
    if static_root.is_symlink() or not static_root.is_dir() or not any(static_root.rglob("*")):
        raise ValueError("standalone Next.js static assets are missing")
    if public_root.is_symlink() or not public_root.is_dir():
        raise ValueError("standalone Next.js public assets are missing")


def main() -> int:
    temporary: Path | None = None
    try:
        if os.geteuid() == 0:
            raise ValueError("receiver must not run as root")
        if pwd.getpwuid(os.geteuid()).pw_name != "istemerdeploy":
            raise ValueError("receiver must run as the istemerdeploy account")
        sha = command_sha()
        if not RELEASES.is_dir() or RELEASES.is_symlink():
            raise ValueError("staging release directory is unavailable")
        temporary = Path(tempfile.mkdtemp(prefix=f".incoming-{sha}-", dir=RELEASES))
        os.chmod(temporary, 0o750)
        safe_extract(sys.stdin.buffer, temporary, sha)

        final = RELEASES / sha
        if final.exists() or final.is_symlink():
            if final.is_symlink() or not final.is_dir():
                raise ValueError("release path already exists and is not a real directory")
            existing_manifest = json.loads((final / "release-manifest.json").read_text(encoding="utf-8"))
            if existing_manifest.get("commit_sha") != sha:
                raise ValueError("existing release path has a different commit manifest")
            shutil.rmtree(temporary)
            temporary = None
        else:
            os.rename(temporary, final)
            temporary = None

        result = subprocess.run(
            [ACTIVATE, "-n", ACTIVATION_SCRIPT, sha],
            check=False,
        )
        return result.returncode
    except Exception as exc:
        print(f"staging receiver failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if temporary is not None:
            shutil.rmtree(temporary, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
