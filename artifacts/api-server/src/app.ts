import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import healthRouter from "./routes/health";
import externalRouter from "./routes/external";
import apiRouter from "./routes/api";
import configRouter from "./routes/config";
import projectsRouter from "./routes/projects";
import streamsRouter from "./routes/streams";
import deadlinesRouter from "./routes/deadlines";
import invoicesRouter from "./routes/invoices";
import holdsRouter from "./routes/holds";
import monthlyRouter from "./routes/monthly";
import noticesRouter, { mailingWebhookRouter } from "./routes/notices";
import waiversRouter from "./routes/waivers";
import notaryRouter from "./routes/notary";
import filingRouter from "./routes/filing";
import reportsRouter from "./routes/reports";
import auditRouter from "./routes/audit";
import collectionsRouter from "./routes/collections";
import usersRouter from "./routes/users";
import authRouter from "./routes/auth";
import devRouter from "./routes/dev";
import profileRouter from "./routes/profile";
import storageRouter from "./routes/storage";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Replit Auth — loads the OIDC session onto req.user and patches
// req.isAuthenticated() on every request. Must run before any router that
// calls requireSession/getSession.
app.use(authMiddleware);

// All routes live under /api — the Replit proxy forwards /api/* to port 8080
// without stripping the prefix.
// Order matters: more-specific prefixes must be registered BEFORE /api catch-alls.
app.use("/api", healthRouter);          // GET /api/health, GET /api/healthz  (no auth)
app.use("/api", authRouter);            // GET /api/auth/user, /login, /callback, /logout
app.use("/api", devRouter);             // GET/POST /api/dev/auth*  (dev login bypass only)
app.use("/api", profileRouter);         // PATCH /api/profile, PUT/DELETE /api/profile/avatar (session)
app.use("/api", storageRouter);         // POST /api/storage/uploads/request-url, GET /api/storage/* (object storage)
app.use("/api", externalRouter);        // GET /api/external/reference         (service-key)

app.use("/api/config", configRouter);        // GET/POST /api/config/*              (session)
app.use("/api/projects", projectsRouter);   // GET/POST /api/projects/*            (session)
app.use("/api/lien/projects", projectsRouter); // /api/lien/projects/* aliases (task contract)
app.use("/api", streamsRouter);             // POST /api/streams/open, PATCH /api/streams/:id/*
app.use("/api/lien", streamsRouter);        // GET /api/lien/streams/:id alias (task contract)
app.use("/api", deadlinesRouter);           // GET /api/deadlines/:workMonthId
app.use("/api", invoicesRouter);            // GET/POST /api/invoices/*
app.use("/api", holdsRouter);               // GET/POST /api/holds/*
app.use("/api/monthly", monthlyRouter);     // POST /api/monthly/run, GET /api/monthly/report, etc.
app.use("/api", noticesRouter);             // POST /api/notices, PATCH /api/notices/:id, etc.
app.use("/api", mailingWebhookRouter);      // POST /api/webhooks/mailing           (no auth — Shippo callback)
app.use("/api", waiversRouter);             // POST /api/waivers, GET /api/waivers/exposure, etc.
app.use("/api", notaryRouter);              // POST /api/notary/orders, /api/notary/orders/status
app.use("/api", filingRouter);              // POST /api/filing/:streamId/*, GET /api/filing/stream/:sid
app.use("/api", reportsRouter);             // GET /api/reports/exposure, /timeline/:id, /lapsed
app.use("/api", auditRouter);               // GET /api/audit                      (admin)
app.use("/api/collections", collectionsRouter); // GET/POST /api/collections/*     (session)
app.use("/api", usersRouter);               // GET /api/users, PATCH /api/users/:id/role (admin)
app.use("/api", apiRouter);                 // GET /api/org, etc.                  (session, catch-all)

export default app;
