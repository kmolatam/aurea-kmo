# AUREA by KMO · La Lomita

Versión: 0.9.2-urovo-bridge

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


## Urovo Bridge / Áurea Print v0.9.2

Esta versión agrega impresión por app puente **Áurea Print** para Urovo i9100 cuando Chrome no expone la impresora interna al `window.print()`.

Flujo real:
- Mesero crea comanda desde `/staff.html`.
- AUREA envía el ticket al esquema `aureaprint://` usando Android Intent.
- La app instalada **Áurea Print** recibe el texto e imprime en la térmica interna del Urovo.
- Cocina y Admin conservan impresión web como respaldo en equipos que no sean Android.

Uso recomendado:
1. Instalar la APK **Áurea Print** en el Urovo.
2. Abrir AUREA desde Chrome en el Urovo.
3. Entrar a `/staff.html` o `/kitchen.html`.
4. Crear una comanda o pulsar “Probar ticket”.
5. En Android, AUREA usará el puente automáticamente; en PC seguirá usando impresión web.

Modo manual opcional en consola del navegador:
- Forzar puente: `AureaPrintBridge.setMode('bridge')`
- Forzar web print: `AureaPrintBridge.setMode('web')`
- Automático: `AureaPrintBridge.setMode('auto')`
