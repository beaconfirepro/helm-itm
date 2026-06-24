import { Router, type IRouter, type Request, type Response } from "express";
import {
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
  SetMyAvatarBody,
  SetMyAvatarResponse,
  ClearMyAvatarResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSession } from "../lib/session";
import { ensureUserRow, buildAuthUserResponse } from "../lib/profile";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.use(requireSession);

/**
 * PATCH /profile — update the current user's display name and preferences.
 * Email and role are read-only and are never touched here.
 */
router.patch("/profile", async (req: Request, res: Response) => {
  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid fields" });
    return;
  }

  const user = req.user!;
  await ensureUserRow(user);

  const data = parsed.data;
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (data.displayName !== undefined) {
    const trimmed = data.displayName?.trim();
    updates.displayName = trimmed ? trimmed : null;
  }
  if (data.theme !== undefined) updates.theme = data.theme;
  if (data.language !== undefined) updates.language = data.language;
  if (data.currency !== undefined) {
    updates.currency = data.currency.toUpperCase();
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(usersTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
  }

  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, user.id));

  res.json(UpdateMyProfileResponse.parse({ user: buildAuthUserResponse(row) }));
});

/**
 * PUT /profile/avatar — set the current user's uploaded photo.
 * Normalizes the uploaded object path, marks it publicly readable so it can be
 * served as an avatar, and stores it separately from the synced profile image.
 */
router.put("/profile/avatar", async (req: Request, res: Response) => {
  const parsed = SetMyAvatarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid fields" });
    return;
  }

  const user = req.user!;
  await ensureUserRow(user);

  let normalizedPath: string;
  try {
    normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
      parsed.data.avatarUrl,
      { owner: user.id, visibility: "public" },
    );
  } catch (error) {
    req.log.error({ err: error }, "Failed to set avatar ACL");
    res.status(400).json({ error: "Could not process the uploaded image" });
    return;
  }

  await db
    .update(usersTable)
    .set({ avatarUrl: normalizedPath, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, user.id));

  res.json(SetMyAvatarResponse.parse({ user: buildAuthUserResponse(row) }));
});

/**
 * DELETE /profile/avatar — clear the uploaded photo (falls back to synced image).
 */
router.delete("/profile/avatar", async (req: Request, res: Response) => {
  const user = req.user!;
  await ensureUserRow(user);

  await db
    .update(usersTable)
    .set({ avatarUrl: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, user.id));

  res.json(ClearMyAvatarResponse.parse({ user: buildAuthUserResponse(row) }));
});

export default router;
