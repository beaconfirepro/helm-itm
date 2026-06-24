---
name: Express 5 params strict typing
description: Express 5 types req.params as string|string[], which Drizzle eq() rejects for columns with strict enum types.
---

**Rule:** Always cast `req.params` fields to `string` before passing to Drizzle `eq()`.

**Why:** Express 5 `ParamsDictionary` types each field as `string | string[]`. Drizzle's `eq()` overloads for columns with `enumValues: [string, ...string[]]` do not accept `string[]`, causing a TS2769 overload error.

**How to apply:** Use `const id = req.params["id"] as string;` (or `req.params.id as string`) rather than plain destructuring when the value will be passed to a Drizzle query with a strict text PK column.
