import { randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";

export function loadConfig(env = process.env) {
  const schema = z.object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    APP_URL: z.url().default("http://localhost:5173"),
    MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/docchase"),
    JWT_SECRET: z.string().min(32).optional(),
    RUN_WORKER: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    DEMO_MODE: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),
    UPLOAD_DIR: z.string().default(".local/uploads"),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_BUCKET: z.string().default("docchase-private"),
    EXTRACTOR_PROVIDER: z
      .enum(["manual", "gemini", "fixture"])
      .default("manual"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
    DAILY_EXTRACTION_LIMIT: z.coerce.number().int().positive().default(40),
    MAIL_PROVIDER: z.enum(["console", "brevo"]).default("console"),
    BREVO_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().default("demo@example.com"),
    SCHEDULER_SECRET: z.string().min(32).optional(),
  });
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const c = parsed.data;
  if (
    c.NODE_ENV === "production" &&
    (!c.JWT_SECRET || c.STORAGE_PROVIDER === "local" || !c.SCHEDULER_SECRET)
  )
    throw new Error(
      "Production requires JWT_SECRET, SCHEDULER_SECRET and private cloud storage.",
    );
  if (
    c.STORAGE_PROVIDER === "supabase" &&
    (!c.SUPABASE_URL || !c.SUPABASE_SERVICE_ROLE_KEY)
  )
    throw new Error("Private Supabase storage credentials are required.");
  if (c.EXTRACTOR_PROVIDER === "gemini" && !c.GEMINI_API_KEY)
    throw new Error("Gemini extraction requires an API key.");
  if (c.EXTRACTOR_PROVIDER === "fixture" && !c.DEMO_MODE)
    throw new Error("Fixture extraction is restricted to synthetic demo mode.");
  if (c.MAIL_PROVIDER === "brevo" && !c.BREVO_API_KEY)
    throw new Error("Brevo email requires an API key.");
  return {
    ...c,
    JWT_SECRET: c.JWT_SECRET || randomBytes(32).toString("hex"),
    UPLOAD_DIR: path.resolve(c.UPLOAD_DIR),
  };
}
