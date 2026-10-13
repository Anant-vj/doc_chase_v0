import { defineConfig, createLogger } from "vite";
import react from "@vitejs/plugin-react";
const logger = createLogger();
const originalError = logger.error.bind(logger);
logger.error = (message, options) =>
  originalError(message.replace(/[a-f0-9]{64}/gi, "[redacted]"), options);
export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/healthz": "http://127.0.0.1:3001",
    },
  },
});
