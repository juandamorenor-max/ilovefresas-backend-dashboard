# Chatbot I Love Fresas v2

Base tecnica para un chatbot de pedidos por WhatsApp orientado a restaurantes con domicilio. Este repo arranca con un solo negocio demo (`I Love Fresas`) y deja preparada una arquitectura reusable para futuros restaurantes.

## Que trae hoy

- Backend `Node.js + TypeScript + Express`
- Webhook de WhatsApp con verificacion `GET /webhook/whatsapp`
- Recepcion de mensajes `POST /webhook/whatsapp`
- Flujo conversacional MVP en memoria para:
  - mostrar menu
  - iniciar pedido
  - capturar datos de entrega en bloque para reducir friccion
  - inferir zona de entrega por texto
  - calcular subtotal, domicilio y total estimado
  - crear pedido con estado `pending_review`
  - notificar al operario por un canal admin
- API admin minima para pedidos, productos, estado del negocio y cierres especiales
- Dashboard operador integrado en `GET /dashboard`
- `schema.sql` y `seed.sql` para migrar despues a PostgreSQL real
- Capa conversacional OpenAI-first:
  - `OpenAIOrderEngine` interpreta cada mensaje y devuelve JSON estructurado
  - el backend valida catalogo, precios, opciones, zonas, pagos y cierres
  - selector por `LLM_PROVIDER` para pruebas o fallback controlado
  - limites configurables por conversacion
- Simulador local en navegador para probar el bot sin WhatsApp
- Runner local de Telegram con bot cliente y bot admin

## Decisiones importantes

- El sistema no depende todavia de Postgres para correr localmente. Usa un store demo en memoria para facilitar iteracion temprana.
- La arquitectura ya esta separada en servicios para que la persistencia se pueda mover luego a Postgres sin reescribir toda la aplicacion.
- OpenAI es el interprete principal del lenguaje natural. El backend no intenta "entender" con un arbol de frases: solo aplica guardrails operativos.
- La IA interpreta mensajes, pero no define precios, no inventa catalogo y no cierra pedidos con datos incompletos.

## Estructura

```text
src/
  app.ts
  server.ts
  config/
  controllers/
  data/
  db/
  prompts/
  routes/
  services/
  types/
  utils/
```

## Variables de entorno

Revisa [.env.example](/C:/Users/PC/Documents/chatbot%20i%20love%20fresas%20v2/.env.example).

Claves relevantes:

- `LLM_PROVIDER`: `openai` recomendado para beta real. `heuristic` queda solo como modo legacy/desarrollo.
- `AI_ORDER_ENGINE_MODE`: `true` activa `OpenAIOrderEngine` como camino principal de conversacion.
- `AI_AGENT_MODE`: mantiene ayudas IA complementarias para capas legacy.
- `AI_STRICT_PROVIDER`: evita caer silenciosamente a heuristicas cuando se espera proveedor real.
- `AI_MAX_OUTPUT_TOKENS`: limite de salida del proveedor IA.
- `AI_MAX_CALLS_PER_CONVERSATION`: limite de llamadas IA por conversacion.
- `WHATSAPP_VERIFY_TOKEN`: token de verificacion del webhook de Meta.
- `WHATSAPP_ACCESS_TOKEN`: token para enviar mensajes reales.
- `WHATSAPP_PHONE_NUMBER_ID`: id del numero en WhatsApp Cloud API.
- `TELEGRAM_CLIENT_BOT_TOKEN`: token del bot que conversa con clientes.
- `TELEGRAM_ADMIN_BOT_TOKEN`: token del bot que recibe pedidos/admin.
- `TELEGRAM_ADMIN_CHAT_ID`: chat donde el bot admin envia pedidos pendientes.
- `TELEGRAM_POLL_INTERVAL_MS`: pausa entre reintentos del polling local.
- `OPENAI_API_KEY`: habilita clasificacion via OpenAI.
- `OPENAI_MODEL`: por defecto `gpt-5.4-mini`.
- `GEMINI_API_KEY`: habilita clasificacion via Gemini.
- `GEMINI_MODEL`: por defecto `gemini-3.5-flash`.
- `RUNTIME_STORE_PATH`: ruta del snapshot JSON operativo.
- `DATABASE_URL`: URL Postgres. En V1 se usa para el ledger contable de pedidos despachados.

