import { Router, type IRouter } from "express";
import { requireSession, getSession } from "../lib/session";
import { db } from "@workspace/db";
import { organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.use(requireSession);

/**
 * GET /api/org
 *
 * Returns the authenticated organisation's record.
 * Used by the frontend shell to confirm the session is valid and show
 * the org name in the nav header.
 */
router.get("/org", async (req, res) => {
  const { orgId } = getSession(req);

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  res.json({ org });
});

export default router;
