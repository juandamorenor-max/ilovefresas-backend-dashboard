# Contrato conversacional - I Love Fresas

Este documento define la fuente de verdad del flujo conversacional. Su objetivo es evitar que el backend compita con OpenAI interpretando lenguaje natural.

## Objetivo del bot

El bot debe tomar pedidos reales por chat, con baja friccion, sin inventar informacion y dejando una orden clara para revision del operario.

El bot no confirma definitivamente, no cobra, no verifica pagos, no calcula domicilio y no despacha. Es un asistente vendedor y tomador de pedidos.

## Filosofia de arquitectura

OpenAI interpreta.

Backend valida.

Backend no debe reinterpretar lenguaje natural salvo guardrails operativos estrictos.

OpenAI puede decidir:

- Intencion del cliente.
- Si el cliente esta pidiendo, preguntando, modificando, conversando o reclamando.
- Productos, cantidades, toppings, sabores y cambios expresados en lenguaje natural.
- Datos del cliente: nombre, direccion, barrio, referencia y metodo de pago.
- Tono humano de respuesta.
- Cuando pedir aclaracion si falta una variable critica.

Backend debe decidir:

- Si el producto existe en catalogo.
- Si el producto esta disponible.
- Si el precio viene del catalogo.
- Si falta una opcion obligatoria.
- Si falta un dato obligatorio antes de pasar a revision.
- Si el pedido ya fue despachado y no admite cambios.
- Si hay que pausar el bot porque un humano tomo control.
- Si el pedido puede crearse como `pending_review`.

## Datos obligatorios para domicilio

Un pedido a domicilio solo puede quedar listo para revision cuando tenga:

- Nombre del cliente.
- Productos exactos del menu.
- Direccion.
- Barrio.
- Referencia de direccion.
- Metodo de pago.

El valor del domicilio lo confirma el operario en el dashboard. El bot no debe calcularlo ni inventarlo.

## Datos obligatorios para recoger

Un pedido para recoger puede quedar listo para revision cuando tenga:

- Nombre del cliente.
- Productos exactos del menu.
- Metodo de pago.

No debe pedir direccion, barrio ni referencia si el cliente va a recoger.

## Estados operativos

- `idle`: no hay pedido activo.
- `collecting_items`: faltan productos, variantes, sabores, toppings o aclaraciones del pedido.
- `collecting_delivery_details`: ya hay productos y faltan datos del cliente o entrega.
- `pending_human`: humano en control o pedido listo para revision.
- `post_order_closed`: pedido cerrado para conversacion automatica normal.
- `completed`: pedido terminado.
- `cancelled`: pedido cancelado.

Estados de orden:

- `pending_review`: pedido listo para que el operario revise.
- `confirmed`: operario confirmo datos.
- `preparing`: en preparacion si aplica operativamente.
- `dispatched`: pedido enviado. No admite cambios del cliente.
- `completed`: ciclo cerrado.
- `cancelled`: pedido cancelado.

## Regla post-despacho

Despues de `dispatched`, el bot puede responder inquietudes menores:

- Tiempo estimado.
- "Ya viene?"
- "Gracias".
- Dudas simples de estado.

Pero no puede modificar, quitar, agregar ni cancelar productos.

Si el cliente intenta cambiar algo despues de despacho, debe escalar a humano.

## Human takeover

Cuando se activa humano en control:

- `conversation.state = pending_human`.
- El bot deja de responder mensajes normales.
- La pausa es indefinida para ese pedido.
- El operario puede liberar el chat o iniciar un nuevo pedido desde el dashboard/comando.

## Nuevo pedido despues de cerrar

Si el pedido esta `completed` o la conversacion esta `post_order_closed`, solo se crea un nuevo draft cuando OpenAI detecte intencion clara de nuevo pedido.

Ejemplos:

- "quiero hacer otro pedido"
- "nuevo pedido"
- "me das unas fresas"
- "quiero ordenar otra vez"

Si el cliente solo saluda despues de cerrar, el bot debe preguntar suavemente si necesita ayuda con el pedido anterior o quiere hacer uno nuevo.

## Libertad controlada

El bot debe sonar amable, formal y natural. Puede conversar y defender el producto ante objeciones, pero sin mentir.

Puede decir cosas como:

- "Entiendo, el antojo a veces pesa un poquito, pero lo armamos bien rico."
- "Si quieres bajamos el total ajustando alguna adicion."
- "Los productos van en X; el domicilio te lo confirma un asesor."

No puede inventar:

- Promociones.
- Premios.
- Fama.
- Disponibilidad exacta.
- Tiempo exacto de entrega.
- Domicilio gratis.
- Precios no configurados.

## Anti parser creep

No agregar reglas del tipo:

- "si el texto contiene X, haz Y"
- "si dice esta frase exacta, responde esto"
- "si aparece esta palabra, asumelo como producto/direccion/zona"

Excepciones permitidas:

- Aliases de productos.
- Aliases de toppings/adiciones.
- Aliases de metodos de pago.
- Validaciones estructurales de catalogo, precio, estado y datos obligatorios.

Si un bug requiere entender lenguaje natural, primero debe resolverse en el prompt/schema de OpenAI. El backend solo debe validar el resultado estructurado.
