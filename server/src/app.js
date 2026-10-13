import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { authRoutes, csrfGuard } from "./auth.js";
import { firmRoutes, schedulerRoute } from "./routes.js";
import { portalRoutes } from "./portal.js";
import { createStorage } from "./storage.js";
import { createExtractor } from "./extractor.js";
import { createJobRunner } from "./jobs.js";
import { createReminders } from "./reminders.js";
import { requestContext, errorHandler, missing } from "./errors.js";
import { samples } from "./samples.js";

export function createApp(config, overrides = {}) {
  const app = express(),
    storage = overrides.storage || createStorage(config),
    extractor = overrides.extractor || createExtractor(config),
    runner = createJobRunner(config, storage, extractor),
    reminders = createReminders(config);
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    requestContext,
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          frameSrc: ["'self'"],
          objectSrc: ["'self'"],
          upgradeInsecureRequests: config.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
    cookieParser(),
    express.json({ limit: "256kb" }),
  );
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.get("/readyz", (_req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ ready: mongoose.connection.readyState === 1 }),
  );
  app.use(
    "/api",
    (_req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      next();
    },
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    csrfGuard(config),
  );
  app.use("/api/auth", authRoutes(config));
  app.post("/api/internal/tick", schedulerRoute(config, runner, reminders));
  if (config.DEMO_MODE)
    app.get("/api/samples/:name", async (req, res) => {
      const sample = (await samples()).find((s) => s.name === req.params.name);
      if (!sample) throw missing();
      res
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sample.name}"`,
        })
        .send(sample.buffer);
    });
  app.use("/api/portal", portalRoutes(storage, config));
  app.use("/api", firmRoutes(config, storage, runner, reminders));
  app.use("/api", (_req, _res, next) => next(missing()));
  const dist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../client/dist",
  );
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
  app.use(errorHandler);
  return { app, runner, reminders, storage };
}
