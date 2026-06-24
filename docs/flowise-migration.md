# Migracion a FlowiseAI

Objetivo: usar FlowiseAI como cerebro conversacional principal, sin perder el backend operativo actual.

## Arquitectura recomendada

```text
Telegram / WhatsApp
  -> Backend I Love Fresas
  -> Flowise Chatflow
  -> JSON estructurado de pedido
  -> Backend valida precios, catalogo, estados y operador
  -> Respuesta al cliente + dashboard
```

Flowise debe interpretar lenguaje natural. El backend solo valida y aplica:

- productos existentes
- variantes/opciones obligatorias
- toppings/adiciones reales
- precios
- estados del pedido
- pagos
- cierre seguro
- handoff a operario

## Variables de entorno

Para usar Flowise como proveedor:

```env
LLM_PROVIDER=flowise
AI_ORDER_ENGINE_MODE=true
AI_AGENT_MODE=true
AI_STRICT_PROVIDER=true

FLOWISE_API_URL=http://localhost:3001
FLOWISE_CHATFLOW_ID=2f2c7f3a-9a8d-4b70-9bbd-3d3833f78df7
FLOWISE_API_KEY=
```

Si Flowise tiene API key configurada, llenar `FLOWISE_API_KEY`.

## Como debe responder el chatflow

El chatflow debe devolver solamente JSON valido con el mismo contrato del `OpenAIOrderEngine`.

Campos principales:

- `intent`
- `confidence`
- `understood`
- `draftPatch`
- `pendingSelections`
- `catalogAnswer`
- `replyToCustomer`
- `needsHuman`
- `humanReason`
- `safeToApply`

No debe responder texto libre fuera del JSON.

## Endpoint usado por el backend

El backend llama:

```http
POST {FLOWISE_API_URL}/api/v1/prediction/{FLOWISE_CHATFLOW_ID}
Content-Type: application/json

{
  "question": "prompt completo con contexto, catalogo, draft e historial"
}
```

El backend intenta leer JSON desde:

- `json`
- `text`
- `answer`
- `response`
- `output`
- o desde el cuerpo completo si ya viene como objeto JSON.

## Pasos de prueba

1. Levantar Flowise localmente.
2. Crear un chatflow que reciba el prompt completo como input.
3. Configurar el LLM del chatflow.
4. Pegar como instrucciones que debe devolver JSON valido del contrato operativo.
5. Copiar el chatflow ID.
6. Cambiar `.env` a `LLM_PROVIDER=flowise`.
7. Reiniciar el backend:

```powershell
npm run beta:local
```

8. Probar `/newchat` desde Telegram.

## Importante

No meter reglas conversacionales en el backend para compensar Flowise.

Si Flowise se equivoca, corregir:

1. prompt del chatflow
2. memoria/contexto enviado
3. estructura JSON esperada
4. validaciones operativas generales del backend

Evitar:

- if por frase exacta
- regex conversacionales
- defaults de productos
- arboles rigidos
