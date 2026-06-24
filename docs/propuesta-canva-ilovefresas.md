# Propuesta Canva - Chatbot de pedidos para I Love Fresas

## Estilo visual recomendado

- Formato: presentacion 16:9.
- Estetica: formal, limpia, fresca, con acentos de fresa.
- Colores sugeridos: fondo claro crema, rojo/fresa como acento, verde suave para estados positivos, gris oscuro para textos.
- Tipografia: una fuente legible y moderna. Evitar exceso de decoracion.
- Visuales: capturas del chat, capturas del dashboard, iconos simples de WhatsApp, Telegram, pedido, domicilio, pago y operario.
- Tono: solucion real para operacion, no "demo tecnologica".

---

## Slide 1 - Portada

### Titulo
Sistema inteligente de pedidos para I Love Fresas

### Subtitulo
Un asistente conversacional que toma pedidos por chat y los deja listos para revision del operario.

### Texto corto
Menos friccion para el cliente. Mas orden para el equipo. Mejor control antes de despachar.

### Visual sugerido
Mockup de WhatsApp/Telegram con una conversacion corta y el logo de I Love Fresas.

---

## Slide 2 - Problema actual

### Titulo
Tomar pedidos por chat puede volverse desordenado

### Puntos
- Clientes escriben con errores, mensajes incompletos o en desorden.
- El operario debe preguntar producto, direccion, pago y detalles manualmente.
- Se pueden perder toppings, sabores, cambios o notas importantes.
- Confirmar domicilio y total puede tomar tiempo.
- En horas pico aumenta el riesgo de pedidos mal tomados.

### Frase destacada
El problema no es vender mas: es tomar pedidos sin errores y sin saturar al operario.

---

## Slide 3 - Solucion propuesta

### Titulo
Un asistente de pedidos conectado al flujo real del restaurante

### Puntos
- Atiende al cliente por chat de forma natural.
- Interpreta pedidos escritos libremente.
- Usa el menu real del negocio.
- Pide datos faltantes: nombre, direccion, referencia y metodo de pago.
- Deja el pedido en revision para que un asesor confirme antes de despachar.

### Visual sugerido
Flujo simple:
Cliente escribe -> Bot arma pedido -> Operario revisa -> Cliente recibe total final.

---

## Slide 4 - Que puede hacer el bot

### Titulo
Capacidades principales

### Puntos
- Entiende lenguaje natural, typos y mensajes cortos.
- Reconoce productos, cantidades, toppings y adiciones.
- Pregunta opciones obligatorias como sabor de helado cuando faltan.
- No asume variantes cuando el cliente no las especifica.
- Adjunta el menu cuando el cliente lo pide.
- Maneja productos agotados como "no disponibles temporalmente".
- Escala al operario cuando hay dudas, reclamos o datos inseguros.

### Frase destacada
La IA interpreta. El sistema valida. El operario confirma.

---

## Slide 5 - Ejemplo de conversacion

### Titulo
Experiencia simple para el cliente

### Conversacion ejemplo
Cliente:
Hola, quiero unas fresas con helado y chips de chocolate.

Bot:
Claro 🍓 ¿Que sabor de helado quieres?

Cliente:
Vainilla. Es para domicilio, pago Nequi.

Bot:
Listo 😊 Para dejar tu pedido listo para revision, regalame tu nombre y direccion completa con referencia.

Cliente:
Juan Moreno, Cra 39A #41-99, casa.

Bot:
Tu pedido quedo listo para revision.
En un momento un asesor te confirma el domicilio y el total final antes de despachar 🏍️

---

## Slide 6 - Dashboard del operario

### Titulo
Panel para revisar pedidos antes de despachar

### Puntos
- Lista de pedidos por estado.
- Detalle claro de productos, adiciones y precios.
- Datos del cliente, direccion, pago y observaciones.
- Alertas cuando el pedido requiere intervencion.
- Acciones: confirmar total, preparar, despachar, avisar al cliente o cancelar.
- Pausar el bot por chat si el operario toma la conversacion.

### Visual sugerido
Captura del dashboard con etiquetas: Pedido, Cliente, Pago, Direccion, Total, Acciones.

---

## Slide 7 - Control del menu y disponibilidad

### Titulo
El restaurante controla lo que el bot puede vender

### Puntos
- Activar o apagar productos.
- Marcar productos como agotados.
- Editar precios y categorias.
- Activar o desactivar toppings/adiciones.
- El bot no debe vender productos apagados.
- Si un producto esta agotado, el bot lo reconoce y ofrece alternativas disponibles.

### Frase destacada
Producto apagado no significa inexistente: significa agotado temporalmente.

---

## Slide 8 - Configuracion operativa

### Titulo
Configuracion pensada para el dia a dia

### Puntos
- Horarios editables por dia.
- Metodos de pago configurables.
- Aliases de pago como "neqi", "neky" o "banco".
- Reglas de comprobante o efectivo.
- Bot pausado general si el negocio necesita detener respuestas.
- Zonas de domicilio en beta: el asesor confirma el valor final.

### Visual sugerido
Cards pequeñas: Horarios, Pagos, Menu, Bot pausado, Zonas beta.

---

## Slide 9 - Seguridad operativa

### Titulo
El bot no reemplaza al operario: lo ayuda

### Puntos
- No cobra directamente.
- No confirma despacho definitivo sin revision.
- No inventa productos, promociones ni precios.
- No inventa costo de domicilio.
- Si hay duda, pasa el caso a un asesor.
- El operario conserva el control final antes de despachar.

### Frase destacada
Automatizacion con control humano.

---

## Slide 10 - Beneficios para I Love Fresas

### Titulo
Impacto esperado

### Puntos
- Menos tiempo respondiendo preguntas repetidas.
- Menos pedidos incompletos.
- Menos errores en productos, toppings y pagos.
- Mejor experiencia para clientes que escriben por chat.
- Mayor orden para operar en horas pico.
- Base tecnica para conectar WhatsApp Business en el futuro.

### Visual sugerido
Antes vs despues:
Antes: chat manual desordenado.
Despues: pedido estructurado + dashboard.

---

## Slide 11 - Estado actual del proyecto

### Titulo
Beta funcional supervisada

### Puntos
- Bot funcionando por Telegram para pruebas.
- Motor de interpretacion con OpenAI.
- Dashboard operativo conectado al backend.
- Menu editable y disponibilidad configurable.
- Pedidos llegan a revision del operario.
- Confirmacion final con domicilio y total desde dashboard.

### Nota
WhatsApp Business se puede integrar sobre la misma base tecnica cuando se defina el numero, proveedor y configuracion oficial.

---

## Slide 12 - Propuesta de siguiente paso

### Titulo
Siguiente etapa: prueba supervisada

### Puntos
- Probar con pedidos reales controlados.
- Registrar errores reales de clientes.
- Ajustar textos y flujo segun operacion.
- Cargar disponibilidad y horarios finales.
- Definir tarifas de domicilio.
- Preparar integracion con WhatsApp Business.

### Cierre
La meta es que el equipo pueda vender por chat con menos friccion, mas control y menor riesgo de error.

---

## Texto corto para enviar por WhatsApp a la empresa

Hola, estamos preparando una solucion para I Love Fresas: un asistente de pedidos por chat que entiende lo que escribe el cliente, arma el pedido con el menu real y lo deja listo en un panel para que el operario revise, confirme domicilio/total y despache.

La idea no es reemplazar al equipo, sino quitar carga repetitiva, reducir errores y ordenar los pedidos que llegan por chat. Ya tenemos una beta funcional para mostrarles con Telegram y dashboard operativo.

