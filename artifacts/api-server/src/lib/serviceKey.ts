import { Request, Response, NextFunction } from "express";

/**
 * requireServiceKey — authenticates machine callers (Helm Core) via the
 * `X-Service-Key` header.
 *
 * Always fail-closed:
 *   - 503 when SERVICE_KEY secret is not configured on the server
 *   - 401 when the provided key is absent or does not match
 *
 * Set SERVICE_KEY in Replit Secrets before using the /external/* endpoints.
 */
export function requireServiceKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.SERVICE_KEY;

  if (!expected) {
    res
      .status(503)
      .json({ error: "SERVICE_KEY is not configured on this server" });
    return;
  }

  const provided = req.headers["x-service-key"] as string | undefined;
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Invalid or missing X-Service-Key header" });
    return;
  }

  next();
}
