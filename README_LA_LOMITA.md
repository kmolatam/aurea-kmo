# AUREA by KMO · La Lomita

Versión: 0.9.1-web-print-urovo

## Cambios incluidos

- Perfil limpio para **La Lomita**.
- Se ocultaron los módulos **CRM WhatsApp** y **WhatsApp Pedidos** mientras se pulen.
- Login administrativo normal y super admin.
- PIN de staff con prefijo del restaurante: `LL-####`.
- Staff inicial: `La Lomita` con PIN operativo `LL-1564` (también acepta escribir `1564` en login de meseros).
- Tour inicial de admin una sola vez.
- Panel de meseros pide activar notificaciones del navegador para nuevas comandas/alertas.

## Accesos iniciales

Admin restaurante:
- Usuario: `lalomita`
- Contraseña: `1564`

Super admin:
- Usuario: `lalo`
- Contraseña: `aurea-super-1564`

Meseros:
- PIN: `1564` o `LL-1564`

## Recomendado en Coolify

Instalación:
```bash
rm -f package-lock.json && npm install --no-audit --no-fund
```

Start:
```bash
npm start
```

Puerto: `3000`


## Web Print Urovo v0.9.1

Agrega:
- Ticket web optimizado para 58 mm y 80 mm.
- Perfil recomendado para Urovo i9100 / Smart POS con impresora interna de 58 mm.
- Botón “Probar ticket web” en Configuración del admin.
- Botón “Probar ticket” en pantalla de cocina.
- Admin, staff y cocina respetan el ancho configurado en AUREA.

Uso recomendado para Urovo i9100:
1. Entrar a Admin → Configuración.
2. Seleccionar ancho de ticket: 58 mm.
3. Guardar.
4. Abrir AUREA desde Chrome en el Urovo.
5. Presionar “Probar ticket web”.
6. Si Android muestra la impresora interna / servicio de impresión y sale el ticket completo, usar impresión web directa.

Nota técnica:
La impresión sigue usando `window.print()` desde navegador. Si el Urovo no expone su térmica interna al navegador/servicio de impresión, se requerirá app puente o SDK del fabricante.
