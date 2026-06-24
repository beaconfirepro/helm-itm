/**
 * notary.ts — Generic Remote Online Notarization routes.
 *
 * A general-purpose entry point so any document/subject can be sent for
 * notarization through NotaryLive — independent of the waiver-specific wiring
 * in waivers.ts (which calls the same underlying client).
 *
 * POST /notary/orders         create a notarization order for any signer
 * POST /notary/orders/status  poll an order's status by reference
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { requireSession } from "../lib/session";
import {
  createNotarySession,
  getNotaryOrderStatus,
  isNotaryLiveConfigured,
} from "../lib/notarylive";

const router = Router();

// POST /notary/orders — start a notarization order for an arbitrary document.
router.post("/notary/orders", requireSession, async (req, res) => {
  const {
    signerFirstName,
    signerLastName,
    signerEmail,
    internalId,
    preuploadId,
  } = req.body as {
    signerFirstName?: string;
    signerLastName?: string;
    signerEmail?: string;
    internalId?: string;
    preuploadId?: string;
  };

  if (!signerFirstName || !signerLastName || !signerEmail) {
    res.status(400).json({
      error: "signerFirstName, signerLastName, and signerEmail are required",
    });
    return;
  }

  const ref = internalId ?? `notary_${randomUUID()}`;

  const session = await createNotarySession({
    internalId: ref,
    signerFirstName,
    signerLastName,
    signerEmail,
    preuploadId,
  });

  res.json({
    ref: session.sessionRef,
    signingUrl: session.signingUrl,
    sandbox: !isNotaryLiveConfigured(),
  });
});

// POST /notary/orders/status — poll a notarization order by reference.
router.post("/notary/orders/status", requireSession, async (req, res) => {
  const { ref } = req.body as { ref?: string };

  if (!ref) {
    res.status(400).json({ error: "ref is required" });
    return;
  }

  const status = await getNotaryOrderStatus(ref);
  res.json({ ref, ...status, sandbox: !isNotaryLiveConfigured() });
});

export default router;
