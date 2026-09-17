# MVP plan debate rulings — 2026-09-16

Claude reviewed the MVP plan against the current repository and Hermes evidence. Adopted rulings:

- Keep the controlled staging storyline, evidence lineage, two exact approval stages, security gates,
  failure matrix, and two-rehearsal definition of done.
- Split the first runtime milestone into Hermes/profile proof and then Adam→Omar; the gateway is stopped,
  only the default profile exists, and no system/agents transport currently exists.
- Treat the current two-repository split as inherited state. The shared contract must be canonical and
  versioned before either repository claims integration.
- Keep Ziad's explicit unavailable-media path; do not claim four real runtime agents until each profile
  is provisioned and independently verified.
- Categorize untracked files before landing work. Fixtures/scaffolds are not runtime evidence.
- Packet 1 passes only after contract versioning, server-derived identity, typed envelope rejection,
  idempotency, lineage, content-hash rules, and identical serialization tests are proven in both repos.

The full review output is preserved in the delegation artifact; no Claude files were modified.
