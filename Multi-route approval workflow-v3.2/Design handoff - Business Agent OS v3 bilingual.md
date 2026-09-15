# Design handoff — Business Agent OS v3 bilingual

This is a bilingual and RTL extension of v2. No product redesign, no removed functionality. Read alongside `Design handoff - Business Agent OS v2.md` (still authoritative for layout, hierarchy, colour, component behaviour and approval semantics) and `Bilingual translation inventory.md` / `Bilingual QA results.md`.

## Files

| File | Role |
| --- | --- |
| `Business Agent OS v3 bilingual (final).dc.html` | The bilingual artifact |
| `support.js` | Runtime, unchanged and compatible |
| `Business Agent OS v2 (final).dc.html` | Preserved baseline, untouched |
| `Bilingual translation inventory.md` | Key architecture + per-route coverage |
| `Bilingual QA results.md` | What was tested, where, and the known limits |

## 1. Language model

- `state.lang` ∈ `en` | `ar`; default `en`; persisted in `localStorage` under **`baos-language`**. Browser locale is never consulted after a stored preference exists (and is not consulted at all in this build — English is the honest default).
- `applyLang(lang)` sets `<html lang>` and `<html dir>` and `document.title`. Called on mount and on every switch.
- `T(lang, 'dotted.key', params)` resolves against `TX[lang]`, falls back to `TX.en`, and interpolates `{param}`. The whole active dictionary is exposed to the template as `L`, so markup reads `{{ L.approvals.approveBtn }}`.
- Keys are semantic (`nav.owner.today` style, expressed here as `routes.today.label`, `approval.requestChanges` as `approvals.changesBtn`, etc.). Never English sentences as keys.
- Implementers adding a string: add it to **both** `TX.en` and `TX.ar` at the same path. A missing Arabic key silently falls back to English — treat any English in Arabic mode as a bug unless it is on the protected-values list.

### Language control

Compact segmented control `EN | العربية` in the persistent top header, immediately after the theme button, `role="group"` with a localized `aria-label` and `aria-pressed` per option. It is present on all 19 routes in both modes, and mirrored (not moved) into the mobile More sheet. It never navigates: `setLang` writes `lang` only — plus, and only when an approve dialog is open with text typed, it clears `confirmText` and raises `langNotice`.

### What survives a switch

Mode, route, campaign stage, creative direction, revision/version selection, open package, recorded decisions, requested-change selections, free-text fields (ask text, feedback note), disclosure state (technical references, evidence), design-state simulation, theme, audit entries, open More sheet or dialog. Nothing resets to Today.

## 2. RTL implementation

Deliberate mirroring, not a transform. Directional CSS was replaced with logical properties: `border-inline-start/end`, `margin-inline-start`, `padding-inline`, `padding-block`, `inset-inline`, `text-align:start`. The shell is CSS grid, so the rail lands on the right and the context aside on the left purely from `dir`. Never mirrored: the org-topology SVG (`dir="ltr"` on the element, localized `aria-label`), numerals, and any technical token.

Mixed direction is handled with a single hook: `data-ltr="true"` → `direction:ltr; unicode-bidi:isolate; text-align:start`, plus IBM Plex Mono. It is applied statically to ids, hashes, artifact references, breadcrumbs, timestamps, glyphs and the wordmark, and automatically to any operator table cell whose value contains no Arabic characters (`isLatin()` check in `cell()`).

## 3. Typography

- English: IBM Plex Sans + IBM Plex Mono (unchanged).
- Arabic: **IBM Plex Sans Arabic** via `html[lang="ar"]{--sans:…}`, with `--mono` falling back to Plex Sans Arabic for Arabic glyphs while Latin tokens keep true Plex Mono.
- Arabic overrides: `text-transform:none`, `letter-spacing:normal`, line-height 1.9 for body/lists, 1.4–1.5 for headings, and labels/chips/buttons/table headings raised to 13–14 px. Arabic body copy is never smaller than the English equivalent, and UI chrome switches from mono to the Arabic sans so labels don't read as spaced-out monospace.
- The command-centre character is preserved: mono is still the voice of identifiers, timestamps and the wordmark in both languages.

## 4. Data and formatting

- Fixture *structure* (ids, hashes, hues, node coordinates, mono-column indexes) lives in shared consts. Fixture *prose* lives only in the dictionaries. One component, two dictionaries — never a duplicated Arabic component tree.
- Dynamic events are stored semantically: `{iso, actor, type, params, ref}`. `auditWhat()` renders them in the active language, so an existing audit row switches language without losing meaning, and no rendered English sentence is ever the sole record of an event.
- `Intl.DateTimeFormat` / `Intl.NumberFormat` with `en-GB` and `ar-EG-u-nu-latn` (Latin digits, deliberate: they sit beside mono technical values). Cairo timezone preserved.
- Honest states keep honest Arabic equivalents; missing values are never coerced to zero.

## 5. Approval invariants (unchanged, now bilingual)

One decision binds one action and one artifact revision. A material change produces a new revision and invalidates prior approval. No agent may approve. Chat is never consent. Typed confirmation is the only writing control — word per language (`STAGING` / `تجريبي`, `PUBLISH LIVE` / `نشر فعلي`), and validation compares against the active language's word. Live publication remains locked with its reason visible. `approved` / `executed` / `executed and externally verified` stay three distinct wordings in both languages.

## 6. Implementation notes for engineering

- The dictionaries are the localization contract. Ship them as two JSON resources keyed identically; keep the route keys and data-contract keys exactly as they are.
- Add `dir`/`lang` at the document level from the persisted preference before first paint to avoid a flash of LTR.
- Keep the `data-ltr` isolation rule as a global utility; every id, hash, URL, e-mail and Latin-unit number rendered inside Arabic copy needs it.
- When adding a screen: register `routes.<key>.label` + `.crumb`, add its glyph to the route table, and add table captions/columns per language; the operator table renderer takes care of LTR isolation and status colouring from the localized tone prefixes in `op.tone`.
- `op.tone` values are the prefix vocabulary used to colour operator status cells. If a translator changes a status word, change the matching `op.tone` entry too, or the colour coding silently degrades to neutral.
