# Release beta checklist

Checklist para preparar una beta real supervisada de I Love Fresas. Este documento no cambia la logica del bot: solo define como correrlo, verificarlo y reaccionar ante fallas.

## 1. Preparacion inicial

1. Abrir PowerShell.
2. Entrar al proyecto:

```powershell
cd "C:\Users\PC\Documents\chatbot i love fresas v2"
```

3. Instalar dependencias si es la primera vez o si cambio `package-lock.json`:

```powershell
npm install
```

4. Crear o revisar `.env` a partir de `.env.example`.

## 2. Variables de entorno necesarias

Base:

```text
PORT=3000
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
LLM_PROVIDER=openai
AI_MAX_OUTPUT_TOKENS=400
AI_MAX_CALLS_PER_CONVERSATION=12
CONVERSATION_MEMORY_MESSAGE_LIMIT=24
MENU_PDF_PATH=C:\Users\PC\Desktop\Menu ILoveFresas.pdf
```

OpenAI:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
```

Telegram cliente/admin:

```text
TELEGRAM_CLIENT_BOT_TOKEN=...
TELEGRAM_ADMIN_BOT_TOKEN=...
TELEGRAM_ADMIN_CHAT_ID=...
TELEGRAM_POLL_INTERVAL_MS=1500
```

WhatsApp Cloud API:

```text
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

Notas:

- Para beta local con Telegram, `TELEGRAM_CLIENT_BOT_TOKEN`, `TELEGRAM_ADMIN_BOT_TOKEN` y `TELEGRAM_ADMIN_CHAT_ID` son obligatorios.
- Para WhatsApp real, `APP_BASE_URL` debe ser una URL publica alcanzable por Meta, no `localhost`.
- Si `LLM_PROVIDER=heuristic`, el bot corre sin IA externa, pero la beta real deberia probarse con el proveedor elegido.
- No subir `.env` al repo.

## 3. Comandos de verificacion antes de iniciar beta

Ejecutar en este orden:

```powershell
npm run typecheck
npm run build
npm run qa:conversation
npm run qa:redteam
npm run qa:chaos
```

Estado aceptado para iniciar:

- `typecheck`: exit 0.
- `build`: exit 0.
- `qa:conversation`: 11/11.
- `qa:redteam`: 100/100.
- `qa:chaos`: 50/50.

Si falla una suite alta/critica, no iniciar beta hasta revisar.

## 4. Como correr el bot localmente

Servidor Express local:

```powershell
npm run dev
```

Probar health check:

```text
http://localhost:3000/health
```

Probar simulador local:

```text
http://localhost:3000/local-test
```

## 5. Como iniciar Telegram local

1. Verificar `.env` con tokens de cliente/admin.
2. Si falta `TELEGRAM_ADMIN_CHAT_ID`, correr:

```powershell
npm run telegram:dev
```

3. En Telegram, abrir el bot admin y escribir:

```text
/id
```

4. Copiar el `chat_id` al `.env`.
5. Reiniciar Telegram local:

```powershell
npm run telegram:dev
```

6. En el bot cliente, usar:

```text
/newchat
```

7. Hacer pedidos reales de prueba. Cuando el pedido quede completo, el bot admin debe recibir el resumen.

## 6. Como iniciar WhatsApp

WhatsApp requiere una URL publica para webhook.

1. Correr el servidor:

```powershell
npm run dev
```

2. Exponer `APP_BASE_URL` con un dominio publico o tunel seguro.
3. Configurar en Meta Developers:

```text
GET/POST {APP_BASE_URL}/webhook/whatsapp
```

4. Usar el mismo `WHATSAPP_VERIFY_TOKEN` del `.env`.
5. Configurar `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
6. Enviar un mensaje real al numero de prueba.
7. Confirmar que el endpoint responde y que el bot devuelve texto.

Durante beta, WhatsApp debe estar supervisado por operador.

## 7. Como detener el bot

Si corre en la misma terminal:

```text
Ctrl + C
```

Si Telegram corre oculto y existe `.telegram-local.pid`:

```powershell
$pidValue = Get-Content .telegram-local.pid
Stop-Process -Id ([int]$pidValue)
```

Si el puerto `3000` queda ocupado:

```powershell
netstat -ano | findstr :3000
Stop-Process -Id <PID>
```

Usar `Stop-Process` solo sobre procesos identificados del proyecto.

## 8. Que revisar si falla

Si no arranca:

- Revisar que `npm install` haya corrido.
- Revisar version de Node: debe ser `>=20`.
- Revisar `.env` y tokens vacios.
- Revisar que `PORT=3000` no este ocupado.

Si Telegram no responde:

- Verificar `TELEGRAM_CLIENT_BOT_TOKEN`.
- Verificar que el bot no tenga webhook activo en otro entorno.
- Reiniciar `npm run telegram:dev`.
- Probar `/id` en el bot admin.
- Revisar `TELEGRAM_ADMIN_CHAT_ID`.

Si el admin no recibe pedidos:

- Confirmar que el pedido llego a estado `pending_review`.
- Confirmar `TELEGRAM_ADMIN_BOT_TOKEN`.
- Confirmar `TELEGRAM_ADMIN_CHAT_ID`.
- Usar `/pedidos` en el bot admin.

Si el bot responde raro:

- Confirmar `LLM_PROVIDER`.
- Confirmar `OPENAI_API_KEY` si usa OpenAI.
- Revisar si excedio `AI_MAX_CALLS_PER_CONVERSATION`.
- Reiniciar conversacion con `/newchat`.
- Registrar el error en el formato de `docs/beta-supervisada.md`.

Si WhatsApp no verifica webhook:

- Revisar `WHATSAPP_VERIFY_TOKEN`.
- Revisar que `APP_BASE_URL` sea publico.
- Revisar que Meta apunte a `/webhook/whatsapp`.

## 9. Checklist final antes de abrir beta

- QA verde.
- `.env` completo.
- Menu PDF existe en `MENU_PDF_PATH`.
- Bot cliente responde.
- Bot admin responde `/id` y `/pedidos`.
- Operador conoce `docs/operador-quickstart.md`.
- Se esta registrando cada error real.
- Nadie despacha sin revision humana.
