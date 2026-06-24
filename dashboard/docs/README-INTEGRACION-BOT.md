# Integracion Dashboard Admin I Love Fresas + Bot

Este documento es para la IA/persona que va a ayudar a unir el dashboard frontend con el backend/bot de I Love Fresas.

## Estado actual del frontend

El dashboard ya fue convertido a un proyecto frontend Vite vanilla para facilitar la integracion con backend sin romper el prototipo original.

Carpeta frontend lista para compartir:

```txt
C:\Users\juanf\Documents\Codex\2026-06-11\hola\dashboard-i-love-fresas
```

Estructura principal:

```txt
dashboard-i-love-fresas/
  index.html
  package.json
  README.md
  public/
  src/
    main.js
    styles.css
```

El HTML original se conserva como referencia/export estatico:

Archivo principal:

```txt
C:\Users\juanf\Documents\Codex\2026-06-11\hola\outputs\ilovefresas-admin-dashboard.html
```

Se puede abrir directamente en navegador:

```txt
file:///C:/Users/juanf/Documents/Codex/2026-06-11/hola/outputs/ilovefresas-admin-dashboard.html
```

Para desarrollo, usar la carpeta `dashboard-i-love-fresas`.

Comandos:

```bash
cd dashboard-i-love-fresas
npm install
npm run dev
```

## Funcionalidad existente que NO se debe romper

- Login demo con rol `Operario` y `Admin`.
- Ocultar `Contabilidad` y `Configuracion` para rol operario.
- Dashboard con metricas del turno.
- Bandeja de conversaciones.
- Bandeja de pedidos.
- Filtros de pedidos:
  - Todos
  - Pendientes
  - Confirmados
  - Preparando
  - Despachados
  - Completados
  - Cancelados
- Busqueda por pedido, cliente, telefono, zona, pago, estado, riesgo y productos.
- Detalle de pedido.
- Editor rapido de pedido.
- Cambio de estados con flujo controlado.
- Boton de aviso de pedido enviado cuando el pedido esta despachado.
- Boton de sonido para nuevos pedidos.
- Sonido solo al entrar un pedido nuevo, no al cambiar estados.
- Funcion global `notifyNewOrder(order)` para simular/recibir pedidos nuevos.
- Seccion de contabilidad dinamica basada en pedidos.
- Configuracion mock de menu, toppings, zonas, pagos, horarios y mensajes.

## Puntos tecnicos importantes

El dashboard ya incluye una capa mock llamada `dashboardApi`.

Actualmente contiene funciones como:

```js
dashboardApi.listOrders()
dashboardApi.addOrder(order)
dashboardApi.updateOrderStatus(order, status)
dashboardApi.updateOrder(order, patch)
dashboardApi.markDispatchNotified(order)
```

La idea es reemplazar esa capa por llamadas reales al backend sin cambiar la UI ni los flujos.

Tambien existe:

```js
window.notifyNewOrder = notifyNewOrder;
```

Esta funcion debe llamarse SOLO cuando el backend/bot cree un pedido nuevo. No debe llamarse al confirmar, preparar, despachar, completar o cancelar.

## Contrato recomendado de pedido

El dashboard espera pedidos con una forma similar a:

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

Estados usados por el dashboard:

```txt
pending
confirmed
preparing
dispatched
completed
cancelled
```

Canales esperados:

```txt
Telegram
WhatsApp
```

Metodos de pago usados:

```txt
Nequi
Efectivo
Daviplata
Transferencia
```

## Endpoints recomendados

Si el backend aun no tiene endpoints definitivos, se recomienda este contrato:

```txt
GET    /admin/orders
GET    /admin/orders/:id
PATCH  /admin/orders/:id
PATCH  /admin/orders/:id/status
POST   /admin/orders/:id/notify-dispatched
GET    /admin/products
GET    /admin/business-status
```

Para tiempo real:

Opcion recomendada inicialmente:

```txt
GET /admin/orders?since=<timestamp>
```

con polling cada 5-10 segundos.

Opcion mas robusta:

```txt
GET /admin/events
```

usando Server-Sent Events.

