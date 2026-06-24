import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  override: process.env.NODE_ENV !== "production"
});

const envBoolean = z
  .enum(["true", "false", "1", "0", "yes", "no", "on", "off"])
  .optional()
  .transform((value) => ["true", "1", "yes", "on"].includes(value ?? "false"));

const envBooleanDefault = (defaultValue: boolean) =>
  z
    .enum(["true", "false", "1", "0", "yes", "no", "on", "off"])
    .optional()
    .transform((value) =>
      value === undefined
        ? defaultValue
        : ["true", "1", "yes", "on"].includes(value)
    );

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOCAL_FORCE_BUSINESS_OPEN: envBoolean,
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  LLM_PROVIDER: z.enum(["heuristic", "openai", "gemini", "flowise"]).default("openai"),
  AI_AGENT_MODE: envBooleanDefault(true),
  AI_ORDER_ENGINE_MODE: envBooleanDefault(true),
  AI_ENGINE_ARCHITECTURE: z.enum(["single", "multi"]).default("multi"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1400),
  AI_MAX_CALLS_PER_CONVERSATION: z.coerce.number().int().positive().default(12),
  AI_STRICT_PROVIDER: envBooleanDefault(true),
  OPENAI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(4),
  OPENAI_RETRY_BASE_MS: z.coerce.number().int().positive().default(1500),
  CONVERSATION_MEMORY_MESSAGE_LIMIT: z.coerce.number().int().positive().default(24),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  OPENAI_VISION_MODEL: z.string().default("gpt-4o-mini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  FLOWISE_API_URL: z.string().url().default("http://localhost:3001"),
  FLOWISE_CHATFLOW_ID: z.string().optional(),
  FLOWISE_API_KEY: z.string().optional(),
  BOT_INTEGRATION_SECRET: z.string().optional(),
  BOT_TURN_INCLUDE_RAW: envBooleanDefault(false),
  DEFAULT_DELIVERY_FEE: z.coerce.number().int().nonnegative().default(5000),
  CATALOG_PATH: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default("change-me"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  TELEGRAM_CLIENT_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),
  TELEGRAM_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  MENU_PDF_PATH: z.string().default("assets/menu/Menu 2026.pdf"),
  SPEC_ASSETS_DIR: z.string().default("assets/specifications"),
  RUNTIME_STORE_PATH: z.string().optional(),
  DATABASE_URL: z.string().optional()
});

export const env = envSchema.parse(process.env);
