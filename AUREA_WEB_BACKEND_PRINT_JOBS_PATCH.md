# Patch requerido en Áurea web/backend para comandas multi-impresora sin duplicar

La APK v0.9.5 ya puede actuar como puente. Pero para que 3 tablets manden comandas a 3 impresoras sin Bluetooth entre ellas, la web/backend debe usar una cola central de impresión.

## Regla de oro

Las tablets de meseros NO imprimen directo. Las tablets de meseros crean pedidos. El backend crea `print_jobs`. El puente reclama trabajos pendientes y los imprime.

## Tablas mínimas

```sql
CREATE TABLE IF NOT EXISTS print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id TEXT NOT NULL,
  order_id TEXT,
  printer_area TEXT NOT NULL,
  title TEXT DEFAULT 'COMANDA',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_by TEXT,
  claimed_at TEXT,
  printed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_claim
ON print_jobs (branch_id, printer_area, status, created_at);
```

Valores de `printer_area`:

```text
barra_fria
barra_caliente
bebidas
caja
```

Estados:

```text
pending
printing
printed
error
```

## Crear jobs al guardar pedido

Cuando el mesero confirma un pedido, el backend debe agrupar los productos por área de impresión.

Ejemplo de producto/categoría:

```json
{
  "name": "Aguachile",
  "qty": 1,
  "printer_area": "barra_fria"
}
```

Pedido mixto:

```json
[
  { "name": "Hamburguesa", "qty": 2, "printer_area": "barra_caliente" },
  { "name": "Aguachile", "qty": 1, "printer_area": "barra_fria" },
  { "name": "Limonada", "qty": 3, "printer_area": "bebidas" }
]
```

Debe crear 3 registros en `print_jobs`, uno por área.

## Formato de content recomendado

```text
MESA 4
MESERO: Luis
ORDEN: 102
HORA: 14:35

2x Hamburguesa
  Nota: sin cebolla
```

## Endpoint claim sin duplicados

La APK manda:

```http
POST /api/print-jobs/claim?token=TOKEN
Content-Type: application/json
```

Body:

```json
{
  "branch_id": "1",
  "device_id": "aurea-uuid",
  "areas": ["barra_fria", "barra_caliente", "bebidas"],
  "max_jobs": 10,
  "client_time": "2026-06-19 14:10:00"
}
```

Respuesta:

```json
{
  "jobs": [
    {
      "id": 123,
      "branch_id": "1",
      "order_id": "102",
      "printer_area": "bebidas",
      "title": "COMANDA #102",
      "content": "MESA 4\nMESERO: Luis\n\n3x Limonada"
    }
  ]
}
```

El backend debe hacer el claim en transacción:

1. Buscar jobs `pending` de esa sucursal y áreas.
2. Marcarlos `printing`, aumentar attempts y poner `claimed_by=device_id`.
3. Regresar esos mismos jobs.

Si dos tablets preguntan al mismo tiempo, solo una debe llevarse cada job.

## Endpoint status

La APK manda:

```http
POST /api/print-jobs/123/status?token=TOKEN
Content-Type: application/json
```

Body:

```json
{
  "status": "printed",
  "error": "",
  "device_id": "aurea-uuid",
  "device_time": "2026-06-19 14:10:02"
}
```

Si falla:

```json
{
  "status": "error",
  "error": "No conectó con 00:11:22:AA:BB:CC",
  "device_id": "aurea-uuid"
}
```

## Reintentos

Para errores recuperables, el panel admin debe tener botón de reimprimir que ponga:

```sql
UPDATE print_jobs
SET status='pending', claimed_by=NULL, claimed_at=NULL, error_message=NULL, updated_at=CURRENT_TIMESTAMP
WHERE id=?;
```

## Qué cambia en la web

En Admin:

- Configuración > Categorías > Área de impresión.
- Cada categoría debe tener `printer_area`.

En Meseros:

- Al confirmar pedido, no imprimir directo.
- Guardar pedido y dejar que backend cree print_jobs.

En Cocina:

- Puede seguir mostrando comandas visuales.
- No debe duplicar impresión si ya existe print_job.

En POS/iMin:

- La impresora interna puede seguir imprimiendo cuenta/ticket local.
- Las comandas de producción salen por print_jobs.
