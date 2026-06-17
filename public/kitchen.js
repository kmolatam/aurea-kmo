let kitchenDb = null;
let refreshTimer = null;

function money(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
}

function dateTime(value) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 2600);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.message || 'Error');
  return data;
}

function applyAccent() {
  const color = kitchenDb?.restaurant?.accentColor || '#c9a44c';
  document.documentElement.style.setProperty('--detail', color);
}

function statusLabel(status) {
  const labels = {
    new: 'Pendiente',
    confirmed: 'Confirmado',
    in_progress: 'En preparación',
    ready: 'Listo',
    delivered: 'Entregado',
    cancelled: 'Cancelado'
  };
  return labels[status] || status;
}

const AUTO_PRINT_KEY = 'aurea-kitchen-auto-print-v1';
const PRINTED_TICKETS_KEY = 'aurea-kitchen-printed-tickets-v1';
let autoPrintPrimed = false;

function kitchenStations() {
  const configured = kitchenDb?.restaurant?.kitchenStations;
  if (Array.isArray(configured) && configured.length) return configured;
  return [
    { id: 'hot', label: 'Barra caliente', icon: '🔥' },
    { id: 'cold', label: 'Barra fría', icon: '🥗' },
    { id: 'drinks', label: 'Bebidas', icon: '🥤' }
  ];
}

function normalizeStation(value) {
  const raw = String(value || 'hot').trim().toLowerCase();
  const found = kitchenStations().find(station => station.id === raw);
  if (found) return found.id;
  const alias = {
    caliente: 'hot', 'barra caliente': 'hot', hot: 'hot', cocina: 'hot',
    fria: 'cold', fría: 'cold', 'barra fria': 'cold', 'barra fría': 'cold', cold: 'cold',
    bebida: 'drinks', bebidas: 'drinks', drinks: 'drinks', bar: 'drinks'
  };
  return alias[raw] || kitchenStations()[0]?.id || 'hot';
}

function stationById(stationId) {
  const id = normalizeStation(stationId);
  return kitchenStations().find(station => station.id === id) || kitchenStations()[0] || { id: 'hot', label: 'Barra caliente', icon: '🔥' };
}

function stationElementId(stationId) {
  return `station-${String(stationId || 'hot').replace(/[^a-z0-9_-]/gi, '-')}`;
}

function visibleKitchenStations() {
  const stations = kitchenStations();
  const assigned = Array.isArray(kitchenDb?.staff?.kitchenStationIds) ? kitchenDb.staff.kitchenStationIds : [];
  if (!assigned.length) return stations;
  const allowed = new Set(assigned.map(normalizeStation));
  return stations.filter(station => allowed.has(station.id));
}

function lineModifierText(item) {
  return item?.modifierName ? ` · ${item.modifierGroupName || 'Opción'}: ${item.modifierName}` : '';
}

function ticketWidthMm() {
  const value = Number(kitchenDb?.restaurant?.printSettings?.ticketWidthMm || 58);
  return value === 80 ? 80 : 58;
}

function ticketPrintStyles(width = ticketWidthMm()) {
  const bodyWidth = width === 58 ? 48 : 72;
  const brandSize = width === 58 ? 17 : 20;
  const baseSize = width === 58 ? 11 : 12;
  const strongSize = width === 58 ? 14 : 15;
  return `
    @page{size:${width}mm auto;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111}
    body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace;width:${bodyWidth}mm;margin:0 auto;font-size:${baseSize}px;line-height:1.28;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .ticket{padding:3mm 1mm 4mm}.center{text-align:center}.brand{font-size:${brandSize}px;font-weight:900;letter-spacing:.06em}.muted{color:#555}.line{border-top:1px dashed #222;margin:7px 0}.row{display:flex;justify-content:space-between;gap:6px}.item{margin:7px 0;break-inside:avoid}.item strong{font-size:${strongSize}px}.item small{display:block;color:#555;margin-top:2px}.station{font-size:${width === 58 ? 14 : 16}px;font-weight:900}.footer{margin-top:8px;text-align:center;font-size:10px;color:#555}.print-actions{display:grid;gap:8px;margin-top:12px}.print-actions button{width:100%;padding:10px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:800}
    @media print{.print-actions{display:none!important}body{width:${bodyWidth}mm}.ticket{padding:2mm 0}}
  `;
}

