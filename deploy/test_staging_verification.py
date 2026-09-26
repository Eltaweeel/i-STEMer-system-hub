from __future__ import annotations

import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

module_path = Path(__file__).with_name("verify-staging.py")
spec = importlib.util.spec_from_file_location("verify_staging", module_path)
if spec is None or spec.loader is None:
    raise RuntimeError("could not load the staging verification module")
verify_staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_staging)
REQUIRED_LABELS = verify_staging.REQUIRED_LABELS
STALE_LABELS = verify_staging.STALE_LABELS
verify_release = verify_staging.verify_release
visible_text = verify_staging.visible_text

receiver_path = Path(__file__).with_name("istemer-staging-receive.py")
receiver_spec = importlib.util.spec_from_file_location("istemer_staging_receiver", receiver_path)
if receiver_spec is None or receiver_spec.loader is None:
    raise RuntimeError("could not load the staging receiver module")
receiver = importlib.util.module_from_spec(receiver_spec)
receiver_spec.loader.exec_module(receiver)


class StagingVerificationTests(unittest.TestCase):
    def test_visible_text_ignores_scripts_and_styles(self) -> None:
        text = visible_text(
            "<main><h1>Adam</h1><span>(Main Orchestrator)</span>"
            "<script>Designer</script><style>Marketing</style></main>"
        )
        self.assertIn("Adam (Main Orchestrator)", text)
        self.assertNotIn("Designer", text)
        self.assertNotIn("Marketing", text)

    def test_release_manifest_and_runtime_layout_are_checked(self) -> None:
        sha = "a" * 40
        with tempfile.TemporaryDirectory() as temporary:
            release = Path(temporary)
            app = release / "apps/istemer-demo/.next/standalone/apps/istemer-demo"
            (app / ".next/static").mkdir(parents=True)
            (app / ".next/static/chunk.js").write_text("ok", encoding="utf-8")
            (app / "public").mkdir()
            (app / "server.js").write_text("server", encoding="utf-8")
            (release / "release-manifest.json").write_text(
                json.dumps({"package_version": 1, "commit_sha": sha}), encoding="utf-8"
            )
            verify_release(release, sha)
            with self.assertRaises(ValueError):
                verify_release(release, "b" * 40)

    def test_confirmed_and_stale_labels_are_distinct(self) -> None:
        self.assertEqual(len(REQUIRED_LABELS), 4)
        self.assertIn("Marketing", STALE_LABELS)
        self.assertIn("Hermes Conductor", STALE_LABELS)

    def test_receiver_safely_extracts_a_valid_release(self) -> None:
        sha = "c" * 40
        payload = io.BytesIO()
        with tarfile.open(fileobj=payload, mode="w:gz") as archive:
            files = {
                "release-manifest.json": json.dumps(
                    {"package_version": 1, "commit_sha": sha}
                ).encode(),
                "apps/istemer-demo/.next/standalone/apps/istemer-demo/server.js": b"server",
                "apps/istemer-demo/.next/standalone/apps/istemer-demo/.next/static/chunk.js": b"static",
            }
            for name, data in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
            for name in (
                "apps/istemer-demo/.next/standalone/apps/istemer-demo/.next/static",
                "apps/istemer-demo/.next/standalone/apps/istemer-demo/public",
            ):
                info = tarfile.TarInfo(name)
                info.type = tarfile.DIRTYPE
                archive.addfile(info)
        payload.seek(0)
        with tempfile.TemporaryDirectory() as temporary:
            release = Path(temporary) / "release"
            release.mkdir()
            receiver.safe_extract(payload, release, sha)
            verify_release(release, sha)

    def test_receiver_rejects_parent_traversal(self) -> None:
        payload = io.BytesIO()
        with tarfile.open(fileobj=payload, mode="w:gz") as archive:
            info = tarfile.TarInfo("../outside")
            data = b"unsafe"
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
        payload.seek(0)
        with tempfile.TemporaryDirectory() as temporary:
            release = Path(temporary) / "release"
            release.mkdir()
            with self.assertRaises(ValueError):
                receiver.safe_extract(payload, release, "d" * 40)
            self.assertFalse((Path(temporary) / "outside").exists())


if __name__ == "__main__":
    unittest.main()
