---
name: Rich-text region editor roundtrip
description: How document-template regions stay byte-identical for plain defaults while supporting b/i/u markup, and why token-inside-formatting normalizes.
---

Document-template region strings carry limited inline markup (`<b>`/`<i>`/`<u>`) plus `{{token}}` merge fields and `\n`. The Settings editor (config.tsx `MergeFieldEditor`) parses this into DOM and serializes back; PDF generators render it via `pdfRichText.ts` `renderRichText`.

**Rule:** plain-text region defaults (no markup) MUST roundtrip parse→DOM→serialize byte-identically.
**Why:** `handleSave` stores `null` when a region equals its default; any serialization drift on an untouched region would defeat that and persist a near-duplicate. All shipped defaults are plain text, so this holds.
**How to apply:** if you change serialize/parse, re-verify plain defaults are identity-stable. Never HTML-escape — only the 3 tags are recognized; stray `<`/`&` stay literal.

**Known normalization (not a bug):** a `{{token}}` inside a formatting run serializes with split markup — `<b>x {{t}}</b>` becomes `<b>x </b>{{t}}<b>...</b>`. Chips ignore formatting (tokens never render bold/italic/underline in the PDF), so output is identical and the form is idempotent after first save. This only affects user-formatted content, never the plain defaults.