Tambien puede usarse WebSocket, pero no es necesario para una primera fusion estable.

## Estrategia recomendada

### Fase 1: No mezclar proyectos

Mantener frontend y backend separados temporalmente.

Backend:

```txt
bot-backend/
```

Frontend:

```txt
dashboard-i-love-fresas/
```

No copiar el frontend encima del backend sin inspeccion.

### Fase 2: Proyecto frontend real

Ya existe una primera version en Vite vanilla:

```txt
dashboard-i-love-fresas/
  index.html
  package.json
  README.md
  public/
  src/
    main.js
    styles.css
```

Se eligio Vite vanilla para conservar comportamiento con menor riesgo. Si despues se requiere componentizacion mas fuerte, se puede migrar a React.

### Fase 3: Crear adaptador de API

Crear una capa unica:

```ts
adminApi.listOrders()
adminApi.updateOrder()
adminApi.updateOrderStatus()
adminApi.notifyDispatched()
```

La UI no debe conocer URLs directamente.

### Fase 4: Conectar pedidos reales

Reemplazar mock por:

```txt
GET /admin/orders
```

Mapear respuesta del backend al formato del dashboard.

### Fase 5: Conectar acciones del operario

Botones del dashboard:

- Confirmar
- Preparar
- Despachar
- Completar
- Cancelar
- Guardar cambios
- Avisar pedido enviado

deben llamar al backend.

### Fase 6: Conectar nuevos pedidos

Cuando llegue un pedido nuevo:

1. Backend recibe pedido desde Telegram/WhatsApp.
2. Backend lo guarda.
3. Dashboard lo recibe por polling, SSE o WebSocket.
4. Dashboard llama internamente `notifyNewOrder(order)`.
5. Suena la campana si el sonido esta activo.

Importante:

No hacer sonar la campana por cambios de estado.

### Fase 7: Validacion

Antes de dar por terminada la fusion, probar:

- Entrar como Operario.
- Entrar como Admin.
- Ver pedidos reales.
- Buscar por cliente, zona, pago y estado.
- Cambiar estados.
- Editar direccion/pago/nota.
- Despachar pedido.
- Enviar aviso al cliente.
- Completar pedido solo despues del aviso.
- Recibir pedido nuevo y escuchar sonido.
- Confirmar que contabilidad recalcula.
- Confirmar que operario no ve Admin.

## Recomendacion de arquitectura

Para este momento, la mejor ruta es:

1. Usar la carpeta `dashboard-i-love-fresas`.
2. Mantener backend separado.
3. Conectar por HTTP desde `src/main.js`.
4. Agregar polling simple.
5. Luego migrar a SSE/WebSocket si hace falta.

No se recomienda al inicio servir el frontend desde Express, porque complica el desarrollo si todavia estan iterando UI y bot.

## Riesgos a cuidar

- No insertar mensajes del cliente con `innerHTML` sin sanitizar.
- No disparar sonido en cambios de estado.
- No confiar en el rol del frontend para seguridad real.
- No exponer tokens de Telegram/WhatsApp en frontend.
- No mezclar datos mock con datos reales sin distinguir origen.
- No romper el flujo de estados:
  - pending -> confirmed
  - confirmed -> preparing
  - preparing -> dispatched
  - dispatched -> notify client
  - dispatched + client notified -> completed
  - cancel solo antes de completar

## Preguntas que necesita responder el backend

- Cual es la URL local del backend?
- Que endpoints admin ya existen?
- Como luce el JSON real de un pedido creado por el bot?
- El bot ya guarda pedidos o solo notifica por Telegram?
- Hay IDs persistentes de pedido?
- El backend maneja estados o solo crea pedidos?
- El envio de mensaje al cliente se hace por Telegram, WhatsApp o ambos?
- Como se autentica el dashboard admin?

## Entregable minimo para fusion

Para empezar a conectar:

1. Carpeta `dashboard-i-love-fresas`.
2. URL del backend.
3. Ejemplo JSON real de pedido.
4. Endpoints disponibles.

El HTML en `outputs/` queda solo como respaldo visual del prototipo.
