import { env } from "./config/env.js";
import { TelegramService } from "./services/telegram.service.js";

const telegramService = new TelegramService();

if (!env.TELEGRAM_ADMIN_BOT_TOKEN) {
  console.log("Falta TELEGRAM_ADMIN_BOT_TOKEN en .env");
  process.exit(1);
}

await telegramService.deleteWebhook(env.TELEGRAM_ADMIN_BOT_TOKEN);
const updates = await telegramService.getUpdates(env.TELEGRAM_ADMIN_BOT_TOKEN, undefined, 1);
const messages = updates
  .map((update) => update.message)
  .filter((message) => message?.chat.id !== undefined);

if (messages.length === 0) {
  console.log(
    [
      "No encontre mensajes recientes para el bot admin.",
      "Abre Telegram, escribe cualquier mensaje al bot admin, por ejemplo: hola",
      "Luego vuelve a correr: npm run telegram:admin-id"
    ].join("\n")
  );
  process.exit(0);
}

for (const message of messages) {
  console.log(
    [
      `chat_id=${message!.chat.id}`,
      `tipo=${message!.chat.type}`,
      message!.chat.username ? `username=@${message!.chat.username}` : null,
      message!.chat.first_name ? `nombre=${message!.chat.first_name}` : null,
      message!.text ? `ultimo_mensaje=${message!.text}` : null
    ]
      .filter(Boolean)
      .join(" | ")
  );
}
