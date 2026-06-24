# Beta supervisada - I Love Fresas

Este documento prepara la prueba manual y beta supervisada del bot. No reemplaza la revision del operario: durante beta, ningun pedido deberia despacharse sin revision humana.

## 1. Checklist de prueba manual: 20 conversaciones reales

Objetivo: probar conversaciones plausibles de WhatsApp, no casos perfectos. Cada prueba debe registrar si el bot captura bien producto, cantidad, personalizaciones, nombre, direccion, zona, metodo de pago, domicilio, total y estado final.

Marca cada caso como `OK`, `Error menor`, `Error operativo` o `Escalar a humano`.

1. Pedido simple completo en un mensaje: "Hola, quiero una tradicional para Juan Perez, calle 10 #20-30 Cabecera, pago Nequi".
2. Pedido simple partido: "hola" / "una oblea" / "Juan Perez" / "calle 10 #20-30 Cabecera" / "Nequi".
3. Cliente pide menu antes de decidir: "que tienen?" / revisa menu / "quiero una tradicional con brownie".
4. Cliente pregunta precio en mitad del pedido: "quiero una oblea" / "cuanto va?" / "listo, Nequi".
5. Cliente saluda con charla: "hola, como estas?" y luego hace pedido.
6. Cliente escribe con typos: "kiero fresas cn krema oreoo" y luego datos.
7. Cliente cambia producto una vez: "quiero una oblea" / "mejor una malteada".
8. Cliente cambia producto varias veces: "oblea" / "no, tradicional" / "mejor malteada".
9. Cliente agrega topping despues: "una tradicional" / "agregale brownie".
10. Cliente quita ingrediente: "una tradicional sin crema".
11. Cliente usa una frase ambigua: "sin eso" despues de pedir un topping.
12. Cliente cambia cantidad: "dos obleas" / "no, una sola".
13. Cliente da direccion incompleta: "Cabecera" sin calle exacta.
14. Cliente corrige direccion: "carrera 15 Provenza" / "no, calle 10 #20-30 Cabecera".
15. Cliente manda dos apartamentos: "apto 101 apto 999".
16. Cliente cambia de domicilio a recoger en tienda.
17. Cliente cambia de recoger en tienda a domicilio.
18. Cliente dice efectivo sin monto: "pago en efectivo".
19. Cliente cambia metodo de pago: "Nequi" / "mejor efectivo con 50000".
20. Cliente abandona y vuelve: inicia pedido, desaparece 20 minutos, vuelve con datos o cambio de producto.

Para cada conversacion, revisar:

- El bot no debe cerrar pedido si falta nombre, direccion/zona o pago.
- El bot debe conservar el ultimo cambio valido del cliente.
- El bot debe bloquear ambiguedades operativas en vez de adivinar.
- El bot debe mandar al operario un resumen claro, no una conversacion completa.
- El bot debe mantener tono natural y no sonar como formulario rigido.

## 2. Guia simple para revision del operador

Antes de despachar, el operador debe revisar cada pedido en este orden:

1. Producto: confirmar que el producto existe y coincide con lo que el cliente pidio.
2. Cantidad: revisar unidades por producto.
3. Personalizaciones: revisar adiciones, ingredientes removidos y notas.
4. Precio: confirmar subtotal, domicilio y total estimado.
5. Direccion: validar calle/carrera, numero, barrio/zona, apartamento/torre/casa y referencia si existe.
6. Zona: confirmar que la zona detectada corresponde a la direccion.
7. Pago: confirmar metodo permitido.
8. Comprobante: si es Nequi, Daviplata o transferencia, revisar comprobante antes de despachar si la operacion lo exige.
9. Efectivo: si paga en efectivo, confirmar con cuanto paga y si alcanza para el total.
10. Estado: marcar como listo para despacho solo si todos los datos son coherentes.

Cuando escalar o responder manualmente:

- Producto no claro o no disponible.
- Personalizacion imposible o ambigua.
- Direccion incompleta, contradictoria o fuera de cobertura.
- Dos zonas mencionadas en la misma conversacion.
- Dos metodos de pago o pago no permitido.
- Cliente molesto, impaciente o confundido.
- Pedido grande o inusual.
- Cliente dice que ya pago pero no hay evidencia verificable.

Mensaje recomendado si falta algo:

```text
Para dejarlo listo me confirmas este dato, por favor:
- [dato faltante]
```

Mensaje recomendado si todo esta correcto:

```text
Perfecto, ya tenemos tu pedido en revision. Te confirmamos antes de despachar.
```

## 3. Metricas minimas de la primera semana

Registrar por dia y por canal.

