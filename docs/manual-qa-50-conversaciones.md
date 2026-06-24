# QA manual de 50 conversaciones

Objetivo: probar el bot con conversaciones reales hechas por nosotros, calificarlas en el dashboard y convertir los errores en mejoras estructurales sin crear parser creep.

## Flujo recomendado

1. Abrir Telegram o el canal de prueba.
2. Iniciar una conversación nueva con `/newchat`.
3. Probar una conversación completa o un caso raro real.
4. Abrir el dashboard en `http://localhost:3000/dashboard/`.
5. Entrar a `Conversaciones`.
6. Seleccionar el chat probado.
7. Calificar:
   - `Exito` si el bot entendió el pedido, pidió datos obligatorios y no inventó.
   - `Fracaso` si hubo error de interpretación, estado, catálogo, precio, datos obligatorios, tono o dashboard.
8. Si es `Fracaso`, escribir comentario concreto:
   - qué dijo el cliente
   - qué respondió el bot
   - qué debió pasar
   - si el error parece prompt, schema, estado, validación o catálogo
9. Repetir hasta completar 50 evaluaciones.
10. Presionar `Generar reporte`.

## Base local

Las evaluaciones reales se guardan en:

```text
qa-output/manual-conversation-evaluations.json
```

Ese directorio está ignorado por git, así que se puede usar como bitácora local de beta sin ensuciar el repo.

## Criterio de éxito

Una conversación cuenta como éxito si:

- El producto quedó correcto.
- No seleccionó variantes por defecto cuando había ambigüedad.
- Pidió opciones requeridas antes de datos de entrega.
- Capturó nombre, dirección, referencia, barrio/zona textual y método de pago.
- No cerró pedido con datos críticos incompletos.
- No inventó productos, precios, promociones, domicilio ni disponibilidad.
- Mantuvo tono amable y orientado a completar pedido.

## Criterio de fracaso

Marcar fracaso si ocurre cualquiera:

- Producto equivocado o inventado.
- Topping/adición ignorada o aplicada al producto incorrecto.
- Required option faltante.
- Repite el mismo mensaje en loop.
- Confunde una pregunta de catálogo con pedido.
- Pide datos que ya fueron dados.
- Cierra pedido antes de tiempo.
- Modifica pedido después de despachado/completado.
- Responde con tono raro, apodos no deseados o exceso de emojis.
- El dashboard muestra datos distintos al pedido real.

## Cómo usar el reporte

El reporte genera un prompt con los fracasos y snapshots. Ese prompt debe usarse para decidir mejoras, siguiendo esta regla:

```text
OpenAI interpreta.
Backend valida.
Backend no reinterpreta con ifs por frase.
```

Antes de implementar, clasificar cada fix como:

- Prompt / instrucciones OpenAI.
- Schema JSON / herramienta de interpretación.
- Validador backend.
- Estado conversacional.
- Catálogo / metadata.
- UX / plantilla.
- Dashboard / operación.
- Parser creep existente.
