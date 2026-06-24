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
- `GET /admin/dashboard/modifiers`
- `GET /admin/dashboard/business-status`
- `PATCH /admin/products/:id`
- `PATCH /admin/products/:id/availability`
- `PATCH /admin/modifiers/:id`
- `PATCH /admin/modifiers/:id/availability`
- `GET /bot/catalog/available` con header `x-bot-secret` para n8n/backend

El dashboard hace polling simple cada pocos segundos. Si aparece un pedido, chat o cambio de catalogo,
la vista se actualiza desde el backend.

## Catalogo, disponibilidad y precios

En V1 el dashboard es la superficie operativa para apagar/reactivar productos, toppings y adiciones.
Cuando un operario apaga un producto o marca un producto como agotado:

- desaparece de `productos` en `/bot/catalog/available`;
- aparece en `agotados.productos`;
- el bot no debe agregarlo al pedido;
- si el cliente lo pide por chat, el backend responde que esta agotado antes de llamar a Flowise.

Cuando un operario apaga un topping o adicion:

- desaparece de las opciones disponibles para el bot;
- aparece en `agotados.modificadores`;
- si el cliente lo pide por chat, el backend responde que esta agotado antes de llamar a Flowise.

Cuando Admin cambia el precio de un producto o modificador:

- el dashboard lo muestra desde `/admin/dashboard/products` o `/admin/dashboard/modifiers`;
- el pedido creado por el bot usa ese precio actual al calcular subtotal y total;
- Flowise no decide precios.

Prueba repetible:

```bash
npm run test:dashboard-operational
```

Ese smoke levanta Express localmente, cambia disponibilidad/precio por endpoints del dashboard y valida por endpoints del bot que el chat responde `agotado` y que la orden usa el precio actualizado.

## Persistencia operativa V1

Por defecto, si no configuras persistencia, el backend usa memoria de proceso. Para que cambios de dashboard
como precios, agotados, pedidos y conversaciones sobrevivan reinicios del proceso, configura:

```text
RUNTIME_STORE_PATH=/data/ilovefresas-runtime-store.json
```

En Railway, lo ideal es montar un Volume en `/data` y usar esa ruta. Si no hay volumen, puedes usar una ruta
dentro del contenedor para pruebas, pero un redeploy puede perder esos datos.

Puedes verificarlo en produccion con:

```text
GET /health/integration
```

El campo `storage` debe mostrar `configured=true`, `mode=snapshot-json` y `writable=true`.

El snapshot guarda:

- catalogo, productos, toppings, adiciones y disponibilidad;
- pedidos, conversaciones y mensajes;
- estado del negocio, horarios, medios de pago y cierres especiales.

Prueba repetible:

```bash
npm run test:runtime-store
```

Ese smoke cambia un producto por HTTP, verifica que se escriba el snapshot y simula una recarga desde disco.

## Flujo recomendado del operador

1. Abrir el pedido pendiente.
2. Revisar producto, cantidad, adiciones, remociones y notas.
3. Revisar direccion, zona, metodo de pago y total.
4. Abrir `Conversaciones` si necesita entender el contexto del cliente.
5. Si todo esta bien, marcar como `Confirmado`.
6. Luego mover a `Preparando`, `Despachado` y finalmente `Completado`.
7. Si no se debe preparar, cancelar el pedido.

## Limitaciones de esta beta

- Sin `RUNTIME_STORE_PATH`, los datos siguen en memoria; reiniciar el backend borra pedidos, conversaciones y cambios de catalogo hechos desde dashboard.
- Con `RUNTIME_STORE_PATH`, se usa snapshot JSON operativo. Para produccion robusta multi-instancia falta Postgres.
- No hay login/autenticacion real; el selector Operario/Admin es demo visual.
- La edicion rapida guarda direccion, pago, nota, disponibilidad y catalogo basico. No reestructura items complejos del pedido.
- Confirmar/notificar y avisar despacho pasan por backend; requieren que el canal del cliente tenga credenciales configuradas.
- No hay SSE/WebSocket; el dashboard usa polling simple.
- V1 no incluye contabilidad, metricas beta, cierre de caja ni configuraciones grandes.
