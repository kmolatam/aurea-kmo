# Áurea v0.9.6 — Comandas seguras, sin duplicados y cuenta unida por mesa

## Regla principal

Una mesa puede hacer pedidos muchas veces. Cada confirmación de pedido es una **ronda/comanda nueva**.

- Al pedir: la ronda se divide por área de impresión.
- Al cobrar: todo se une por la mesa/cuenta abierta.

Ejemplo:

1. Mesa 4 pide tacos + limonadas.
   - Se imprime una comanda en barra caliente.
   - Se imprime una comanda en bebidas.
2. Mesa 4 vuelve a pedir aguachile.
   - Se imprime otra comanda nueva en barra fría.
3. Mesa 4 pide cuenta.
   - La cuenta junta tacos + limonadas + aguachile.

La comanda impresa NO es la cuenta. La cuenta sale de `order_items`/productos activos ligados a la mesa/cuenta abierta.

## Modelo recomendado

```sql
CREATE TABLE IF NOT EXISTS table_sessions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS order_batches (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  table_session_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  waiter_id TEXT,
  waiter_name TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  table_session_id TEXT NOT NULL,
  order_batch_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  notes TEXT,
  printer_area TEXT NOT NULL DEFAULT 'barra_caliente',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  table_session_id TEXT,
  order_batch_id TEXT,
  table_id TEXT,
  table_name TEXT,
  printer_area TEXT NOT NULL,
  title TEXT DEFAULT 'COMANDA',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_by TEXT,
  claim_token TEXT,
  claimed_at TEXT,
  printed_at TEXT,
  error_message TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_print_jobs_idempotency
ON print_jobs (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_print_jobs_claim
ON print_jobs (branch_id, printer_area, status, created_at);
```

## Idempotencia: la llave contra duplicados

Cada ronda genera un `order_batch_id`. Cada área genera un solo `print_job`.

La llave única debe ser:

```text
branch_id + ':' + order_batch_id + ':' + printer_area
```

Ejemplo:

```text
1:batch_1005:barra_caliente
1:batch_1005:bebidas
```

Si por error el mesero pica dos veces confirmar o el internet reintenta, el `UNIQUE(idempotency_key)` evita que salgan comandas duplicadas.

## Crear pedido / ronda

Cuando el mesero confirma productos nuevos:

1. Buscar o crear `table_session` abierta para esa mesa.
2. Crear un `order_batch` nuevo.
3. Insertar SOLO los productos nuevos en `order_items` con ese `order_batch_id`.
4. Agrupar esos productos por `printer_area`.
5. Insertar un `print_job` por área usando `idempotency_key`.
6. No imprimir desde la tablet del mesero. Solo guardar jobs.

## Generar cuenta

Cuando se pide cuenta:

```sql
SELECT product_name, qty, unit_price, notes
FROM order_items
WHERE branch_id=?
  AND table_session_id=?
  AND status='active'
ORDER BY created_at ASC;
```

La cuenta se junta por `table_session_id` o mesa abierta, NO por `print_jobs`.

## Claim sin duplicados

Endpoint:

```http
POST /api/print-jobs/claim?token=TOKEN
```

Body:

```json
{
  "branch_id": "1",
  "device_id": "aurea-uuid",
  "areas": ["barra_fria", "barra_caliente", "bebidas"],
  "max_jobs": 10
}
```

Respuesta:

```json
{
  "jobs": [
    {
      "id": "job_123",
      "branch_id": "1",
      "table_session_id": "session_4",
      "order_batch_id": "batch_1005",
      "printer_area": "bebidas",
      "title": "COMANDA #1005",
      "content": "MESA 4\nMESERO: Luis\nRONDA: 1005\n\n3x Limonada"
    }
  ]
}
```

El `claim` debe ser atómico. Si tres tablets preguntan al mismo tiempo, solo una debe recibir cada job.

## Status de impresión

Endpoint:

```http
POST /api/print-jobs/:id/status?token=TOKEN
```

Body impreso:

```json
{
  "status": "printed",
  "error": "",
  "device_id": "aurea-uuid"
}
```

Body error:

```json
{
  "status": "error",
  "error": "No conectó con 00:11:22:AA:BB:CC",
  "device_id": "aurea-uuid"
}
```

Si status = `error`, en web/admin/cocina debe aparecer grande:

```text
ERROR DE IMPRESIÓN
Mesa 4 · Bebidas · Comanda #1005
Revisar puente / reimprimir
```

## Botón reimprimir

No crees otro job nuevo. Reutiliza el mismo:

```sql
UPDATE print_jobs
SET status='pending',
    claimed_by=NULL,
    claim_token=NULL,
    claimed_at=NULL,
    error_message=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE id=?;
```

Así no duplicas histórico y queda claro cuál comanda falló.

## Regla de operación urgente

Hasta que `/claim` esté desplegado en backend:

- Usa SOLO una iMin/tablet fija con puente activo.
- Las tablets de meseros con puente apagado.

Cuando `/claim` esté activo:

- Ya puedes activar mini-puente en varias tablets sin duplicar.
