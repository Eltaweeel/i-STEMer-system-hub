# Bilingual translation inventory — Business Agent OS v3

Artifact: `Business Agent OS v3 bilingual (final).dc.html`
Languages: English (`en`, LTR) · Modern Standard Arabic (`ar`, RTL)
Dictionaries: `TX.en` and `TX.ar`, both bundled locally in the artifact. No runtime translation service, no browser-translation widget.
Helper: `T(lang, key, params)` with dotted semantic keys and `{param}` interpolation; `L = TX[lang]` is exposed to the template so every visible string is language-driven.

## Architecture

| Concern | Where it lives |
| --- | --- |
| Language state | `state.lang`, persisted to `localStorage` key `baos-language`, default `en` |
| Document attributes | `applyLang()` sets `<html lang dir>` and `document.title` on mount and on every switch |
| Fixture structure (ids, hashes, hues, coordinates, mono column indexes) | Shared consts: `TEAM_S`, `DIR_S`, `QA_S`, `PLAN_S`, `PKG_S`, `OP_MONO`, `NODES`, `EDGES`, `SEED_AUDIT` |
| Fixture prose | `TX.<lang>` only — never duplicated per component |
| Dynamic events | Stored as `{iso, actor, type, params, ref}` and rendered through `audit.events.*`, so an existing audit row re-renders in the active language |
| Mixed-direction values | `data-ltr="true"` (`direction:ltr; unicode-bidi:isolate`) applied to ids, hashes, refs, timestamps, breadcrumbs, glyphs, and auto-detected Latin-only table cells |

## Coverage by route

Every row below was verified as: navigation label + breadcrumb, page/static content, dynamic content produced by interaction, dialogs reachable from the route, tables, state messages (loading / empty / blocked / error / decided), and accessibility labels.

### Owner (واجهة المالكة)

| # | Route | Nav + crumb | Static content | Dynamic content | Dialogs | Tables | State messages | A11y labels |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Today · اليوم | ✅ | ✅ briefing, decision-first card, four panels, objective | ✅ decision count, objective timestamp | — | — | ✅ all 13 design states | ✅ skip link, nav, context, region labels |
| 2 | Needs Your Approval · بانتظار موافقتك | ✅ | ✅ intro, 3 packages, facts, will/will-not, evidence, risk | ✅ decided bodies, invalidation note, next steps | ✅ approve / request changes / reject | — | ✅ awaiting, staged, changes, rejected, locked | ✅ `aria-expanded`, dialog labels, `aria-live` |
| 3 | Campaigns · الحملات | ✅ | ✅ 7 stages, stage blocks, plan table | ✅ stage status from live approval state, localized dates | ✅ (via package CTA) | ✅ plan table + captions | ✅ | ✅ stage nav label, `aria-current="step"` |
| 4 | Designer Studio · استوديو التصميم | ✅ | ✅ brief, brand kit, references, channels, 3 directions incl. Arabic creative copy, provenance | ✅ v1/v2 diff, QA per direction, feedback hint, export facts | ✅ change request | ✅ diff + brand QA | ✅ | ✅ version group label, checkbox labels |
| 5 | AI Team · فريق الذكاء الاصطناعي | ✅ | ✅ 4 agent cards: role, plain description, assignment, outputs, limits | ✅ status tone | — | — | ✅ | ✅ chips, buttons |
| 6 | Results and Recommendations · النتائج والتوصيات | ✅ | ✅ 3 columns, 12 rows, recommendations | ✅ session decision count via `Intl.NumberFormat` | — | — | ✅ "Awaiting first run", "To be measured", "Not visible — no meter" | ✅ |
| 7 | Ask the Team · اسألي الفريق | ✅ | ✅ intro, field label, placeholder, 3 suggestions | ✅ routing response, draft objective incl. quoted user text, validation message | — | — | ✅ | ✅ `aria-live` on routing and draft |

### Operator (واجهة التشغيل)