## Como correr localmente

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` a partir de `.env.example`.

3. Inicia en desarrollo:

```bash
npm run dev
```

4. Health check:

```bash
GET http://localhost:3000/health
```

5. Simulador local:

```text
http://localhost:3000/local-test
```

6. Dashboard operador:

```text
http://localhost:3000/dashboard
```

7. Telegram local, sin webhook ni deploy:

```bash
npm run telegram:dev
```

Para beta supervisada local con servidor, dashboard y Telegram compartiendo memoria:

```bash
npm run beta:local
```

Para usarlo crea dos bots con BotFather: uno para clientes y otro para admin. Primero escribe `/id` al bot admin para obtener tu `chat_id`, luego guardalo en `TELEGRAM_ADMIN_CHAT_ID`.

## Endpoints disponibles

### Health

- `GET /health`

### WhatsApp

- `GET /webhook/whatsapp`
- `POST /webhook/whatsapp`

### Admin

- `GET /admin/orders`
- `GET /admin/orders/:id`
- `PATCH /admin/orders/:id/status`
- `GET /admin/dashboard/orders`
- `GET /admin/dashboard/orders/:id`
- `PATCH /admin/dashboard/orders/:id`
- `PATCH /admin/dashboard/orders/:id/status`
- `POST /admin/dashboard/orders/:id/notify-dispatched`
- `GET /admin/dashboard/conversations`
- `GET /admin/dashboard/conversations/:id`
- `GET /admin/dashboard/products`
- `GET /admin/dashboard/modifiers`
- `GET /admin/dashboard/business-status`
- `GET /admin/products`
- `POST /admin/products`
- `PATCH /admin/products/:id`
- `PATCH /admin/products/:id/availability`
- `GET /admin/modifiers`
- `POST /admin/modifiers`
- `PATCH /admin/modifiers/:id`
- `PATCH /admin/modifiers/:id/availability`
- `GET /admin/business-status`
- `PATCH /admin/business-status`
- `GET /admin/special-closures`
- `POST /admin/special-closures`
- `DELETE /admin/special-closures/:id`

### Bot integration

- `GET /bot/catalog/available` con `x-bot-secret`
- `POST /bot/turn` con `x-bot-secret`
- `GET /bot/conversations/:channel/:chatId/active` con `x-bot-secret`
- `POST /bot/conversations/:channel/:chatId/new` con `x-bot-secret`
- `PATCH /bot/conversations/:conversationId/state` con `x-bot-secret`
- `POST /bot/conversations/:conversationId/orders/review` con `x-bot-secret`

Para validar que dashboard, catalogo y bot estan conectados:

```bash
npm run test:dashboard-operational
```

## Persistencia operativa V1

Para que cambios hechos desde dashboard sobrevivan reinicios, configura una ruta de snapshot:

```text
RUNTIME_STORE_PATH=/data/ilovefresas-runtime-store.json
```

En Railway, monta un Volume en `/data` para que esa ruta sobreviva redeploys. Sin `RUNTIME_STORE_PATH`, el sistema usa memoria de proceso.

Verifica el estado en:

```text
GET /health/integration
```

El campo `storage` indica si esta configurado y si la ruta es escribible.

Prueba:

```bash
npm run test:runtime-store
```

## Base contable de pedidos enviados

Cuando `DATABASE_URL` esta configurado, cada pedido que pasa a estado `dispatched` se guarda tambien en Postgres, en la tabla:

```text
accounting_dispatched_orders
```

Ese registro queda separado del snapshot operativo y contiene lo necesario para contabilidad:

- `customer_phone`
- `customer_name`
- `address`
- `neighborhood`
- `address_reference`
- `payment_method`
- `cash_amount`
- `subtotal`
- `delivery_fee`
- `discount_total`
- `total`
- `dispatched_at`
- `order_snapshot`

El guardado se dispara al usar el boton de despacho del dashboard o al cambiar el estado del pedido a `dispatched`.

Para Railway, agrega Postgres al proyecto y configura:

```text
DATABASE_URL=<url interna o publica de Postgres>
```

Verifica que este activo en:

```text
GET /health/integration
```

El campo `accountingDatabase.configured` debe quedar en `true`.

Prueba repetible:

```bash
npm run qa:accounting-ledger
```

## Ejemplo de webhook entrante

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "metadata": {
              "display_phone_number": "573001112233"
            },
            "messages": [
              {
                "from": "573009998877",
                "type": "text",
                "text": {
                  "body": "Quiero una fresas con crema tradicional con brownie y sin crema"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## Ejemplo de flujo

1. Cliente escribe pedido libre.
2. El sistema intenta mapearlo a un producto y modificadores.
3. El bot resume lo entendido y pide los datos faltantes en un solo mensaje.
4. El cliente envia nombre, direccion, barrio/referencia y pago juntos.
5. El sistema intenta inferir zona y calcular domicilio.
6. Si ya tiene producto, nombre, direccion y pago, crea pedido `pending_review`.
7. El pedido se envia al canal del operario para revision y despacho.

## Como conectar WhatsApp Cloud API

1. Crea una app en Meta Developers.
2. Configura WhatsApp Cloud API.
3. Define el webhook hacia:

```text
GET/POST {APP_BASE_URL}/webhook/whatsapp
```

4. Usa el mismo `WHATSAPP_VERIFY_TOKEN` del `.env`.
5. Guarda `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.

