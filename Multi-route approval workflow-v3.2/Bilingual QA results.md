# Bilingual QA results — Business Agent OS v3.1 handoff

Artifact under test: `Business Agent OS v3.1 bilingual handoff (final).dc.html`
Previous version, unchanged: `Business Agent OS v3 bilingual (final).dc.html`
Baseline, unchanged: `Business Agent OS v2 (final).dc.html`
Runtime: `support.js` (unchanged)
Instrumentation used for this round: `qa-harness.html` — a same-origin page that loads the artifact
in three iframes sized exactly 1440×900, 1024×768 and 390×844, and exposes DOM-level probes
(`QA.overflowLite`, `QA.targets`, `QA.badAttrs`, `QA.requests`, `QA.probe`).
Date of run: 2026-09-05.

## 0. What changed in v3.1 (handoff corrections only)

| # | Correction | Implementation |
| --- | --- | --- |
| 1 | No unresolved interpolation ever reaches an SVG attribute | The two org-chart loops (`edges`, `agentNodes`) now carry `hint-placeholder-count="0"`, so the runtime renders zero rows instead of `undefined` placeholder rows while the template is still streaming. Nothing else in the SVG changed. |
| 2 | Language buttons ≥ 44×44 CSS px | New rule `[data-langbtn]{min-width:44px;min-height:44px;padding-inline:12px;display:inline-flex;align-items:center;justify-content:center}`, applied to `EN` / `العربية` in the header and in the approval dialog. |
| 3 | No favicon 404 | Inline `<link rel="icon" href="data:image/svg+xml,…">` (a 32×32 mark, no network request). |
| 4 | Language switch reachable while an approval dialog is open | The same compact `role="group"` language selector is rendered in the dialog header row, next to the eyebrow. It calls the existing `setLang`, so all state rules are shared with the header control. |
| 5 | Language applied before first paint | Inline boot script at the top of `<helmet>` reads `baos-language` (and `baos-theme`) and sets `lang`/`dir`/`data-theme` on `<html>` before the template renders. `componentDidMount` still syncs component state. |
| 6 | Translation parity | No key added, removed or reworded. |

No route, layout, copy, colour, type or information-architecture change.

## 1. Measured evidence — real browser, three viewports

Method: artifact loaded in a live browser in three exactly-sized iframes; for each viewport, both
languages, all 19 routes were visited (7 Owner + 12 Operator) and measured after render.

| Viewport | Language | Routes visited | `documentElement` overflow | `body` overflow | Unresolved `{{ }}` in DOM / SVG attrs | Interactive targets < 44×44 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | EN | 19/19 | 0 px | 0 px | 0 | 9–13 per route (desktop 38 px controls, unchanged from v3 — see §4) |
| 1440×900 | AR (rtl) | 19/19 | 0 px | 0 px | 0 | 3 per route (mode pair + state select) |
| 1024×768 | EN | 19/19 | 0 px | 0 px | 0 | 4–8 per route |
| 1024×768 | AR (rtl) | 19/19 | 0 px | 0 px | 0 | 3 per route |
| **390×844** | **EN** | **19/19** | **0 px** | **0 px** | **0** | **0** |
| **390×844** | **AR (rtl)** | **19/19** | **0 px** | **0 px** | **0** | **0** |

`documentElement.scrollWidth` equalled `clientWidth` in every case (1425/1425, 1009/1009, 375/375 —
the deltas from the nominal widths are the scrollbar), so there is no horizontal document overflow
in either direction at any of the three sizes.

### Language control size (measured `getBoundingClientRect`)

| Viewport | `EN` | `العربية` |
| --- | --- | --- |
| 1440×900 | 44.0 × 44.0 | 57.7 × 44.0 |
| 1024×768 | 44.0 × 44.0 | 55.2 × 44.0 |
| 390×844 | 44.0 × 44.0 | 55.2 × 44.0 |

Same measurement for the two buttons inside the open approval dialog at 390×844: 44.0 × 44.0 and
55.2 × 44.0, with `aria-pressed` correctly `true`/`false`.

## 2. Console and network

| Check | Result | How it was obtained |
| --- | --- | --- |
| Console on load | No messages of any level | Real browser console captured for a top-level load of the artifact |
| Console while visiting all 19 routes in EN then AR, opening the approval dialog and switching language inside it | No messages of any level | Same capture, after driving the full sweep |
| Console inside the three sized iframes (hooked `console.error` / `console.warn`, `window.error`, `unhandledrejection`) | 0 entries in all three frames after the full route sweep in both languages | `QA.hook(i)` counters read after each sweep |
| Unresolved-hole scan | 0 elements with `{{` in any attribute, 0 SVG numeric attributes empty or non-numeric, 0 `d` attributes not starting with a move command, 0 `sc-missing` / `sc-unresolved` nodes | `QA.badAttrs` across all 19 routes × 2 languages × 3 viewports |
| Local requests | `support.js` 200, artifact HTML 200, React UMD 200 — no other local request, no 404 | `PerformanceResourceTiming.responseStatus` per frame |
| Favicon | No favicon request at all (data-URI icon) | Same resource list; `link[rel=icon]` present in the DOM |

