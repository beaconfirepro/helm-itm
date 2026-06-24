---
name: Replit proxy prefix passthrough
description: Replit artifact-router forwards requests WITH their path prefix intact — routes must include the prefix.
---

## Rule
When an artifact has `paths = ["/api"]` in `artifact.toml`, the Replit proxy forwards requests to the service **without stripping** the `/api` prefix.  
Express must mount routes at `/api/*`, not `/*`.

**Why:** Discovered when `GET /api/health` hit `app.use("/api", apiRouter)` instead of `app.use(healthRouter)`, returning 401 because apiRouter has a global `requireSession`.

## How to apply
- Mount all API server routes under `/api`: `app.use("/api", healthRouter)`, `app.use("/api/config", configRouter)`, `app.use("/api/dev", devRouter)`, etc.
- Register more-specific prefixes (e.g. `/api/dev`, `/api/config`) **before** catch-all `/api` routes to avoid the catch-all's middleware (requireSession) blocking them.
- Frontend `getApiBase()` returns `"/api"` — not a regex derivation from BASE_URL (BASE_URL is just `"/"` when artifact previewPath is `"/"`).
- Direct port access (e.g. `curl localhost:8080`) also uses `/api/*` paths now (not `/*`).
