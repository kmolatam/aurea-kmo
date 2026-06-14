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
