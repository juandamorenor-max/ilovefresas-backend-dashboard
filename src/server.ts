import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Server listening on ${env.APP_BASE_URL}`, {
    port: env.PORT,
    environment: env.NODE_ENV
  });
});
