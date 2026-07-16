import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { initializeRuntimeStore } from "./data/runtime-store.js";
import { flushPostgresRuntimeStore } from "./data/postgres-runtime-store.js";
import { OutboxDeliveryService } from "./services/outbox-delivery.service.js";

await initializeRuntimeStore();
const app = createApp({ loadRuntime: false });
const outboxDelivery = new OutboxDeliveryService();
outboxDelivery.start();

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on ${env.APP_BASE_URL}`, {
    port: env.PORT,
    environment: env.NODE_ENV
  });
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Graceful shutdown started", { signal });
  await new Promise<void>((resolve) => server.close(() => resolve()));
  outboxDelivery.stop();
  await flushPostgresRuntimeStore();
  logger.info("Graceful shutdown completed", { signal });
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