Honesty note: browser-generated attribute errors are reported by the engine to devtools and are not
observable from page script, so the iframe hooks cannot prove their absence on their own. They are
covered by two independent measures above: the top-level real-console capture, which was empty, and
the DOM attribute scan, which found no invalid or unresolved SVG attribute value on any route.
The specific v3 defect could no longer be triggered at all, because the placeholder rows that used
to carry `{{ e.d }}`, `{{ n.x }}`, `{{ n.y }}`, `{{ n.ty }}` and `{{ n.ty2 }}` are no longer rendered.

## 3. Approval, dialog and audit invariants

Measured at 390×844: Owner → Needs your approval → package `PKG-CRE-DIR`, revision 2, approve
dialog open, confirmation text typed, then `العربية` pressed **inside the dialog**.

| Property | Before switch | After switch |
| --- | --- | --- |
| Dialog open / kind | open, `approve` | open, `approve` |
| Package | `PKG-CRE-DIR` | `PKG-CRE-DIR` (also `dlg.pkgId`) |
| Artifact revision + hash | `CRE-DIR-B · v2 · hash ea14c7` | `CRE-DIR-B · v2 · hash ea14c7` |
| Decision / audit trail | 8 rows | unchanged, no new row |
| Typed confirmation | `APPROVE` | `""` (cleared) |
| Safety notice | not shown | `langNotice` true → localized `role="status" aria-live="polite"` line |
| Commit button | enabled | disabled until the new-language word is typed |
| Document | `lang="en" dir="ltr"` | `lang="ar" dir="rtl"` |

So the switch is destructive only to the typed safety word, which is the intended behaviour, and it
cannot produce an approval in the wrong language.

## 4. Interactive-target findings (unchanged desktop behaviour)

At 390×844 in both languages, **every** visible button, link, select and input measures at least
44×44 — 0 exceptions across all 19 routes. The sub-44 px controls reported at 1440 and 1024 are the
v2/v3 desktop control scale (`[data-btn="small"]` at 38 px, the state `<select>` at 37–39 px, rail
team buttons at 39 px). They are unchanged from the approved v3 build, are pointer-only breakpoints,
and were not in scope for this handoff pass. They are listed here so the number is not mistaken for
a regression.

## 5. Pre-paint language

Measured: `baos-language` set to `ar`, frame reloaded, then `documentElement` sampled from the first
observable moment until the shell existed.

- First sample (before the shell was in the DOM): `lang="ar"`, `dir="rtl"`.
- First sample with the shell rendered (t ≈ 35 ms): `lang="ar"`, `dir="rtl"`.
- Number of samples where the shell was painted while `dir` was not `rtl`: **0**.

No English/LTR flash for a returning Arabic user. The probe restored `baos-language` to its previous
value (`en`) afterwards.

## 6. Translation parity

Extracted `TX.en` and `TX.ar` from the delivered file and compared leaf key sets:

- English leaf keys: **587**
- Arabic leaf keys: **587**
- Keys present in EN but missing in AR: **0**
- Keys present in AR but missing in EN: **0**

Four Arabic values are intentionally empty strings, exactly as in v3
(`campaign.stages.decision.status`, `dirs.b.v2.numeral`, `pkgs.APR-2102.word`,
`pkgs.APR-2103.decisionNote`), and the Latin-script Arabic values are the documented protected set
(route breadcrumb paths, `Hermes`, product and model names). No translation string was edited.

## 7. Carried forward from the v3 round (still valid, not re-run)

The v3 acceptance walkthroughs — full Arabic workflow from brief to staging approval, audit rows
re-rendering from stored event type + params, theme independence of `setLang`, weekday/date
correctness via explicit `dow`, LTR isolation of ids, hashes, timestamps and filenames — were passed
in the v3 round and are unaffected by the six v3.1 corrections, which touch only the document head,
one CSS rule, two `hint-placeholder-count` values and the dialog header row. They were not re-run in
a browser this round and are not claimed as fresh evidence.

## 8. Residual risks

- Verified in a desktop browser at emulated viewport sizes, not on physical iOS/Android hardware; on-device keyboard behaviour and Arabic system-font fallback are still unverified.
- Desktop (≥1024 px) small controls remain at 37–39 px by design; if the handoff wants 44 px everywhere, that is a deliberate visual change and needs approval.
