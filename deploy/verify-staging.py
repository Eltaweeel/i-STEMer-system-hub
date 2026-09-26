#!/usr/bin/env python3
"""Verify an immutable release package or the public staging UI routes."""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REQUIRED_LABELS = (
    "Adam (Main Orchestrator)",
    "Nour (Content Creator)",
    "Omar (Competitor Analyst)",
    "Ziad (Reel Analyst)",
)
STALE_LABELS = ("Marketing", "Social Media", "Designer", "Hermes Conductor")
ROUTES = ("/", "/coordination-cycle/", "/agents/")


class VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "noscript"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth:
            self.parts.append(data)


def visible_text(markup: str) -> str:
    parser = VisibleText()
    parser.feed(markup)
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()


def verify_release(release: Path, expected_sha: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", expected_sha):
        raise ValueError("invalid expected commit SHA")
    if release.is_symlink() or not release.is_dir():
        raise ValueError(f"release path is not a real directory: {release}")

    manifest_path = release / "release-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("commit_sha") != expected_sha:
        raise ValueError("release manifest SHA does not match the requested commit")
    if manifest.get("package_version") != 1:
        raise ValueError("unsupported release package version")

    app_root = release / "apps/istemer-demo/.next/standalone/apps/istemer-demo"
    server = app_root / "server.js"
    static_root = app_root / ".next/static"
    public_root = app_root / "public"
    if server.is_symlink() or not server.is_file():
        raise ValueError("standalone Next.js server.js is missing or is a symlink")
    if static_root.is_symlink() or not static_root.is_dir() or not any(static_root.rglob("*")):
        raise ValueError("standalone Next.js static assets are missing")
    if public_root.is_symlink() or not public_root.is_dir():
        raise ValueError("standalone Next.js public assets directory is missing")

    for path in release.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"release contains unsupported symlink: {path.relative_to(release)}")
        if path.name == ".env" or path.name.startswith(".env."):
            raise ValueError(f"release contains a forbidden environment file: {path.relative_to(release)}")
    print(f"OK release package: {expected_sha}")


def verify_site(base_url: str, timeout: float) -> None:
    base = base_url.rstrip("/")
    for route in ROUTES:
        request = Request(
            f"{base}{route}",
            headers={"User-Agent": "istemer-staging-release-check/1.0"},
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                status = response.status
                markup = response.read().decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError) as exc:
            raise RuntimeError(f"{route}: request failed: {exc}") from exc
        if status != 200:
            raise RuntimeError(f"{route}: expected HTTP 200, got {status}")

        text = visible_text(markup)
        missing = [label for label in REQUIRED_LABELS if label not in text]
        stale = [label for label in STALE_LABELS if label in text]
        if missing or stale:
            details = []
            if missing:
                details.append("missing confirmed labels: " + ", ".join(missing))
            if stale:
                details.append("stale generic labels remain: " + ", ".join(stale))
            raise RuntimeError(f"{route}: " + "; ".join(details))
        print(f"OK {route}: confirmed team labels; no stale generic labels")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--release", type=Path, help="validate an extracted release package")
    mode.add_argument("--base-url", help="verify the staging UI routes at this origin")
    parser.add_argument("--sha", help="expected commit SHA (required with --release)")
    parser.add_argument("--timeout", type=float, default=10.0, help="HTTP timeout per route")
    args = parser.parse_args()
    try:
        if args.release is not None:
            if not args.sha:
                parser.error("--sha is required with --release")
            verify_release(args.release, args.sha)
        else:
            verify_site(args.base_url, args.timeout)
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"staging verification failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
