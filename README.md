# AUREA by KMO - MVP v0.8.1

Sistema QR para restaurantes: menú, pedidos, comandas, Staff Intelligence, CRM WhatsApp, cuenta inteligente, cuentas separadas, experiencia premium, cierre operativo de mesa y base para **WhatsApp Pedidos**.

## Correr

```bash
npm install
npm start
```

## URLs

- Landing: http://localhost:3000
- Admin: http://localhost:3000/admin.html
- Mesa demo: http://localhost:3000/t/mesa-1
- Staff: http://localhost:3000/staff.html
- Cocina: http://localhost:3000/kitchen.html

## Accesos demo

Admin:
- Usuario: `admin`
- Contraseña: `aurea123`

Staff/Cocina:
- PIN: `1234`

## Nuevo en v0.8.1

- Se mantiene el **look visual de v0.8**.
- Nuevo módulo **WhatsApp Pedidos** en Admin.
- Registro manual/API-ready de pedidos que llegan por WhatsApp.
- Bandeja para:
  - crear pedido WhatsApp,
  - confirmar,
  - marcar en preparación,
  - marcar listo,
  - cerrar,
  - cancelar,
  - responder por WhatsApp.
- Botón **Mandar a cocina** para convertir un pedido WhatsApp en comanda interna de AUREA.
- QR estable para que clientes abran WhatsApp con mensaje prellenado.
- Campos de preparación para WhatsApp Business Cloud API oficial:
  - Business Portfolio ID,
  - WABA ID,
  - Phone Number ID,
  - Webhook URL,
  - Display name.
- Identificador interno de restaurante (`instanceSlug`) para preparar multi-restaurante.

## Nota importante

Esta versión NO usa automatización no oficial de WhatsApp Web. El módulo es manual/API-ready y prepara el camino para Cloud API oficial.

## Roadmap siguiente

- v0.8.2 / v1.0: multi-restaurante real con login por restaurante y aislamiento total de datos.
- v1.1: WhatsApp Cloud API oficial con webhooks.
- v1.2: plantillas aprobadas, opt-in/opt-out y automatizaciones controladas.


## Seguridad multi-restaurante

AUREA en esta versión funciona como **single-tenant** por instancia: un restaurante por despliegue.

### Recomendación para venderlo a otros clientes
- Crea **una instancia / app separada por restaurante** en Coolify.
- Asigna **un subdominio distinto** a cada cliente (ej. `lomita.tudominio.com`, `otrocliente.tudominio.com`).
- Cambia en cada instancia las variables: `AUREA_USER`, `AUREA_PASS`, `AUREA_SUPER_USER`, `AUREA_SUPER_PASS`, `SESSION_SECRET`.
- Si quieres persistencia aislada, puedes definir `AUREA_DB_PATH` a una ruta distinta por cliente o montar un volumen separado.

Así evitas que personal de un restaurante entre al panel de otro.


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


## Urovo Bridge v0.9.3 · regreso automático

- El puente web ahora manda `returnUrl` a la app `Áurea Print`.
- Después de imprimir, la app actualizada puede regresar automáticamente a la página de AUREA donde estaba el usuario.
- Requiere instalar `Áurea Print v0.2` o superior en el Urovo.