| Metrica | Definicion | Por que importa |
| --- | --- | --- |
| Pedidos iniciados | Conversaciones donde el cliente muestra intencion de pedir o menciona producto | Mide demanda real y entrada al flujo |
| Pedidos completados | Pedidos enviados a revision con datos minimos completos | Mide conversion del bot |
| Pedidos abandonados | Cliente inicia pedido pero no completa datos en un tiempo definido | Detecta friccion o mensajes poco claros |
| Pedidos escalados a humano | Conversaciones marcadas para operario antes de cerrar | Mide carga operativa |
| Pedidos corregidos manualmente | Pedido que el operador edita antes de despacho | Mide precision del bot |
| Errores de direccion | Direccion/zona incompleta, incorrecta o contradictoria | Impacto directo en domicilios fallidos |
| Errores de pago | Metodo incorrecto, falta monto de efectivo, comprobante dudoso | Impacto directo en caja |
| Errores de producto | Producto, cantidad o personalizacion mal capturada | Impacto directo en reclamos |

Metas iniciales razonables para beta:

- Completados sin correccion manual: 70% o mas.
- Escalados a humano: menos de 25%.
- Errores de producto detectados por operador: menos de 5%.
- Errores de direccion detectados por operador: menos de 8%.
- Pedidos abandonados por friccion del bot: menos de 20%.

Estas metas son beta, no produccion. Se deben ajustar con datos reales.

## 4. Formato de reporte de errores reales

Crear un registro por cada error real o casi-error.

```text
Fecha y hora:
Canal: Telegram / WhatsApp / Local
ID conversacion:
ID pedido:
Operador que reviso:

Tipo de error:
- Producto
- Cantidad
- Personalizacion
- Direccion
- Zona
- Pago
- Precio
- Confirmacion prematura
- Tono/UX
- Otro

Severidad:
- Baja: no afecta despacho
- Media: requiere correccion manual
- Alta: pudo causar pedido incorrecto, cobro incorrecto o entrega fallida
- Critica: causo perdida de dinero, reclamo fuerte o despacho incorrecto

Mensaje exacto del cliente que disparo el problema:

Respuesta del bot:

Que entendio el bot:

Que debio entender:

El pedido fue despachado?

Hubo correccion manual?

Impacto economico estimado:

Impacto operativo:

Decision:
- No requiere cambio
- Ajustar prompt
- Ajustar catalogo/alias
- Agregar guardrail operativo
- Revisar con humano

Notas:
```

## 5. Logs y campos minimos por conversacion

Guardar lo suficiente para depurar sin depender de capturas de pantalla.

Campos por conversacion:

- `conversationId`
- `customerPhone` o identificador anonimizado
- `channel`
- `businessId`
- `startedAt`
- `lastMessageAt`
- `state`
- `activeOrderId`
- `aiUsageCount`
- `handoffRequired`
- `handoffReason`
- `abandonedReason` si aplica

Campos por mensaje:

- `messageId`
- `conversationId`
- `role`: cliente, bot, operador, sistema
- `text`
- `createdAt`
- `source`: heuristic, openai, gemini, operator
- `intent`
- `confidence` si el proveedor lo permite
- `extractedEntities`: producto, cantidad, adiciones, remociones, nombre, direccion, zona, pago
- `attachments`: tipo, nombre, url/id, estado de procesamiento

Campos por pedido:

- `orderId`
- `conversationId`
- `status`
- `items`
- `customerName`
- `address`
- `zoneName`
- `deliveryFee`
- `paymentMethod`
- `cashAmount`
- `subtotal`
- `total`
- `internalNotes`
- `blockingIssue`
- `createdAt`
- `updatedAt`
- `operatorReviewedBy`
- `operatorCorrections`

Eventos importantes:

- `order_started`
- `menu_sent`
- `order_updated`
- `delivery_details_requested`
- `blocking_issue_created`
- `blocking_issue_resolved`
- `order_sent_to_review`
- `human_handoff_requested`
- `operator_corrected_order`
- `order_cancelled`
- `customer_abandoned`

## 6. Limpieza del repo antes de beta

No deberian versionarse:

- `.env`
- `.telegram-local.pid`
- `node_modules/`
- `dist/`
- `qa-output/`
- `*.log`

Los reportes QA pueden generarse localmente cuando se necesiten, pero no deberian quedar como parte del repo productivo.

## 7. Riesgos restantes antes de produccion

- El menu real puede tener mas variaciones que el catalogo demo actual.
- Falta manejo real de comprobantes, imagenes, audios y ubicaciones GPS.
- Falta persistencia productiva y panel de operador terminado.
- Falta politica clara de productos agotados y promociones por horario/dia.
- Falta criterio operativo sobre cuando un pedido grande requiere confirmacion manual.
- Falta monitoreo automatico de errores por operador.
- Falta medir conversaciones reales para detectar frases que no aparecen en QA sintetico.

## 8. Criterio para beta supervisada

El bot puede probarse con clientes reales solo si:

- El operador revisa todos los pedidos antes de despacho.
- Hay una persona mirando conversaciones durante horas activas.
- Se registran errores reales con el formato anterior.
- No se promete despacho automatico sin revision.
- Se revisan metricas diariamente durante la primera semana.
