# AUREA by KMO · La Lomita

Versión: 0.8.2-lalomita

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
