# Auditoria de codigo conversacional

Fecha: 2026-06-16

Alcance: revision estatica de codigo. No se ejecutaron conversaciones reales, ficticias ni backtests con OpenAI.

## Diagnostico ejecutivo

El sistema ya esta bastante cerca de la arquitectura correcta: OpenAI interpreta, devuelve JSON estructurado y el backend valida catalogo, precios, estado y cierre seguro.

El problema principal es que `src/services/conversation.service.ts` todavia contiene varias capas antiguas que tambien intentan interpretar texto crudo. Eso crea competencia entre:

- OpenAI como interprete principal.
- Validadores deterministas necesarios.
- Parser legacy/fallback.
- Resolucion local de pending selections.
- Respuestas hardcodeadas.

Cuando todo sale bien, OpenAI dirige. Cuando entra una ruta secundaria, el bot puede sonar repetitivo, pedir datos que ya tiene, mandar menu cuando no corresponde, o ignorar una respuesta que OpenAI probablemente habria entendido.

## Hallazgos principales

### 1. `conversation.service.ts` concentra demasiadas responsabilidades

Archivo: `src/services/conversation.service.ts`

Tamano aproximado: 7.222 lineas.

Responsabilidades mezcladas:

- Orquestacion de OpenAI.
- Fallback legacy.
- Clasificacion de mensajes.
- Validacion de catalogo.
- Resolucion de pending selections.
- Extraccion de datos desde texto.
- Templates de respuesta.
- Estado del pedido.
- Post-despacho.
- Adjuntos de menu/especificaciones.
- Pausas y handoff.

Riesgo: cada bug se arregla en el mismo archivo y aumenta el "parser creep".

Recomendacion: separar en modulos con fronteras estrictas:

- `AIOrderEngineOrchestrator`
- `AIPatchValidator`
- `OrderDraftStateMachine`
- `CustomerReplyPolicy`
- `PostOrderConversationPolicy`
- `ConversationHandoffPolicy`

No hace falta reescribir todo de una vez. Se puede extraer por fases.

### 2. Existe fallback legacy despues de OpenAI

En `advanceConversation`, si `tryHandleOpenAIOrderEngine` no produce resultado, el flujo cae a:

- `classifyConversationTurn`
- `isCatalogOptionQuestion`
- `handleGlobalIntent`
- `handleStatefulFlow`
- `handleIdleIntent`

Esto explica la sensacion de "dos cerebros".

Estado actual: con `AI_ORDER_ENGINE_MODE=true` y proveedor no heuristic, OpenAI deberia ser principal. Pero el fallback sigue vivo y puede activarse por configuracion, errores o rutas no previstas.

Recomendacion:

- En modo AI-first, si OpenAI falla, no pasar a parser legacy.
- Hacer retry corto.
- Si falla otra vez, conservar draft y escalar o pedir disculpa suave.
- El fallback legacy debe quedar solo para modo demo/offline, no para beta real.

### 3. Human takeover todavia es temporal

Funcion actual: `pauseConversationBot(conversation, reason, minutes = 30)`.

Problema: el usuario decidio que si un humano toma control, debe ser indefinido para ese pedido. Hoy muchas pausas vencen a los 30 minutos.

Riesgo operativo: el bot puede volver a responder en medio de una atencion humana o despues de una escalada.

Recomendacion:

- Diferenciar `timedPause` de `humanTakeover`.
- Si `conversation.state === "pending_human"`, el bot debe quedarse callado indefinidamente hasta:
  - boton de reactivar bot en ese chat,
  - `/newchat`,
  - o intencion clara de nuevo pedido validada por OpenAI despues de cerrar ciclo.

### 4. Hay resolucion local de pending selections desde texto crudo

Funciones relevantes:

- `applyProductClarificationReplyToPendingSelections`
- `applyModifierReplyToPendingSelections`
- `reconcileRequiredOptionsFromCurrentMessage`
- `extractSelectedValuesForRequiredOption`
- `extractRequiredOptionQuantityMap`

Estas funciones son utiles, pero cruzan una linea: el backend vuelve a interpretar lenguaje natural.

Riesgo: si OpenAI entiende algo y el backend no, gana el backend. Eso causa errores como repetir preguntas, perder sabores o aplicar opciones parcialmente.

Recomendacion:

- OpenAI debe resolver pending selections enviando `resolvePendingSelections` + `addItems/updateItems`.
- El backend solo debe verificar que la resolucion sea valida.
- Mantener una capa de reparacion minima solo para consistencia estructural, no para entender mensajes.

### 5. Validadores buenos mezclados con interpretacion

Validadores buenos que deben quedarse:

- Producto existe.
- Producto activo/no agotado.
- Precio > 0.
- Modifier existe.
- Modifier permitido.
- Required option pertenece al producto.
- No cerrar pedido con faltantes.
- No modificar pedido despues de enviado.
- Metodo de pago permitido.

Validadores con riesgo de parser creep:

- `hasProductSelectionEvidence`
- `guardModifierSelections`
- `guardSelectedOptions`
- `preferSpecificProductComposition`
- `normalizeUnsupportedSelectedOptionsAsModifiers`

No son necesariamente malos, porque evitan defaults peligrosos. Pero deben vivir en un modulo llamado explicitamente `AIPatchValidator`, con una regla: validar el patch de OpenAI, no interpretar la conversacion.

### 6. Hay respuestas hardcodeadas con encoding roto

Se encontraron textos con caracteres tipo:

- `Â¿`
- `Ã©`
- `ðŸ“`
- `âœ…`

Riesgo: cuando una ruta hardcodeada responde, aparecen simbolos feos y la experiencia se rompe.

Recomendacion:

