# Dashboard I Love Fresas

Frontend operativo para el dashboard admin de I Love Fresas.

Este proyecto fue creado a partir del prototipo HTML funcional, separando estilos y JavaScript para facilitar la integracion con el backend/bot.

## Carpeta unica de entrega

Esta carpeta contiene todo lo necesario para compartir el dashboard con el equipo del backend/bot:

```txt
ilovefresas-dashboard-completo/
  index.html
  package.json
  README.md
  public/
  src/
    main.js
    styles.css
  docs/
    README-INTEGRACION-BOT.md
    legacy/
      ilovefresas-admin-dashboard.html
    menu-pages/
      page-1-img-1.png
      page-2-img-1.png
```

El frontend Vite corre desde la raiz de esta carpeta. La carpeta `docs/` contiene el documento para la otra IA, el HTML original como respaldo y las imagenes extraidas del menu.

## Stack

- Vite
- HTML
- CSS
- JavaScript vanilla

Se eligio Vite vanilla para conservar el comportamiento actual con el menor riesgo posible. Si mas adelante el proyecto crece mucho, se puede migrar a React por componentes.

## Estructura

```txt
dashboard-i-love-fresas/
  index.html
  package.json
  public/
  src/
    main.js
    styles.css
```

## Como correr

Instalar dependencias:

```bash
npm install
```

Levantar en desarrollo:

```bash
npm run dev
```

Build de produccion:

```bash
npm run build
```

Previsualizar build:

```bash
npm run preview
```

## Puntos de integracion

El archivo principal de logica es:

```txt
src/main.js
```

La capa mock a reemplazar por backend es:

```js
dashboardApi
```

Funciones actuales:

```js
dashboardApi.listOrders()
dashboardApi.addOrder(order)
dashboardApi.updateOrderStatus(order, status)
dashboardApi.updateOrder(order, patch)
dashboardApi.markDispatchNotified(order)
```

Para pedidos nuevos existe:

```js
window.notifyNewOrder(order)
```

Esta funcion debe ejecutarse solamente cuando el bot/backend cree un pedido nuevo. No debe ejecutarse cuando cambie el estado de un pedido.

## Flujo de estados

```txt
pending -> confirmed
confirmed -> preparing
preparing -> dispatched
dispatched -> notify client
dispatched + client notified -> completed
cancelled antes de completed
```

## Contrato esperado de pedido

```json
{
  "id": "ILF-2001",
  "customer": "Cliente prueba",
  "phone": "300 000 0000",
  "channel": "WhatsApp",
  "address": "Cra 80 # 10-20",
  "zone": "Castilla",
  "payment": "Nequi",
  "total": 32000,
  "status": "pending",
  "urgent": true,
  "age": "Ahora",
  "risk": "Comprobante",
  "note": "Pedido creado por el bot.",
  "items": [
    "Fresas con crema tradicional x1 · extra arequipe"
  ],
  "dispatchNotified": false
}
```

## Endpoints sugeridos

```txt
GET    /admin/orders
GET    /admin/orders/:id
PATCH  /admin/orders/:id
PATCH  /admin/orders/:id/status
POST   /admin/orders/:id/notify-dispatched
GET    /admin/products
GET    /admin/business-status
```

## Reglas importantes

- No disparar sonido por cambios de estado.
- No exponer tokens de Telegram o WhatsApp en frontend.
- No confiar en el rol del frontend para seguridad real.
- Mantener la sanitizacion de texto al renderizar datos del bot.
- Mantener `notifyNewOrder(order)` para eventos de pedido nuevo.
- Mantener intactos los flujos de operario/admin.

## Validaciones antes de entregar

- Login como Operario.
- Login como Admin.
- Filtros de pedidos.
- Busqueda.
- Detalle de pedido.
- Cambio de estados.
- Aviso de pedido enviado.
- Sonido de nuevo pedido.
- Contabilidad dinamica.
- Responsive desktop/mobile.
