AUREA v0.8.3 · La Lomita

Cambios:
- Home con accesos a Portal meseros / Portal cocina / Portal administrador / By KMO.
- Botones de inicio actualizados a Login y By KMO.
- Logo SVG de AUREA integrado en barra administrativa y pantallas principales.
- Refuerzo del aviso para activar notificaciones en portal de meseros.
- Soporte para AUREA_DB_PATH por instancia, útil para aislar clientes en el mismo servidor.

Recomendación comercial:
- 1 deployment por restaurante.
- 1 subdominio por restaurante.
- 1 juego de credenciales por restaurante.
- 1 volumen / base de datos por restaurante.


## Portal Super Admin

Ruta: `/superadmin.html`

Uso:
1. Inicia sesión en `/admin.html` con un usuario de rol `superadmin`.
2. Abre `/superadmin.html`.
3. Genera el cliente nuevo.
4. Copia variables a Coolify.
5. Crea el A Record del subdominio en Namecheap.
6. Deploy de la instancia nueva.

Este portal genera credenciales, PIN inicial, `SESSION_SECRET`, `AUREA_DB_PATH`, checklist y mensaje para entregar al cliente.


## Comanda manual

Versión 0.8.5 agrega comanda manual desde:
- Portal meseros: botón `+ Comanda manual`
- Portal administrador: Comandas → `+ Comanda manual`

Si la mesa seleccionada no tiene sesión activa, AUREA crea la sesión automáticamente y manda la comanda a cocina.


## Hotfix 0.8.6

- Se eliminó el botón visible de `Portal super admin` de la barra lateral del cliente.
- El portal maestro queda accesible únicamente escribiendo manualmente:
  - `/superadmin`
  - `/superadmin.html`
- La ruta sigue protegida por sesión de rol `superadmin`.


## Corte diario v0.8.7

Agrega:
- Pagos capturados por mesero y autorizados por admin/capitán.
- Corte diario con efectivo, tarjeta, transferencia, egresos y diferencia de caja.
- Egresos del día con concepto, proveedor, método y nota.
- Cierre del día con fondo inicial, efectivo contado y resumen copiable.

Flujo recomendado:
1. Mesero captura pago.
2. Admin autoriza pago en Corte diario.
3. Admin cierra mesa.
4. Al final del día, admin registra egresos y hace cierre.


## UX meseros v0.8.8

Agrega:
- Botón “Nuevo pedido”.
- Flujo de pedido por categorías: categoría → platillo → cantidad/nota/persona → enviar.
- Generar cuenta por mesa activa.
- Cuenta separada por persona cuando el mesero etiqueta productos con “Cuenta / persona”.
- Botón flotante “Tour” en admin, mesero y cocina.
- Botón flotante “Ayuda” con WhatsApp de soporte: 660 155 2214.
- Novedades mostradas una sola vez por dispositivo para admin, mesero y cocina.

Regla operativa:
- Mesero captura pedido y puede generar cuenta.
- Mesero captura pago, pero queda pendiente.
- Admin/capitán autoriza pago en Corte diario.


## Hotfix operativo v0.8.9

Agrega:
- Corrección del duplicado en Nuevo pedido del portal meseros: cada comanda nueva inicia con borrador limpio sin borrar lo anterior de la cuenta.
- Área de preparación por producto: Barra caliente, Barra fría o Bebidas.
- Pantalla de cocina separada por barras para que cada equipo vea solo sus productos.
- Subdivisión de selección única por platillo, por ejemplo Salsa verde / Salsa roja / Salsa negra.
- Cancelación de comanda desde portal meseros.
- Impresión térmica básica desde navegador para comandas y cuenta de mesa.

Nota impresión:
- Funciona como impresión web/print service del navegador. Si el equipo Android POS expone la impresora al navegador o al servicio de impresión, puede imprimir directo. Si la impresora integrada está cerrada por SDK privado, se requerirá adaptador específico del fabricante.

## Cocina por zonas e impresión automática v0.9.0

Agrega:
- Zonas de cocina editables desde Configuración.
- Productos asignados a una zona de preparación.
- Staff/cocineros asignados a una o varias zonas de cocina.
- Pantalla de cocina filtrada por las zonas del cocinero que inició sesión.
- Auto impresión local desde `/kitchen.html`: al activar “Auto imprimir”, las próximas comandas de esa zona se mandan a ticket térmico.
- Botón “Imprimir pendientes” para sacar papel manualmente sin tocar cada comanda.

Nota operativa:
- La autoimpresión web usa el navegador del dispositivo de cocina. Para impresión sin diálogo se recomienda configurar el dispositivo en modo kiosk / impresión directa o dejar la impresora térmica como predeterminada.
