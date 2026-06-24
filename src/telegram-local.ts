import { TelegramBotRunnerService } from "./services/telegram-bot-runner.service.js";
import { logger } from "./utils/logger.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const pidFile = join(process.cwd(), ".telegram-local.pid");
writeFileSync(pidFile, String(process.pid));

const runner = new TelegramBotRunnerService();

process.on("SIGINT", () => {
  logger.info("Stopping Telegram local polling");
  runner.stop();
  unlinkPidFile();
});

process.on("SIGTERM", () => {
  logger.info("Stopping Telegram local polling");
  runner.stop();
  unlinkPidFile();
});

await runner.start();

function unlinkPidFile() {
  try {
    unlinkSync(pidFile);
  } catch {
    // Ignore cleanup errors during shutdown.
  }
}
