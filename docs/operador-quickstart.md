# Operador quickstart

Guia corta para revisar pedidos antes de despachar durante la beta supervisada.

## Como revisar un pedido

Antes de despachar, confirma:

- Producto: coincide con lo que pidio el cliente.
- Cantidad: unidades correctas.
- Personalizacion: toppings, ingredientes quitados y notas claras.
- Precio: subtotal, domicilio y total tienen sentido.
- Direccion: calle/carrera, numero, barrio/zona, apto/torre/casa si aplica.
- Pago: metodo permitido y datos suficientes.
- Estado: el pedido esta en revision y no tiene dudas abiertas.

Si algo no cuadra, no despaches todavia.

## Cuando intervenir

Interviene manualmente si ves:

- Producto ambiguo o inexistente.
- Cliente cambio el pedido despues del resumen.
- Direccion incompleta, contradictoria o fuera de zona.
- Dos apartamentos, dos direcciones o dos zonas.
- Pago no permitido o varios metodos de pago.
- Efectivo sin monto de cambio.
- Transferencia/Nequi/Daviplata sin comprobante cuando sea necesario.
- Cliente molesto, confundido o pidiendo hablar con humano.
- Pedido grande o inusual.

## Cuando no despachar

No despachar si falta cualquiera de estos datos:

- Producto claro.
- Cantidad.
- Nombre de quien recibe.
- Direccion completa o confirmacion de recogida.
- Zona/barrio.
- Metodo de pago.
- Monto de efectivo si paga en efectivo.
- Confirmacion manual del operador.

## Como reportar errores

Registra el error con este minimo:

```text
Fecha:
ID pedido:
Tipo de error:
Mensaje del cliente:
Respuesta del bot:
Que corrigio el operador:
Impacto:
```

Usa el formato completo en `docs/beta-supervisada.md` cuando el error sea medio, alto o critico.

## Mensajes recomendados

Dato faltante:

```text
Para dejarlo listo me confirmas este dato, por favor:
- [dato faltante]
```

Direccion dudosa:

```text
Me confirmas la direccion completa con barrio y referencia, por favor?
```

Producto ambiguo:

```text
Para no anotarlo mal, me confirmas exactamente que producto quieres?
```

Pago pendiente:

```text
Me confirmas el metodo de pago, por favor? Recibimos Efectivo, Nequi, Daviplata y Transferencia Bancolombia.
```

Pedido en revision:

```text
Perfecto, ya tenemos tu pedido en revision. Te confirmamos antes de despachar.
```

Cliente pide humano:

```text
Claro, ya dejo la conversacion para que la revise una persona del equipo.
```