Cuando esas variables no estan configuradas, el envio de mensajes se mockea y solo queda registrado en logs.

## Como conectar OpenAI

La integracion principal usa `POST /v1/responses` y parsea JSON estructurado desde `OpenAIOrderEngine`. En beta real recomendamos:

```env
LLM_PROVIDER=openai
AI_ORDER_ENGINE_MODE=true
AI_AGENT_MODE=true
AI_STRICT_PROVIDER=true
AI_MAX_OUTPUT_TOKENS=1400
OPENAI_API_KEY=tu_key
```

OpenAI interpreta intencion, productos, cambios, preguntas, datos de entrega y pago. El backend valida IDs reales, precios, opciones obligatorias, domicilio, metodo de pago y estados seguros antes de modificar el pedido.

## Como conectar Gemini

La integracion actual usa `POST /v1beta/models/{model}:generateContent` y parsea JSON cuando existe `GEMINI_API_KEY`. Para este producto, Gemini queda como alternativa experimental; la beta principal debe correr con OpenAI.

## Como probar sin WhatsApp

1. Define `LLM_PROVIDER=openai` y `AI_ORDER_ENGINE_MODE=true`.
2. Llena `OPENAI_API_KEY`.
3. Ejecuta `npm run dev`.
4. Abre:

```text
http://localhost:3000/local-test
```

5. Escribe mensajes como si fueras el cliente.
6. Usa `Nuevo` para reiniciar esa conversacion local.
7. La vista muestra:
   - respuesta del bot
   - fuente de clasificacion (`heuristic`, `openai`, `gemini` o `stateful`)
   - estado de la conversacion
   - contador de uso IA en esa conversacion

## Como probar con Telegram local

1. Crea `I Love Fresas Cliente` en BotFather y copia su token a `TELEGRAM_CLIENT_BOT_TOKEN`.
2. Crea `I Love Fresas Admin` en BotFather y copia su token a `TELEGRAM_ADMIN_BOT_TOKEN`.
3. Ejecuta `npm run telegram:dev`.
4. Abre chat con el bot admin y escribe `/id`.
5. Copia el numero que responde en `TELEGRAM_ADMIN_CHAT_ID`.
6. Reinicia `npm run telegram:dev`.
7. Escribe al bot cliente como cliente real. Cuando el pedido quede completo, el bot admin recibe el resumen operativo.

## Como revisar pedidos en el dashboard

1. Ejecuta `npm run beta:local` para que backend, dashboard y Telegram compartan los mismos pedidos en memoria.
2. Abre `http://localhost:3000/dashboard`.
3. Entra como `Operario`.
4. Simula o recibe un pedido por Telegram/WhatsApp.
5. Abre `Pedidos` para revisar producto, direccion, zona, pago y total.
6. Abre `Conversaciones` para ver los mensajes asociados al cliente.
7. Marca el pedido como `Confirmado`, `Preparando`, `Despachado`, `Completado` o `Cancelado` segun corresponda.

Mas detalle en [docs/dashboard-operador.md](/C:/Users/PC/Documents/chatbot%20i%20love%20fresas%20v2/docs/dashboard-operador.md).

## Limites actuales

- Persistencia todavia en memoria.
- Sin autenticacion para panel admin.
- Sin motor completo de promociones.
- Inferencia de zona todavia simple por coincidencia de texto.
- Parser de pedido libre todavia basico.
- Telegram local usa long polling; para produccion conviene migrar a webhook.

## Proximos pasos recomendados

1. Reemplazar store en memoria por repositorios Postgres.
2. Formalizar el modelo de catalogo configurable:
   - grupos de ingredientes
   - recetas por defecto
   - reemplazos
   - reglas de precio
3. Implementar motor tipificado de promociones.
4. Agregar autenticacion y roles al panel admin.
5. Mejorar la extraccion estructurada de pedidos con IA + validacion deterministica.
