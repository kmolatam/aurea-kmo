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

function orderCard(order) {
  return `
    <div class="item command-card" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">#${escapeHtml(order.commandNumber || '-')} · ${escapeHtml(order.tableName)}</div>
        <div class="item-meta">${dateTime(order.createdAt)} · ${escapeHtml(statusLabel(order.status))}${order.estimatedTime ? ` · ${escapeHtml(order.estimatedTime)}` : ''}</div>
        <div style="margin-top:10px; display:grid; gap:8px;">
          ${order.items.map(item => `<div><strong>${item.qty}× ${escapeHtml(item.name)}${item.dinerName ? ` · ${escapeHtml(item.dinerName)}` : ''}</strong>${item.note ? `<div class="item-meta">Nota: ${escapeHtml(item.note)}</div>` : ''}</div>`).join('')}
        </div>
        ${order.note ? `<div class="item-meta" style="margin-top:8px;">Nota general: ${escapeHtml(order.note)}</div>` : ''}
        ${order.status === 'new' ? `<div style="margin-top:8px;"><span class="pill">Confirmar con tiempo estimado</span></div>${estimateActions(order.id)}` : ''}
      </div>
      <div class="inline-actions end">
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'in_progress')">Preparar</button>
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'ready')">Listo</button>
        <button class="btn small success" onclick="updateOrder('${order.id}', 'delivered')">Entregado</button>
      </div>
    </div>
  `;
}

function renderKitchen() {
  document.getElementById('kitchenStaffName').textContent = kitchenDb.staff?.name || 'Cocina';
  document.getElementById('kitchenRestaurant').textContent = kitchenDb.restaurant?.name || 'AUREA';
  const groups = {
    kitchenNew: kitchenDb.orders.filter(o => ['new', 'confirmed'].includes(o.status)),
    kitchenProgress: kitchenDb.orders.filter(o => o.status === 'in_progress'),
    kitchenReady: kitchenDb.orders.filter(o => o.status === 'ready')
  };
  for (const [id, orders] of Object.entries(groups)) {
    const el = document.getElementById(id);
    el.innerHTML = orders.length ? orders.map(orderCard).join('') : '<div class="item"><div>Sin comandas.</div></div>';
  }
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
const AUREA_RELEASE_VERSION = '0.8.8';

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
      'Comandas más claras para cocina.',
      'Botón de Ayuda visible para soporte inmediato.',
      'Tour disponible por si entra personal nuevo.'
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
      { selector: '#kitchenNew', title: 'Nuevas', text: 'Confirma la comanda y asigna tiempo estimado.' },
      { selector: '#kitchenProgress', title: 'En preparación', text: 'Marca como listo cuando cocina termine.' },
      { selector: '#kitchenReady', title: 'Listas', text: 'Aquí quedan las comandas listas para entregar.' }
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

