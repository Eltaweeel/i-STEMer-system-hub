# Business Agent OS v3.2 — frozen design handoff

Frozen on 2026-09-08. **v3.2 is the canonical approved visual handoff.** This package freezes the approved prototype for implementation; it does not certify a production backend, authentication, or live integrations.

The HTML and adjacent `support.js` are byte-for-byte copies of the approved artifacts. The three verification scripts are also unchanged copies. Original v3, v3.1, screenshots, raw QA outputs, browser profiles, dependencies, and temporary files are deliberately excluded.

## Approved scope

The SVG binding fix is verified. Relative to original v3, the allowlisted change comprises 14 native SVG attribute bindings on HTML lines 979, 982, 997–999, plus binding support on runtime lines 421 and 441: five HTML lines and two runtime lines total. The original loop placeholder counts, content, layout, typography, colors, animations, language controls, and translations are retained.

No UI, content, or RTL redesign is authorized without a new approved brief. The implementation blueprint describes work to realize the prototype, not permission to change the frozen interface.

## Existing verification evidence

The following results are copied from the existing v3.2 evidence, not from a new browser run during packaging:

| Evidence | Recorded result |
| --- | --- |
| `diff-gate.json` | PASS; five HTML lines and two runtime lines; no out-of-scope diff; no raw interpolation in native SVG attributes |
| `browser.json` | PASS; Chromium 149.0.7827.55; four fresh HTTP contexts: English/LTR and Arabic/RTL at 1440×900 and 390×844 |
| Console/network | Each acceptance flow: zero SVG parsing errors, console errors, warnings, uncaught exceptions, failed requests, or HTTP error responses; adjacent runtime returned HTTP 200 |
| Targeted smoke flows | Dashboard, organization, language switching, approval, disclosures, creative selection/feedback/revisions, ask/objective flow, theme, and mobile navigation; 32 instrumented control clicks per flow, 128 total, plus direct form/mobile interactions |
| Visual comparison | Eight dashboard/organization source-versus-v3.2 screenshot comparisons matched; language round trips preserved layout and SVG output |
| Dynamic binding probe | In-memory fixture change moved the market node from (250,372) to (271,383), updated label y positions to 427/447, and updated the edge path |
| `file-protocol-recheck.json` | Both v3 and v3.2 retained one unsupported `file://` self-fetch error, with no uncaught exceptions; v3's seven SVG parsing errors were absent in v3.2 |

The original evidence remains in the originating workspace at `Multi-route approval workflow-v3.1/surgical-v3.2/evidence/`. It is summarized here rather than bundled. An earlier file-protocol diagnostic also recorded transient Google Fonts connection failures; the dedicated recheck above did not, and the HTTP acceptance flows had none.

## Execution and inherited defects

**Local HTTP loading is the supported execution mode.** Serve this package directory through a local HTTP server and open the HTML through its HTTP URL. Keep `support.js` beside the HTML. The existing runtime loads React/ReactDOM and Babel from a CDN, and the document loads Google Fonts; this is not an offline bundle.

Fourteen interpolated organization-chart labels remain invisible, as in original v3; only the literal HD and HERMES labels render. The existing runtime wraps interpolated text in spans inside SVG text elements. The zero rendered text lengths and label contents matched original v3. This and the `file://` fetch error are inherited defects, not v3.2 regressions. Neither was repaired in this release.

## Verification scripts and integrity

Included unchanged: `surgical_v32_gate.py`, `surgical_v32_browser.py`, and `surgical_v32_file_check.py`. They are provenance copies, not standalone package-local test commands: the gate defines paths relative to its original workspace-root location, and the browser/file scripts import those paths. They require the excluded v3/v3.1 baselines and originating directory layout; browser scripts additionally require Python Playwright and its browser installation. Restore/use the original workspace layout for a future rerun. Do not run them inside this frozen package expecting them to target the packaged HTML; they can create evidence or missing generated outputs in their configured paths.

`SHA256SUMS.txt` contains SHA-256 digests for the seven other packaged files. The manifest's own SHA-256 is supplied separately in the delivery response, avoiding a circular self-checksum. Packaging verifies an exact eight-file inventory and unchanged hashes for the original artifacts and verification scripts. No browser QA was rerun for this freeze.
