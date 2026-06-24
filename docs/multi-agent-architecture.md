# Arquitectura multi-agente I Love Fresas

## Objetivo

Reducir el prompt monolitico del bot y separar responsabilidades para que los
errores sean mas faciles de diagnosticar.

El principio sigue siendo:

```text
IA interpreta -> backend valida -> backend aplica
```

La IA no calcula precios, no inventa productos y no cierra pedidos por su cuenta.

## Flujo nuevo

```text
Mensaje del cliente
  -> MultiAgentOrderEngineService
  -> Router central
  -> Agente especialista
  -> JSON estructurado compatible con OpenAIOrderEngineOutput
  -> ConversationService valida/aplica patch
  -> Respuesta + dashboard
```

## Agentes

- `menu_agent`: menu, carta, toppings, sabores, precios y recomendaciones.
- `order_builder_agent`: productos, cantidades, toppings, adiciones y cambios.
- `customer_data_agent`: nombre, direccion, barrio, referencia, entrega y pago.
- `ambiguity_agent`: pending selections y aclaraciones bloqueantes.
- `post_order_agent`: mensajes despues de registro/envio/completado.
- `handoff_agent`: reclamos, contradicciones o riesgo operativo.
- `small_talk_agent`: saludo, charla social y objeciones suaves.

## Configuracion

```env
AI_ORDER_ENGINE_MODE=true
AI_ENGINE_ARCHITECTURE=multi
```

Para volver al prompt unico anterior:

```env
AI_ENGINE_ARCHITECTURE=single
```

## Decisiones de diseno

- El router solo elige un agente; no toma pedidos.
- Cada especialista tiene prompt corto y dominio limitado.
- Todos los especialistas devuelven el mismo contrato JSON.
- El backend sigue validando IDs de productos, modifiers, pagos, estado, precios y
  cierre seguro.
- El motor viejo sigue disponible como fallback por configuracion, no como fallback
  silencioso.

## Referencias

- OpenAI Agents SDK: agentes como aplicaciones que colaboran entre especialistas,
  con orquestacion, estado, guardrails y human review.
- OpenAI Structured Outputs: salida JSON con schema para reducir respuestas
  invalidas.
- Flowise AgentFlow V2: workflows con nodos especializados, control explicito,
  shared state y patrones supervisor/worker.