| # | Route | Nav + crumb | Table captions + columns | Human-readable cells | Notes | A11y |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Org Topology · هيكل التنظيم | ✅ | ✅ | ✅ (role enums kept as protected Latin values) | ✅ 2 | ✅ SVG `role="img"` + localized `aria-label`, graph never mirrored |
| 2 | Agent Manifests · بيانات الوكلاء | ✅ | ✅ 2 tables | ✅ | ✅ 1 | ✅ |
| 3 | SOP Revisions · مراجعات إجراءات العمل | ✅ | ✅ 2 tables | ✅ (SOP ids, REV, hashes unchanged, LTR-isolated) | ✅ 1 | ✅ |
| 4 | Workflow Runs · عمليات سير العمل | ✅ | ✅ | ✅ | ✅ 2 | ✅ |
| 5 | Evidence and Artifacts · الأدلة والمخرجات | ✅ | ✅ | ✅ (artifact ids/hashes unchanged) | ✅ 2 | ✅ |
| 6 | Approval Rules · قواعد الموافقة | ✅ | ✅ 2 tables | ✅ | ✅ 1 | ✅ |
| 7 | Connector Health · حالة الموصلات | ✅ | ✅ | ✅ (platform names unchanged) | ✅ 1 | ✅ |
| 8 | Shared Knowledge · المعرفة المشتركة | ✅ | ✅ | ✅ | ✅ 2 | ✅ |
| 9 | Model Usage and Cost · استخدام النماذج والتكلفة | ✅ | ✅ | ✅ (sample call counts kept as labelled protected values) | ✅ 2 | ✅ |
| 10 | Audit Trail · سجل التدقيق | ✅ | ✅ | ✅ every row rendered from event type + params in the active language | ✅ 2 | ✅ visually-hidden `<caption>` |
| 11 | Diagnostics · التشخيصات | ✅ | ✅ | ✅ | ✅ 1 | ✅ |
| 12 | System Health · حالة النظام | ✅ | ✅ | ✅ | ✅ 2 | ✅ |

## Global chrome

Translated: sample-scenario warning, mode selector, state selector (all 13 states) and its accessible label, theme control (+ accessible label), language control group label, route titles, breadcrumbs (kept as stable Latin route paths, LTR-isolated), state chip, team strip, mobile bottom navigation (5 items per mode), More sheet (title, close, mode buttons, theme, language), skip link, document title, rail captions, data-as-of + fixture line, context aside (kind, title, 4 facts, authority paragraph, recent record, full-audit button).

## Dialogs and dynamic strings

| String | Key |
| --- | --- |
| Approve eyebrow / title / body / commit | `dlg.approve.*` |
| Request-changes eyebrow / title / body / commit | `dlg.changes.*` |
| Reject eyebrow / title / body / commit | `dlg.reject.*` |
| Typed confirmation label and word | `dlg.typeToConfirm`, `pkgs.<id>.word` (EN `STAGING` / `PUBLISH LIVE`, AR `تجريبي` / `نشر فعلي`) |
| Confirmation hint | `dlg.confirmationHint` |
| Language-switch safety notice | `dlg.langNotice` |
| Rejection reasons (5) | `dlg.reasons.*` |
| Feedback items (4), note label, placeholder, hints | `feedback.*` |
| Audit events (9 types) | `audit.events.*` |
| Actors (5) | `audit.actors.*` |
| Approval states (5) | `approvalStates.*` |
| Blocked / empty / error / dependency / denied / first-run screens | `block.*` |
| Banners (5) | `banner.*` |
| Ask-the-team routing, draft objective, validation | `ask.*` |

## Protected technical values (never translated or reshaped)

Record, run, package and SOP ids (`APR-2101`, `SAMPLE-RUN-0001`, `SOP-CAMP-002`, `MI-BRF-014`, `SOC-PLN-031`, `CRE-DIR-A/B/C`, `PHOTO-SLOT-01`, `OBJ-0007`, `OBJ-DRAFT`); hashes (`a91f3c`, `7c41ae`, `5be207`, `e0a934`, `3d81f0`, `b21c55`, `c70d18`, `9f30ab`, `4bd022`); manifests (`mf/hermes.v6` …); schema `v4`; batch `BATCH-2026-08-30`; revision labels `v1`/`v2`, `REV 4`; autonomy enums (`RUNG 2 — PROPOSE`), permission enums (`TRUE`/`FALSE`); dimensions `1080 × 1350`, `1080 × 1920`, `1200 × 1500`; hex colours; font names (IBM Plex …); platform names (Instagram, Facebook, WhatsApp); correlation ids; `Africa/Cairo`; brand kit name `i-STEMer Core v4`; tenant `i-STEMer Demo`; glyph pairs (TD, AP, AU …); route keys and every data-contract key.

## Dates, numbers, honest states

`Intl.DateTimeFormat` / `Intl.NumberFormat` with `en-GB` and `ar-EG-u-nu-latn` (Latin digits kept for parity with the mono/technical layer). Cairo timezone preserved on every formatted value. Missing values are never coerced to zero: `Awaiting first run` → `بانتظار أول تشغيل`, `To be measured` → `سيُقاس`, `Not visible — no meter` → `غير مرئية — لا عدّاد`, `Blocked` → `محجوب`, `Not provisioned` → `غير مُهيَّأ`, `Never` → `لم يحدث`, `Empty` → `فارغ`.

## Terminology register

Owner-facing Arabic uses feminine direct address throughout (راجعي، احسمي، اكتبي، وافقتِ). Operator-facing Arabic is neutral and operational. The three approval states stay distinct in both languages: معتمَد (approved) ≠ نُفِّذ (executed) ≠ نُفِّذ ومُتحقَّق منه خارجيًا (executed and externally verified).