function ticketDocument(title, bodyHtml, footer = 'Ticket de producción') {
  const restaurant = kitchenDb?.restaurant?.name || 'AUREA';
  const width = ticketWidthMm();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${ticketPrintStyles(width)}</style></head><body><div class="ticket"><div class="center"><div class="brand">${escapeHtml(restaurant)}</div><div class="muted">AUREA by KMO</div></div><div class="line"></div>${bodyHtml}<div class="line"></div><div class="footer">${escapeHtml(footer)}</div><div class="print-actions"><button onclick="window.print()">Imprimir</button><button onclick="window.close()">Cerrar</button></div></div><script>window.addEventListener('load',()=>setTimeout(()=>{window.focus();window.print()},450));<\/script></body></html>`;
}

function printHtmlDocument(title, bodyHtml, options = {}) {
  const html = ticketDocument(title, bodyHtml, options.footer || 'Ticket de producción');
  if (options.auto) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0.01';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return false;
    const autoHtml = html
      .replace(/<div class="print-actions">[\s\S]*?<\/div>/, '')
      .replace(/<script>[\s\S]*?<\/script>/, '');
    doc.open();
    doc.write(autoHtml);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (error) {
        console.warn('No se pudo autoimprimir', error);
      }
      setTimeout(() => iframe.remove(), 9000);
    }, 650);
    return true;
  }

  const w = window.open('', '_blank', 'width=420,height=720');
  if (!w) {
    toast('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes o usa el botón de impresión manual.');
    return false;
  }
  w.document.write(html);
  w.document.close();
  return true;
}

function printKitchenTicket(orderId, stationId = '', options = {}) {
  const order = (kitchenDb.orders || []).find(item => item.id === orderId);
  if (!order) {
    if (!options.auto) toast('Comanda no encontrada');
    return false;
  }
  const station = stationById(stationId);
  const lines = (order.items || []).filter(item => !stationId || normalizeStation(item.kitchenStation) === station.id);
  if (!lines.length) return false;
  const items = lines.map(item => `
    <div class="item"><strong>${escapeHtml(item.qty)}× ${escapeHtml(item.name)}</strong>${item.modifierName ? `<small>${escapeHtml(item.modifierGroupName || 'Opción')}: ${escapeHtml(item.modifierName)}</small>` : ''}${item.note ? `<small>Nota: ${escapeHtml(item.note)}</small>` : ''}${item.dinerName ? `<small>Cuenta: ${escapeHtml(item.dinerName)}</small>` : ''}</div>
  `).join('');
  return printHtmlDocument(`Comanda #${order.commandNumber || ''}`, `
    <div class="center"><strong>COMANDA #${escapeHtml(order.commandNumber || '-')}</strong><br><span>${escapeHtml(order.tableName || 'Mesa')}</span><br><span class="station">${escapeHtml(station.icon ? `${station.icon} ${station.label}` : station.label)}</span><br><span class="muted">${dateTime(order.createdAt)}</span></div>
    <div class="line"></div>${items}
    ${order.note ? `<div class="line"></div><div><strong>Nota:</strong> ${escapeHtml(order.note)}</div>` : ''}
  `, options);
}

function printKitchenTestTicket() {
  const firstStation = visibleKitchenStations()[0] || { id: 'hot', label: 'Barra caliente', icon: '🔥' };
  return printHtmlDocument('Prueba impresión AUREA', `
    <div class="center"><strong>PRUEBA DE IMPRESIÓN</strong><br><span class="station">${escapeHtml(firstStation.icon ? `${firstStation.icon} ${firstStation.label}` : firstStation.label)}</span><br><span class="muted">${dateTime(new Date())}</span></div>
    <div class="line"></div>
    <div class="item"><strong>1× Ticket de prueba</strong><small>Ancho configurado: ${ticketWidthMm()} mm</small><small>Si este ticket sale completo, cocina puede imprimir desde web.</small></div>
    <div class="line"></div>
    <div class="center"><strong>ÁUREA · OK</strong></div>
  `, { footer: 'Módulo de impresión web' });
}

function autoPrintAllowedByRestaurant() {
  return kitchenDb?.restaurant?.printSettings?.kitchenAutoPrintEnabled !== false;
}

function autoPrintEnabled() {
  return autoPrintAllowedByRestaurant() && localStorage.getItem(AUTO_PRINT_KEY) === 'yes';
}

function printedTickets() {
  try { return new Set(JSON.parse(localStorage.getItem(PRINTED_TICKETS_KEY) || '[]')); }
  catch { return new Set(); }
}

function savePrintedTickets(set) {
  localStorage.setItem(PRINTED_TICKETS_KEY, JSON.stringify(Array.from(set).slice(-500)));
}

function ticketKey(orderId, stationId) {
  return `${orderId}:${stationId}`;
}

function activeKitchenOrders() {
  return (kitchenDb?.orders || []).filter(order => !['delivered', 'cancelled'].includes(order.status));
}

function visibleTicketPairs(orders = activeKitchenOrders()) {
  const stations = visibleKitchenStations();
  const pairs = [];
  for (const order of orders) {
    for (const station of stations) {
      if ((order.items || []).some(item => normalizeStation(item.kitchenStation) === station.id)) {
        pairs.push({ order, station });
      }
    }
  }
  return pairs;
}

function primeCurrentTickets(orders = activeKitchenOrders()) {
  const printed = printedTickets();
  visibleTicketPairs(orders).forEach(({ order, station }) => printed.add(ticketKey(order.id, station.id)));
  savePrintedTickets(printed);
}

function updateAutoPrintControls() {
  const checkbox = document.getElementById('autoPrintKitchen');
  if (checkbox) {
    checkbox.checked = autoPrintEnabled();
    checkbox.disabled = !autoPrintAllowedByRestaurant();
  }
  const scope = document.getElementById('kitchenStationScope');
  if (scope) {
    const stations = visibleKitchenStations();
    const labels = stations.map(station => `${station.icon ? `${station.icon} ` : ''}${station.label}`).join(', ');
    scope.textContent = autoPrintAllowedByRestaurant()
      ? `Zona activa: ${labels || 'Todas'} · Auto impresión ${autoPrintEnabled() ? 'encendida' : 'apagada'}`
      : `Zona activa: ${labels || 'Todas'} · Auto impresión desactivada por admin`;
  }
}

function setKitchenAutoPrint(enabled) {
  if (enabled && !autoPrintAllowedByRestaurant()) {
    localStorage.setItem(AUTO_PRINT_KEY, 'no');
    updateAutoPrintControls();
    return toast('La autoimpresión está desactivada en configuración del restaurante.');
  }
  localStorage.setItem(AUTO_PRINT_KEY, enabled ? 'yes' : 'no');
  autoPrintPrimed = false;
  if (enabled) {
    primeCurrentTickets();
    autoPrintPrimed = true;
    toast('Auto impresión activada. Las próximas comandas de esta zona se mandarán al ticket.');
  } else {
    toast('Auto impresión apagada');
  }
  updateAutoPrintControls();
}

function autoPrintPendingTickets(orders = activeKitchenOrders()) {
  updateAutoPrintControls();
  if (!autoPrintEnabled()) return;
  if (!autoPrintPrimed) {
    primeCurrentTickets(orders);
    autoPrintPrimed = true;
    return;
  }
  const printed = printedTickets();
  for (const { order, station } of visibleTicketPairs(orders)) {
    const key = ticketKey(order.id, station.id);
    if (printed.has(key)) continue;
    if (printKitchenTicket(order.id, station.id, { auto: true })) printed.add(key);
  }
  savePrintedTickets(printed);
}

function printVisiblePendingTickets() {
  const pairs = visibleTicketPairs(activeKitchenOrders());
  if (!pairs.length) return toast('No hay comandas pendientes para esta zona.');
  const printed = printedTickets();
  pairs.forEach(({ order, station }) => {
    if (printKitchenTicket(order.id, station.id)) printed.add(ticketKey(order.id, station.id));
  });
  savePrintedTickets(printed);
}

async function checkKitchenSession() {
  const session = await api('/api/staff/session');
  if (session.isStaff) showKitchenApp();
}

function showKitchenApp() {
  document.getElementById('kitchenLogin').style.display = 'none';
  document.getElementById('kitchenApp').style.display = 'block';
  ensureAureaAssist('kitchen');
  showAureaReleaseNotesOnce('kitchen');
  loadKitchenData();
  if (!refreshTimer) refreshTimer = setInterval(loadKitchenData, 4000);
}

async function loadKitchenData() {
  try {
    kitchenDb = await api('/api/staff/data');
    applyAccent();
    renderKitchen();
  } catch (error) {
    if (!error.message.includes('No autorizado')) toast(error.message);
  }
}

function estimateActions(orderId) {
  return `
    <div class="inline-actions" style="margin-top:10px;">
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '10-15 min')">10-15</button>
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '15-20 min')">15-20</button>
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '20-30 min')">20-30</button>
      <button class="btn small ghost" onclick="customConfirmOrder('${orderId}')">Otro</button>
    </div>`;
}

function stationOrderCard(order, stationId) {
  const station = stationById(stationId);
  const stationItems = (order.items || []).filter(item => normalizeStation(item.kitchenStation) === station.id);
  if (!stationItems.length) return '';
  return `
    <div class="item command-card station-ticket" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">#${escapeHtml(order.commandNumber || '-')} · ${escapeHtml(order.tableName)}</div>
        <div class="item-meta">${dateTime(order.createdAt)} · ${escapeHtml(statusLabel(order.status))}${order.estimatedTime ? ` · ${escapeHtml(order.estimatedTime)}` : ''}</div>
        <div style="margin-top:10px; display:grid; gap:8px;">
          ${stationItems.map(item => `<div><strong>${item.qty}× ${escapeHtml(item.name)}${item.modifierName ? ` · ${escapeHtml(item.modifierName)}` : ''}${item.dinerName ? ` · ${escapeHtml(item.dinerName)}` : ''}</strong>${item.note ? `<div class="item-meta">Nota: ${escapeHtml(item.note)}</div>` : ''}</div>`).join('')}
        </div>
        ${order.note ? `<div class="item-meta" style="margin-top:8px;">Nota general: ${escapeHtml(order.note)}</div>` : ''}
        ${order.status === 'new' ? `<div style="margin-top:8px;"><span class="pill">Confirmar con tiempo estimado</span></div>${estimateActions(order.id)}` : ''}
      </div>
      <div class="inline-actions end">
        <button class="btn small ghost" onclick="printKitchenTicket('${order.id}', '${station.id}')">Imprimir</button>
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'in_progress')">Preparar</button>
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'ready')">Listo</button>
        <button class="btn small success" onclick="updateOrder('${order.id}', 'delivered')">Entregado</button>
      </div>
    </div>
  `;
}

function renderKitchen() {
  document.getElementById('kitchenStaffName').textContent = `${kitchenDb.staff?.name || 'Cocina'}${kitchenDb.staff?.role ? ` · ${kitchenDb.staff.role}` : ''}`;
  document.getElementById('kitchenRestaurant').textContent = kitchenDb.restaurant?.name || 'AUREA';
  const activeOrders = activeKitchenOrders();
  const stations = visibleKitchenStations();
  const grid = document.getElementById('kitchenStationGrid');
  if (!grid) return;
  grid.innerHTML = stations.map(station => {
    const col = stations.length === 1 ? 'col-12' : stations.length === 2 ? 'col-6' : 'col-4';
    return `
      <div class="${col} card command-column station-column">
        <h2>${escapeHtml(station.icon ? `${station.icon} ${station.label}` : station.label)}</h2>
        <p class="muted mini-copy">Solo productos marcados para esta zona. La impresión de esta pantalla también respeta esta zona.</p>
        <div id="${escapeHtml(stationElementId(station.id))}" class="list"></div>
      </div>
    `;
  }).join('');

  for (const station of stations) {
    const el = document.getElementById(stationElementId(station.id));
    if (!el) continue;
    const html = activeOrders
      .filter(order => (order.items || []).some(item => normalizeStation(item.kitchenStation) === station.id))
      .map(order => stationOrderCard(order, station.id))
      .filter(Boolean)
      .join('');
    el.innerHTML = html || '<div class="item"><div>Sin comandas para esta barra.</div></div>';
  }
  autoPrintPendingTickets(activeOrders);
}

async function updateOrder(id, status, estimatedTime = undefined) {
  await api(`/api/staff/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, estimatedTime }) });
  await loadKitchenData();
}

