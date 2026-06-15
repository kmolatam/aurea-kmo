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
