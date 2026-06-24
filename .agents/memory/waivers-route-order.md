---
name: Waivers route order
description: GET /waivers/exposure must come before GET /waivers/:id in Express to prevent the param route swallowing 'exposure' as an id.
---

**Rule:** In `waivers.ts`, always declare `GET /waivers/exposure` *before* `GET /waivers/:id`.

**Why:** Express matches routes in declaration order. If `/:id` is declared first, a request to `/waivers/exposure` will match it with `id = "exposure"`, returning a 404 instead of the exposure summary.

**How to apply:** Any new non-parameterized sub-routes (e.g. `/waivers/stats`, `/waivers/summary`) must also be declared before `/:id` and any other wildcard param routes.
