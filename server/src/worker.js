import { loadConfig } from "./config.js";
import { connectDatabase } from "./models.js";
import { createApp } from "./app.js";
const config = loadConfig();
await connectDatabase(config.MONGODB_URI);
const { runner, reminders } = createApp(config);
setInterval(() => runner.tick().catch(() => {}), 3000);
setInterval(() => reminders.tick().catch(() => {}), 15 * 60000);
