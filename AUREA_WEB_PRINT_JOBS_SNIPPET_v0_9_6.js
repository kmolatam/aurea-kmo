// Áurea v0.9.6 - snippet backend lógico para comandas seguras.
// Adaptar a tu stack real. Diseñado para Node/Express + SQL genérico.
// La regla es: cada confirmación de pedido crea una ronda/batch;
// la ronda se divide por área; la cuenta se junta por mesa/table_session.

const crypto = require('crypto');

function uuid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function normalizeArea(area) {
  const a = String(area || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (a === 'fria' || a === 'barrafria') return 'barra_fria';
  if (a === 'caliente' || a === 'barracaliente') return 'barra_caliente';
  if (a === 'bebida') return 'bebidas';
  if (a === 'ticket' || a === 'cuenta' || a === 'recibo') return 'caja';
  return a || 'barra_caliente';
}

function areaLabel(area) {
  const a = normalizeArea(area);
  if (a === 'barra_fria') return 'BARRA FRÍA';
  if (a === 'barra_caliente') return 'BARRA CALIENTE';
  if (a === 'bebidas') return 'BEBIDAS';
  if (a === 'caja') return 'CAJA';
  return a.toUpperCase();
}

function groupItemsByArea(items) {
  return (items || []).reduce((acc, item) => {
    const area = normalizeArea(item.printer_area || item.printArea || item.categoryPrinterArea || item.category?.printer_area);
    (acc[area] ||= []).push({ ...item, printer_area: area });
    return acc;
  }, {});
}

function buildComandaText({ tableName, waiterName, batchNumber, area, items }) {
  const lines = [];
  lines.push(`MESA ${tableName || ''}`.trim());
  if (waiterName) lines.push(`MESERO: ${waiterName}`);
  if (batchNumber) lines.push(`RONDA: ${batchNumber}`);
  lines.push(`AREA: ${areaLabel(area)}`);
  lines.push('');
  for (const item of items) {
    const qty = item.qty || item.cantidad || 1;
    const name = item.name || item.nombre || item.product_name || 'Producto';
    lines.push(`${qty}x ${name}`);
    if (item.modifierName) lines.push(`  ${item.modifierGroupName || 'Opción'}: ${item.modifierName}`);
    if (item.notes || item.note) lines.push(`  Nota: ${item.notes || item.note}`);
  }
  return lines.join('\n');
}

// Debes implementar según tu DB real.
// db.query(sql, params) aquí representa query async.
async function getOrCreateOpenTableSession(db, { branchId, tableId, tableName }) {
  const rows = await db.query(
    `SELECT * FROM table_sessions WHERE branch_id=? AND table_id=? AND status='open' LIMIT 1`,
    [branchId, tableId]
  );
  if (rows && rows[0]) return rows[0];
  const id = uuid('session');
  await db.query(
    `INSERT INTO table_sessions (id, branch_id, table_id, table_name, status, opened_at)
     VALUES (?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)`,
    [id, branchId, tableId, tableName]
  );
  return { id, branch_id: branchId, table_id: tableId, table_name: tableName, status: 'open' };
}

async function createOrderBatchAndPrintJobs(db, payload) {
  const branchId = String(payload.branch_id || payload.branchId || '1');
  const tableId = String(payload.table_id || payload.tableId || payload.table || '');
  const tableName = String(payload.table_name || payload.tableName || `Mesa ${tableId}`);
  const waiterId = String(payload.waiter_id || payload.waiterId || '');
  const waiterName = String(payload.waiter_name || payload.waiterName || '');
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!branchId || !tableId || !items.length) throw new Error('Faltan branch/table/items');

  await db.query('BEGIN');
  try {
    const session = await getOrCreateOpenTableSession(db, { branchId, tableId, tableName });
    const batchId = uuid('batch');
    const batchNumber = Date.now().toString().slice(-6);

    await db.query(
      `INSERT INTO order_batches (id, branch_id, table_session_id, table_id, table_name, waiter_id, waiter_name, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)`,
      [batchId, branchId, session.id, tableId, tableName, waiterId, waiterName]
    );

    for (const item of items) {
      const area = normalizeArea(item.printer_area || item.printArea || item.categoryPrinterArea || item.category?.printer_area);
      await db.query(
        `INSERT INTO order_items (id, branch_id, table_session_id, order_batch_id, table_id, table_name, product_id, product_name, qty, unit_price, notes, printer_area, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
        [
          uuid('item'), branchId, session.id, batchId, tableId, tableName,
          item.product_id || item.productId || '',
          item.name || item.nombre || item.product_name || 'Producto',
          Number(item.qty || item.cantidad || 1),
          Number(item.unit_price || item.price || item.precio || 0),
          item.notes || item.note || '',
          area
        ]
      );
    }

    const groups = groupItemsByArea(items);
    for (const [area, areaItems] of Object.entries(groups)) {
      const idempotencyKey = `${branchId}:${batchId}:${area}`;
      const content = buildComandaText({ tableName, waiterName, batchNumber, area, items: areaItems });
      // SQLite: INSERT OR IGNORE. Postgres: ON CONFLICT(idempotency_key) DO NOTHING.
      await db.query(
        `INSERT OR IGNORE INTO print_jobs
         (id, branch_id, table_session_id, order_batch_id, table_id, table_name, printer_area, title, content, status, attempts, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [uuid('job'), branchId, session.id, batchId, tableId, tableName, area, `COMANDA #${batchNumber}`, content, idempotencyKey]
      );
    }

    await db.query('COMMIT');
    return { ok: true, table_session_id: session.id, order_batch_id: batchId, batch_number: batchNumber };
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}

// Claim atómico versión SQLite-friendly.
async function claimPrintJobs(db, { branch_id, device_id, areas = [], max_jobs = 10 }) {
  const branchId = String(branch_id || '');
  const deviceId = String(device_id || '');
  const safeAreas = areas.map(normalizeArea).filter(Boolean);
  const limit = Math.min(Number(max_jobs) || 10, 20);
  if (!branchId || !deviceId || !safeAreas.length) return [];

  const claimToken = uuid('claim');
  await db.query('BEGIN IMMEDIATE');
  try {
    const marks = safeAreas.map(() => '?').join(',');
    const candidates = await db.query(
      `SELECT id FROM print_jobs
       WHERE branch_id=? AND status='pending' AND printer_area IN (${marks})
       ORDER BY created_at ASC
       LIMIT ?`,
      [branchId, ...safeAreas, limit]
    );
    const ids = candidates.map(j => j.id);
    if (!ids.length) {
      await db.query('COMMIT');
      return [];
    }
    await db.query(
      `UPDATE print_jobs
       SET status='printing', attempts=attempts+1, claimed_by=?, claim_token=?, claimed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE id IN (${ids.map(() => '?').join(',')}) AND status='pending'`,
      [deviceId, claimToken, ...ids]
    );
    const jobs = await db.query(
      `SELECT * FROM print_jobs WHERE claimed_by=? AND claim_token=? ORDER BY created_at ASC`,
      [deviceId, claimToken]
    );
    await db.query('COMMIT');
    return jobs;
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}

// Express routes ejemplo:
// app.post('/api/orders/confirm', async (req,res)=> res.json(await createOrderBatchAndPrintJobs(db, req.body)));
// app.post('/api/print-jobs/claim', async (req,res)=> res.json({ jobs: await claimPrintJobs(db, req.body || {}) }));
// app.post('/api/print-jobs/:id/status', async (req,res)=> { ... actualizar printed/error ... });