async function confirmOrder(id, estimatedTime) {
  await updateOrder(id, 'confirmed', estimatedTime);
  toast(`Comanda confirmada · ${estimatedTime}`);
}

async function customConfirmOrder(id) {
  const estimatedTime = prompt('Tiempo estimado para el cliente. Ej. 12-18 min', '15-20 min');
  if (!estimatedTime) return;
  await confirmOrder(id, estimatedTime);
}

async function kitchenLogout() {
  await api('/api/staff/logout', { method: 'POST' });
  location.reload();
}

document.getElementById('kitchenLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/staff/login', {
      method: 'POST',
      body: JSON.stringify({ pin: document.getElementById('kitchenPinLogin').value })
    });
    showKitchenApp();
  } catch (error) {
    toast(error.message);
  }
});

checkKitchenSession();


const AUREA_SUPPORT_WHATSAPP = '526601552214';
const AUREA_RELEASE_VERSION = '0.9.1';

function supportWhatsAppUrl(panel) {
  const restaurant = (typeof staffDb !== 'undefined' && staffDb?.restaurant?.name) || (typeof db !== 'undefined' && db?.restaurant?.name) || (typeof kitchenDb !== 'undefined' && kitchenDb?.restaurant?.name) || 'AUREA';
  const text = `Hola Lalo, necesito ayuda con AUREA (${panel}) en ${restaurant}.`;
  return `https://wa.me/${AUREA_SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

function ensureAureaAssist(panel = 'panel') {
  if (document.getElementById('aureaAssistDock')) return;
  const dock = document.createElement('div');
  dock.id = 'aureaAssistDock';
  dock.className = 'aurea-assist-dock';
  dock.innerHTML = `
    <button class="aurea-tour-float" type="button" onclick="startAureaTour('${panel}')">Tour</button>
    <a class="aurea-help-float" href="${supportWhatsAppUrl(panel)}" target="_blank" rel="noopener">Ayuda</a>
  `;
  document.body.appendChild(dock);
}

function releaseNotesFor(panel = 'panel') {
  if (panel === 'staff') {
    return [
      'Nuevo pedido: ahora eliges categoría → platillo → cantidad/nota.',
      'Generar cuenta: revisa total de mesa y cuentas separadas antes de cobrar.',
      'El pago capturado por mesero queda pendiente hasta autorización de admin.'
    ];
  }
  if (panel === 'kitchen') {
    return [
      'Cocina separada por Barra caliente, Barra fría y Bebidas.',
      'Cada barra ve solo los productos que le corresponden.',
      'Impresión web térmica optimizada para 58 mm / Urovo.'
    ];
  }
  return [
    'Corte diario con pagos, egresos y cierre de caja.',
    'Pagos de mesero requieren autorización de admin/capitán.',
    'Nuevo flujo de pedidos más simple para el equipo.'
  ];
}

function showAureaReleaseNotesOnce(panel = 'panel') {
  const key = `aurea-release-seen-${panel}-${AUREA_RELEASE_VERSION}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');
  const notes = releaseNotesFor(panel);
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop active aurea-release-modal';
  modal.innerHTML = `
    <div class="modal mini-modal">
      <div class="section-head">
        <div>
          <h2 style="margin:0;">Novedades AUREA ${AUREA_RELEASE_VERSION}</h2>
          <p class="muted" style="margin:6px 0 0;">Te lo mostramos una sola vez en este dispositivo.</p>
        </div>
        <button class="btn ghost small" type="button" data-close-release>Cerrar</button>
      </div>
      <div class="release-notes">
        ${notes.map((note, index) => `<div class="release-note"><strong>${index + 1}</strong><span>${note}</span></div>`).join('')}
      </div>
      <div class="inline-actions end" style="margin-top:16px;">
        <button class="btn secondary" type="button" data-start-tour>Ver tour</button>
        <button class="btn success" type="button" data-close-release>Entendido</button>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-close-release]').forEach(btn => btn.addEventListener('click', () => modal.remove()));
  modal.querySelector('[data-start-tour]')?.addEventListener('click', () => {
    modal.remove();
    startAureaTour(panel);
  });
  document.body.appendChild(modal);
}

function tourStepsFor(panel = 'panel') {
  if (panel === 'staff') {
    return [
      { selector: '.client-hero', title: 'Panel de mesero', text: 'Aquí entras a Nuevo pedido, Cocina, Tour y Ayuda.' },
      { selector: '#staffSessions', title: 'Mesas activas', text: 'Toma tu mesa y trabaja solo con las mesas asignadas a ti.' },
      { selector: '#staffSessions', title: 'Nuevo pedido', text: 'En una mesa activa toca Nuevo pedido: eliges categoría, platillo, cantidad y nota.' },
      { selector: '#staffSessions', title: 'Generar cuenta', text: 'Cuando pidan la cuenta, toca Generar cuenta. Verás total y cuentas separadas.' },
      { selector: '#staffAlerts', title: 'Alertas', text: 'Aquí aparecen solicitudes del cliente y avisos importantes.' }
    ];
  }
  if (panel === 'kitchen') {
    return [
      { selector: '.client-hero', title: 'Cocina', text: 'Aquí se ven las comandas que llegan desde QR o meseros.' },
      { selector: '#stationHot', title: 'Barra caliente', text: 'Aquí aparecen solo los productos marcados para barra caliente.' },
      { selector: '#stationCold', title: 'Barra fría', text: 'Aquí aparecen solo productos fríos o salsas configuradas.' },
      { selector: '#stationDrinks', title: 'Bebidas', text: 'Aquí aparecen bebidas y barra. Puedes imprimir ticket por barra.' }
    ];
  }
  return [
    { selector: '.sidebar', title: 'Menú admin', text: 'Desde aquí navegas entre comandas, equipo, historial, corte diario, menú y mesas.' },
    { selector: '#commands', title: 'Comandas', text: 'Monitorea pedidos activos y operación en vivo.' },
    { selector: '#finance', title: 'Corte diario', text: 'Autoriza pagos, registra egresos y cierra caja.' },
    { selector: '#menu', title: 'Menú', text: 'Edita categorías, platillos, precios y disponibilidad.' },
    { selector: '#tables', title: 'Mesas & QR', text: 'Gestiona mesas y códigos QR del restaurante.' }
  ];
}

function startAureaTour(panel = 'panel') {
  const steps = tourStepsFor(panel);
  let index = 0;
  const old = document.getElementById('aureaTourOverlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'aureaTourOverlay';
  overlay.className = 'aurea-tour-overlay';
  overlay.innerHTML = `
    <div class="aurea-tour-card">
      <div class="aurea-tour-count"></div>
      <h3></h3>
      <p></p>
      <div class="inline-actions end">
        <button class="btn ghost small" type="button" data-tour-close>Salir</button>
        <button class="btn secondary small" type="button" data-tour-prev>Anterior</button>
        <button class="btn success small" type="button" data-tour-next>Siguiente</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderStep() {
    document.querySelectorAll('.aurea-tour-highlight').forEach(el => el.classList.remove('aurea-tour-highlight'));
    const step = steps[index];
    const target = document.querySelector(step.selector);
    if (target) {
      target.classList.add('aurea-tour-highlight');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    overlay.querySelector('.aurea-tour-count').textContent = `${index + 1} / ${steps.length}`;
    overlay.querySelector('h3').textContent = step.title;
    overlay.querySelector('p').textContent = step.text;
    overlay.querySelector('[data-tour-prev]').style.visibility = index === 0 ? 'hidden' : 'visible';
    overlay.querySelector('[data-tour-next]').textContent = index === steps.length - 1 ? 'Terminar' : 'Siguiente';
  }

  function closeTour() {
    document.querySelectorAll('.aurea-tour-highlight').forEach(el => el.classList.remove('aurea-tour-highlight'));
    overlay.remove();
  }

  overlay.querySelector('[data-tour-close]').addEventListener('click', closeTour);
  overlay.querySelector('[data-tour-prev]').addEventListener('click', () => { if (index > 0) index -= 1; renderStep(); });
  overlay.querySelector('[data-tour-next]').addEventListener('click', () => {
    if (index >= steps.length - 1) return closeTour();
    index += 1;
    renderStep();
  });

  renderStep();
}

