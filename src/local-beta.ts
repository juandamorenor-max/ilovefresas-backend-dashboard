import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { TelegramBotRunnerService } from "./services/telegram-bot-runner.service.js";
import { logger } from "./utils/logger.js";
import { initializeRuntimeStore } from "./data/runtime-store.js";

const pidFile = join(process.cwd(), ".beta-local.pid");
writeFileSync(pidFile, String(process.pid));

await initializeRuntimeStore();
const app = createApp({ loadRuntime: false });
const runner = new TelegramBotRunnerService();

const server = app.listen(env.PORT, () => {
  logger.info(`Beta local listening on ${env.APP_BASE_URL}`, {
    dashboard: `${env.APP_BASE_URL}/dashboard`,
    port: env.PORT,
    environment: env.NODE_ENV
  });
});

runner.start().catch((error) => {
  logger.error("Telegram runner failed in beta local mode", {
    error: error instanceof Error ? error.message : "unknown"
  });
});

function shutdown() {
  logger.info("Stopping beta local process");
  runner.stop();
  server.close(() => {
    unlinkPidFile();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function unlinkPidFile() {
  try {
    unlinkSync(pidFile);
  } catch {
    // Ignore cleanup errors during shutdown.
  }
}
