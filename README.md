# Áurea POS Urovo v0.6 - sistema completo + impresión automática

Esta APK abre el sistema web completo dentro de WebView:

- Admin
- Meseros
- Cocina
- Tickets / cuenta
- Comandas por área

Y además inyecta un puente nativo para que al tocar **Imprimir** en Áurea se mande directo a la impresora interna del Urovo, sin Chrome, sin popup y sin selector de impresora.

## Cambios v0.6

- Default URL: `https://aurea.kmo.lat/admin.html?pos=1&print=bridge`
- Botones rápidos: Admin, Meseros, Cocina, Recargar.
- Fuerza `aurea-print-mode-v1 = bridge` dentro del WebView.
- Sobrescribe `window.open()` y `window.print()` para convertir tickets web a impresión nativa.
- Feed inferior aumentado a 300 dots, aproximado 3 cm.
- Mantiene package `com.aurea.print` para reemplazar la app anterior.

## Compilar

1. Sube este proyecto a GitHub.
2. Entra a Actions.
3. Ejecuta build.
4. Descarga el artifact `app-debug.apk`.
5. Instálalo en Urovo.

Si Android dice **App no instalada**, desinstala primero la app anterior `Áurea Print / Áurea POS` y vuelve a instalar.

## Uso recomendado

- En Urovo/caja: abre Admin o Meseros dentro de la app y usa botones de imprimir.
- En Urovo/cocina: abre Cocina dentro de la app y activa auto impresión.
- En tablets normales de meseros: pueden seguir usando navegador normal sin imprimir.

## v0.9.6 Comandas seguras

Esta versión agrega alerta grande de **ERROR DE IMPRESIÓN** en el puente cuando una comanda no sale, y documentación backend para rondas por mesa:

- Cada confirmación de pedido crea una ronda/order_batch nueva.
- La ronda se divide por `printer_area` para imprimir comandas.
- La cuenta se junta por `table_session_id` o mesa abierta.
- `idempotency_key` evita comandas duplicadas.
- `/api/print-jobs/claim` atómico permite varios mini-puentes sin duplicar.

Mientras el backend no tenga `/claim`, usa una sola iMin/tablet fija con Puente BT activo.
