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
