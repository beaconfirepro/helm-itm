---
name: Express sub-router path doubling
description: Router handlers must use relative paths when mounted at a prefix — doubled path causes silent 404.
---

**Rule:** When `app.use("/api/monthly", monthlyRouter)` mounts a router, all handlers inside that router must use relative paths (e.g. `router.get("/report", ...)`) not full paths (e.g. `router.get("/monthly/report", ...)`). Full paths create doubled routes like `/api/monthly/monthly/report` which Express silently returns 404 for.

**Why:** Express strips the mount prefix before forwarding to the sub-router. Writing the full path accidentally doubles it.

**How to apply:** After writing any sub-router, verify handler paths are relative to the mount point, not absolute.
