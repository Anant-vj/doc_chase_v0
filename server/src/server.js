import mongoose from "mongoose";
import { loadConfig } from "./config.js";
import { connectDatabase } from "./models.js";
import { createApp } from "./app.js";
import { logger } from "./errors.js";
const config = loadConfig();
await connectDatabase(config.MONGODB_URI);
const { app, runner, reminders } = createApp(config);
const server = app.listen(config.PORT, "0.0.0.0", () =>
  logger.info({ port: config.PORT }, "DocChase is ready"),
);
let jobsTimer, reminderTimer;
if (config.RUN_WORKER) {
  jobsTimer = setInterval(
    () => runner.tick().catch(() => logger.warn("Job tick failed")),
    3000,
  );
  reminderTimer = setInterval(
    () => reminders.tick().catch(() => logger.warn("Reminder tick failed")),
    15 * 60000,
  );
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(jobsTimer);
    clearInterval(reminderTimer);
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  });
