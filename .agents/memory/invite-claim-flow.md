---
name: Invite/add-user claim flow
description: How admin-created user invites reconcile with Replit Auth's id-keyed login upsert
---

Admins can pre-create a user by email (POST /api/users) before that person ever
logs in. The record gets a placeholder `gen_random_uuid()` id and the
admin-assigned role.

**Why:** `users.email` is UNIQUE and the login upsert keys on `users.id`
(= OIDC `claims.sub`). A pre-created row has a different id than the eventual
sub, so a naive insert-on-conflict-id at login would hit the email-unique
constraint and fail.

**How to apply:** The login path (`upsertUser` in auth.ts) first looks up any
row with the same (lowercased) email; if found with a different id, it *adopts*
the real sub onto that row (`UPDATE ... SET id = sub`) and preserves the role,
instead of inserting. This is only safe because no FK references `users.id`
(changing a PK in place would otherwise break references). Emails are
normalized to lowercase on both invite-create and login so the match holds.
Role is still never written from login claims — it stays app-managed.
