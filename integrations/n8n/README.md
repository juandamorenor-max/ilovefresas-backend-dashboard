# n8n Telegram V3

n8n es solo adaptador de canal:

```text
Telegram Trigger -> Normalize Telegram -> POST /bot/turn -> Send Message
```

No llama Flowise, no guarda estado y no contiene IDs fijos de usuarios. El Chat
ID de respuesta siempre sale del mismo mensaje entrante.

Variables requeridas en n8n:

- `ILOVEFRESAS_BACKEND_URL`
- `BOT_INTEGRATION_SECRET`

El workflow debe enviar `externalMessageId` con `update_id` y `message_id`. Si el
backend devuelve `duplicate=true`, no vuelve a enviar la respuesta.