- Pasar strings hardcodeados a UTF-8 limpio.
- Reducir rutas hardcodeadas de cliente.
- Centralizar templates inevitables en un solo archivo.

### 7. Catalog option questions todavia se resuelven localmente

Funciones:

- `isCatalogOptionQuestion`
- `buildCatalogOptionQuestionResponse`
- `optionQuestionTargetLabel`

Estas funciones arreglaron bugs puntuales, pero son interpretacion local. En AI-first, OpenAI deberia decidir si "que sabores tienes?" es pregunta de catalogo, pregunta sobre una pending selection o algo distinto.

Recomendacion:

- En modo AI-first, dejar que OpenAI devuelva `catalogAnswer`.
- Backend solo adjunta PDF/imagenes si `catalogAnswer.topic` lo pide.
- Mantener estas funciones solo para modo demo/offline.

### 8. Post-despacho esta mejor encaminado, pero falta cierre de ciclo

Archivo: `src/services/post-dispatch-intent.service.ts`

Lo bueno:

- Usa LLM para clasificar mensajes post-despacho.
- Distingue estado, quejas, cambios despues de enviado y nuevo pedido.
- No deberia modificar pedidos enviados.

Pendiente:

- Definir ciclo final: dispatched -> completed -> conversacion cerrada.
- Evitar respuestas repetidas infinitas.
- Permitir nuevo pedido solo con intencion clara.

Recomendacion:

- Agregar estado conceptual `post_order_closed`.
- Despues de `completed`, responder maximo una vez a agradecimientos/small talk.
- Luego silencio, salvo que OpenAI detecte `new_order_request` con alta confianza.

## Que deberia decidir OpenAI

OpenAI debe decidir:

- Intencion del mensaje.
- Si es pedido, pregunta, saludo, objecion, cambio o dato.
- Producto solicitado.
- Cantidad.
- Modificadores/adiciones.
- Required options.
- Respuesta a pending selections.
- Nombre.
- Direccion.
- Barrio.
- Referencia.
- Metodo de pago.
- Si el cliente quiere recoger o domicilio.
- Si un mensaje post-despacho es duda menor, reclamo, intento de cambio o nuevo pedido.
- Redaccion natural al cliente.

## Que debe decidir exclusivamente el backend

El backend debe decidir:

- Si IDs existen.
- Si producto esta activo o agotado.
- Si precio es valido.
- Si modifier existe y tiene precio.
- Si required option esta completa.
- Si faltan datos obligatorios.
- Si el pedido puede pasar a revision.
- Si un pedido enviado/completado puede modificarse: no.
- Si el metodo de pago esta permitido.
- Si el pedido se crea, se pausa, se escala o se bloquea.
- Calculo de subtotal.
- Envio de PDF/imagenes segun el topic de OpenAI.
- Estado admin/dashboard.

## Riesgos actuales si se prende beta real

1. El bot puede volver a hablar despues de handoff si vence la pausa.
2. Una ruta legacy puede responder con textos repetitivos o encoding roto.
3. Algunas pending selections pueden resolverse distinto por backend que por OpenAI.
4. Preguntas de catalogo pueden pasar por regex local en vez de respuesta IA.
5. Bugs nuevos se tenderan a corregir con mas condiciones en `conversation.service.ts`.

## Plan recomendado

### Fase 1: Bloqueo AI-first

Objetivo: evitar que el parser legacy compita en beta.

Cambios:

- Si `AI_ORDER_ENGINE_MODE=true` y `LLM_PROVIDER=openai`, no caer a parser legacy.
- Si OpenAI falla, hacer retry ya existente y luego handoff suave.
- Dejar fallback legacy solo cuando `LLM_PROVIDER=heuristic` o modo demo.

Impacto esperado: reduce respuestas "raras" causadas por capas locales.

### Fase 2: Handoff indefinido

Objetivo: cuando el operario toma el chat, el bot se calla hasta que se reactive.

Cambios:

- Separar pausa temporal vs toma humana.
- `pending_human` no debe expirar en 30 min.
- Dashboard debe tener boton claro: "Reactivar bot en este chat".

Impacto esperado: evita que bot interrumpa al operario.

### Fase 3: Extraer `AIPatchValidator`

Objetivo: mantener guardrails sin esconder interpretacion.

Mover:

- Validacion de producto/modifier/required options.
- No-defaulting.
- Duplicados peligrosos.
- Precio/cantidad.

Regla:

- Este modulo no redacta respuestas.
- Este modulo no decide intencion.
- Este modulo solo acepta, bloquea o devuelve errores estructurales sobre el patch de OpenAI.

### Fase 4: Desactivar resolucion local de pending selections

Objetivo: OpenAI resuelve selecciones pendientes.

Cambios:

- Backend acepta `resolvePendingSelections` si viene con patch valido.
- Si OpenAI no resuelve, pregunta de nuevo o escala.
- No usar texto crudo para adivinar respuestas salvo modo demo/offline.

### Fase 5: Conversation lab manual

Objetivo: probar con OpenAI real sin quemar creditos a lo loco.

Metodo:

- Probar mano a mano 5-10 conversaciones reales.
- Registrar transcript + JSON OpenAI + draft antes/despues.
- Cada bug se clasifica:
  - prompt
  - schema
  - validator
  - state machine
  - dashboard/admin
- No arreglar con if por frase.

## Criterio de exito

El sistema queda sano cuando:

- OpenAI interpreta todos los mensajes de cliente en modo beta.
- Backend valida estructura, no lenguaje natural.
- Handoff humano no expira solo.
- Pedidos enviados/completados no se pueden modificar.
- Las respuestas hardcodeadas inevitables salen desde templates limpios.
- `conversation.service.ts` deja de crecer como "bolsa de todo".

