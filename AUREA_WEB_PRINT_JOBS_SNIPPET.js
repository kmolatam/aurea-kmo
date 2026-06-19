// Snippet lógico para el backend/web de Áurea: agrupar pedido por áreas y crear print_jobs.
// Adaptar a tu base de datos/rutas reales.

function normalizeArea(area) {
  const a = String(area || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (a === 'fria' || a === 'barrafria') return 'barra_fria';
  if (a === 'caliente' || a === 'barracaliente') return 'barra_caliente';
  if (a === 'bebida') return 'bebidas';
  return a || 'barra_caliente';
}

function groupItemsByPrintArea(items) {
  return items.reduce((acc, item) => {
    const area = normalizeArea(item.printer_area || item.printArea || item.categoryPrinterArea || item.category?.printer_area);
    if (!acc[area]) acc[area] = [];
    acc[area].push(item);
    return acc;
  }, {});
}

function buildComandaText({ order, area, items }) {
  const lines = [];
  lines.push(`MESA ${order.tableName || order.table || ''}`.trim());
  if (order.waiterName) lines.push(`MESERO: ${order.waiterName}`);
  if (order.commandNumber || order.id) lines.push(`ORDEN: ${order.commandNumber || order.id}`);
  lines.push(`AREA: ${area}`);
  lines.push('');
  for (const item of items) {
    const qty = item.qty || item.cantidad || 1;
    const name = item.name || item.nombre || 'Producto';
    lines.push(`${qty}x ${name}`);
    if (item.modifierName) lines.push(`  ${item.modifierGroupName || 'Opcion'}: ${item.modifierName}`);
    if (item.note || item.notes) lines.push(`  Nota: ${item.note || item.notes}`);
  }
  return lines.join('\n');
}

async function createPrintJobsForOrder(db, order, items) {
  const groups = groupItemsByPrintArea(items);
  for (const [area, areaItems] of Object.entries(groups)) {
    const content = buildComandaText({ order, area, items: areaItems });
    await db.query(
      `INSERT INTO print_jobs (branch_id, order_id, printer_area, title, content, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [order.branchId || order.branch_id, order.id, area, `COMANDA #${order.commandNumber || order.id}`, content]
    );
  }
}

// Ejemplo Express/Node para /claim. Adaptar si tu backend no usa Express.
// IMPORTANTE: debe correr en transacción o con update atómico para no duplicar.

app.post('/api/print-jobs/claim', async (req, res) => {
  const token = req.query.token;
  // TODO: validar token contra sucursal/restaurante.
  const { branch_id, device_id, areas = [], max_jobs = 10 } = req.body || {};
  if (!branch_id || !device_id || !Array.isArray(areas) || !areas.length) return res.json({ jobs: [] });

  await db.query('BEGIN');
  try {
    const jobs = await db.query(
      `SELECT * FROM print_jobs
       WHERE branch_id = ?
         AND status = 'pending'
         AND printer_area IN (${areas.map(() => '?').join(',')})
       ORDER BY created_at ASC
       LIMIT ?`,
      [branch_id, ...areas, Math.min(Number(max_jobs) || 10, 20)]
    );

    const ids = jobs.map(j => j.id);
    if (ids.length) {
      await db.query(
        `UPDATE print_jobs
         SET status='printing', claimed_by=?, claimed_at=CURRENT_TIMESTAMP, attempts=attempts+1, updated_at=CURRENT_TIMESTAMP
         WHERE id IN (${ids.map(() => '?').join(',')}) AND status='pending'`,
        [device_id, ...ids]
      );
    }

    await db.query('COMMIT');
    res.json({ jobs });
  } catch (e) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/print-jobs/:id/status', async (req, res) => {
  const token = req.query.token;
  // TODO: validar token.
  const { status, error = '', device_id = '' } = req.body || {};
  const allowed = new Set(['pending', 'printing', 'printed', 'error']);
  if (!allowed.has(status)) return res.status(400).json({ error: 'status inválido' });
  await db.query(
    `UPDATE print_jobs
     SET status=?, error_message=?, claimed_by=COALESCE(NULLIF(?, ''), claimed_by),
         printed_at=CASE WHEN ?='printed' THEN CURRENT_TIMESTAMP ELSE printed_at END,
         updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [status, error, device_id, status, req.params.id]
  );
  res.json({ ok: true });
});
