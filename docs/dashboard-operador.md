# Dashboard operador integrado

Guia rapida para usar el dashboard del operador junto al bot en beta supervisada.

## Como correr backend + dashboard

1. Instala dependencias del backend si hace falta:

```bash
npm install
```

2. Inicia el servidor:

```bash
npm run dev
```

Para beta local con dashboard y Telegram compartiendo la misma memoria, usa:

```bash
npm run beta:local
```

3. Abre el dashboard:

```text
http://localhost:3000/dashboard
```

El dashboard se sirve desde la carpeta `dashboard/` usando el mismo servidor Express.
No necesita un proceso frontend separado para la beta.

## Como probar un pedido desde Telegram

1. Asegura que `.env` tenga `TELEGRAM_CLIENT_BOT_TOKEN`.
2. Inicia backend + Telegram en el mismo proceso:

```bash
npm run beta:local
```

3. Escribe al bot cliente como cliente real.
4. Cuando el pedido quede completo, el backend lo crea como `pending_review`.
5. En el dashboard, entra como `Operario` y abre `Pedidos`.

## Como verlo en el dashboard

El dashboard consume estos endpoints:

- `GET /admin/dashboard/orders`
- `GET /admin/dashboard/orders/:id`
- `PATCH /admin/dashboard/orders/:id`
- `PATCH /admin/dashboard/orders/:id/status`
- `POST /admin/dashboard/orders/:id/notify-dispatched`
- `GET /admin/dashboard/conversations`
- `GET /admin/dashboard/conversations/:id`
- `GET /admin/dashboard/products`
- `GET /admin/dashboard/business-status`

El dashboard hace polling cada 5 segundos. Si aparece un pedido nuevo, actualiza la lista y reproduce sonido si esta activado.

## Flujo recomendado del operador

1. Abrir el pedido pendiente.
2. Revisar producto, cantidad, adiciones, remociones y notas.
3. Revisar direccion, zona, metodo de pago y total.
4. Abrir `Conversaciones` si necesita entender el contexto del cliente.
5. Si todo esta bien, marcar como `Confirmado`.
6. Luego mover a `Preparando`, `Despachado` y finalmente `Completado`.
7. Si no se debe preparar, cancelar el pedido.

## Limitaciones de esta beta

- Los datos siguen en memoria; reiniciar el backend borra pedidos y conversaciones.
- No hay login/autenticacion real; el selector Operario/Admin es demo visual.
- La edicion rapida guarda direccion, pago y nota. No reestructura items complejos del pedido.
- El boton de aviso de despacho marca el pedido como avisado en notas internas; todavia no envia mensaje real al cliente.
- No hay SSE/WebSocket; el dashboard usa polling simple.
- El dashboard conserva vistas de contabilidad/configuracion con datos parcialmente visuales para no romper el prototipo.
