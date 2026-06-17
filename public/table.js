const state = {
  tableId: location.pathname.split('/').pop(),
  table: null,
  restaurant: null,
  categories: [],
  menuItems: [],
  selectedCategory: 'all',
  cart: [],
  customer: null,
  lastOrder: null,
  orderPollTimer: null,
  billSummary: null,
  billTipPercent: 10,
  feedbackRating: 5,
  repeatSelection: {},
  diners: [],
  splitMode: false
};

function money(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
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

function storageKey() {
  return `aurea_customer_${state.tableId}`;
}

function lastOrderKey() {
  return `aurea_last_order_${state.tableId}`;
}

function dinersKey() {
  return `aurea_diners_${state.tableId}`;
}

function splitModeKey() {
  return `aurea_split_mode_${state.tableId}`;
}

function parseDiners(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map(name => name.trim())
    .filter((name, index, arr) => name && arr.findIndex(item => item.toLowerCase() === name.toLowerCase()) === index)
    .slice(0, 16);
}

function dinersText() {
  return state.diners.join(', ');
}

function saveDinersLocal() {
  localStorage.setItem(dinersKey(), JSON.stringify(state.diners));
  localStorage.setItem(splitModeKey(), state.splitMode ? 'yes' : 'no');
}

function readDinersFromStorage() {
  try { state.diners = JSON.parse(localStorage.getItem(dinersKey()) || '[]'); } catch { state.diners = []; }
  state.splitMode = localStorage.getItem(splitModeKey()) === 'yes';
}

async function saveDinersRemote() {
  try {
    await api(`/api/public/table/${state.tableId}/diners`, {
      method: 'POST',
      body: JSON.stringify({
        diners: state.diners,
        customerName: state.customer?.name || '',
        customerPhone: state.customer?.phone || ''
      })
    });
  } catch (error) {
    console.warn('No se pudieron guardar cuentas separadas', error);
  }
}

function dinerOptions(selected = '') {
  const options = [''].concat(state.diners || []);
  return options.map(name => `<option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${name ? escapeHtml(name) : 'Sin asignar'}</option>`).join('');
}

function lineKey(line) {
  return line.localId || line.itemId;
}

function makeCartLocalId(itemId) {
  return `${itemId}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function itemModifiers(item) {
  return Array.isArray(item?.modifiers) ? item.modifiers : [];
}

function selectedMenuModifier(itemId) {
  const checked = document.querySelector(`input[name="modifier-${CSS.escape(itemId)}"]:checked`);
  return checked?.value || '';
}

function modifierPickerHtml(item) {
  const options = itemModifiers(item);
  if (!options.length) return '';
  return `
    <div class="modifier-picker menu-modifier-picker">
      <div class="form-label">${escapeHtml(item.modifierGroupName || 'Opción')}</div>
      <div class="choice-grid modifier-choice-grid">
        ${options.map((option, index) => `
          <label class="choice-check ${index === 0 ? 'active' : ''}">
            <input type="radio" name="modifier-${escapeHtml(item.id)}" value="${escapeHtml(option)}" ${index === 0 ? 'checked' : ''} onchange="setChoiceActive(this)" />
            <span>${escapeHtml(option)}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function toggleLeadDiners() {
  const checked = document.getElementById('leadSplitMode')?.checked;
  const wrap = document.getElementById('leadDinersWrap');
  if (wrap) wrap.style.display = checked ? 'grid' : 'none';
}

function toggleOrderSplitMode() {
  state.splitMode = document.getElementById('orderSplitMode')?.checked || false;
  const wrap = document.getElementById('orderDinersWrap');
  if (wrap) wrap.style.display = state.splitMode ? 'grid' : 'none';
  saveDinersLocal();
  renderCartLines();
}

function toggleBillSplitMode() {
  state.splitMode = document.getElementById('billSplitMode')?.checked || false;
  const wrap = document.getElementById('billDinersWrap');
  if (wrap) wrap.style.display = state.splitMode ? 'grid' : 'none';
  saveDinersLocal();
  renderBillSummary();
}

function updateDinersFromInput(source) {
  const inputId = source === 'bill' ? 'billDiners' : 'orderDiners';
  state.diners = parseDiners(document.getElementById(inputId)?.value || '');
  state.splitMode = true;
  saveDinersLocal();
  if (source === 'order') renderCartLines();
  if (source === 'bill') renderBillSummary();
}

function setCartDiner(key, value) {
  const line = state.cart.find(item => lineKey(item) === key);
  if (line) line.dinerName = value || '';
}

function splitAssignedQty(line) {
  return (line.splitAssignments || []).reduce((sum, part) => sum + Number(part.qty || 0), 0);
}

function splitQtyFor(line, dinerName) {
  const found = (line.splitAssignments || []).find(part => part.dinerName === dinerName);
  return Number(found?.qty || 0);
}

function setCartSplitQty(key, dinerName, value) {
  const line = state.cart.find(item => lineKey(item) === key);
  if (!line) return;
  line.splitAssignments = Array.isArray(line.splitAssignments) ? line.splitAssignments : [];
  const cleanName = String(dinerName || '').trim();
  const currentOther = line.splitAssignments
    .filter(part => part.dinerName !== cleanName)
    .reduce((sum, part) => sum + Number(part.qty || 0), 0);
  const allowed = Math.max(0, Number(line.qty || 0) - currentOther);
  const qty = Math.max(0, Math.min(allowed, Math.floor(Number(value || 0))));
  const index = line.splitAssignments.findIndex(part => part.dinerName === cleanName);
  if (qty <= 0 && index >= 0) line.splitAssignments.splice(index, 1);
  else if (qty > 0 && index >= 0) line.splitAssignments[index].qty = qty;
  else if (qty > 0) line.splitAssignments.push({ dinerName: cleanName, qty });
  renderCartLines();
}

function phoneForWhatsApp(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `52${digits}`;
  return digits;
}

function whatsappUrl(phone, message) {
  const digits = phoneForWhatsApp(phone);
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
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

function applyRestaurantBrand() {
  const accent = state.restaurant?.accentColor || '#c9a44c';
  document.documentElement.style.setProperty('--detail', accent);
  const logo = document.getElementById('restaurantLogo');
  if (state.restaurant?.logoDataUrl) {
    logo.innerHTML = `<img src="${state.restaurant.logoDataUrl}" alt="Logo" />`;
  } else {
    logo.textContent = (state.restaurant?.logoText || state.restaurant?.name || 'A').slice(0, 2).toUpperCase();
  }
}

async function load() {
  try {
    const tableData = await api(`/api/public/table/${state.tableId}`);
    const restaurantData = await api('/api/public/restaurant');
    state.table = tableData.table;
    state.restaurant = restaurantData.restaurant;
    state.categories = restaurantData.categories;
    state.menuItems = restaurantData.menuItems;

    applyRestaurantBrand();
    document.title = `${state.table.name} · ${state.restaurant.name}`;
    document.getElementById('tableName').textContent = state.table.name;
    document.getElementById('restaurantName').textContent = state.restaurant.name;
    document.getElementById('restaurantSubtitle').textContent = state.restaurant.subtitle || '';
    if (document.getElementById('leadConsentText')) document.getElementById('leadConsentText').textContent = state.restaurant.crmOptInText || ''; 

    readCustomerFromStorage();
    readDinersFromStorage();
    try {
      const dinersData = await api(`/api/public/table/${state.tableId}/diners?ts=${Date.now()}`);
      if (dinersData.diners?.length) { state.diners = dinersData.diners; state.splitMode = true; saveDinersLocal(); }
    } catch {}
    renderKnownCustomer();
    renderCategories();
    renderMenu();
    maybeShowWelcome();
    resumeLastOrder();
  } catch (error) {
    document.querySelector('.client-page').innerHTML = `<div class="card"><h1>Mesa no encontrada</h1><p style="color:var(--muted)">${escapeHtml(error.message)}</p></div>`;
  }
}

function readCustomerFromStorage() {
  try {
    state.customer = JSON.parse(localStorage.getItem(storageKey()) || 'null');
  } catch {
    state.customer = null;
  }
}

function saveCustomerToStorage(customer) {
  state.customer = customer;
  localStorage.setItem(storageKey(), JSON.stringify(customer));
  renderKnownCustomer();
}

function renderKnownCustomer() {
  const el = document.getElementById('knownCustomer');
  if (!state.customer?.phone) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = `WhatsApp guardado: <strong>${escapeHtml(state.customer.phone)}</strong>`;
}

function maybeShowWelcome() {
  if (!state.restaurant?.crmEnabled) return;
  if (state.customer?.phone || localStorage.getItem(`${storageKey()}_skipped`) === 'yes') return;
  document.getElementById('welcomeBackdrop').classList.add('active');
}

async function saveLead(source) {
  const name = document.getElementById('leadName').value.trim();
  const phone = document.getElementById('leadPhone').value.replace(/\D/g, '');
  const optInPromos = document.getElementById('leadOptIn').checked;
  const leadSplit = document.getElementById('leadSplitMode')?.checked || false;
  if (leadSplit) {
    state.splitMode = true;
    state.diners = parseDiners(document.getElementById('leadDiners')?.value || '');
    saveDinersLocal();
  }

  if (!phone) return null;

  const response = await api(`/api/public/table/${state.tableId}/contact`, {
    method: 'POST',
    body: JSON.stringify({ name, phone, optInPromos, source, diners: state.diners })
  });

  saveCustomerToStorage({ name, phone, optInPromos, contactId: response.contact.id });
  return response.contact;
}

async function continueInWeb() {
  try {
    const phone = document.getElementById('leadPhone').value.replace(/\D/g, '');
    if (phone) await saveLead('menu_web');
    else {
      if (document.getElementById('leadSplitMode')?.checked) {
        state.splitMode = true;
        state.diners = parseDiners(document.getElementById('leadDiners')?.value || '');
        saveDinersLocal();
        await saveDinersRemote();
      }
      localStorage.setItem(`${storageKey()}_skipped`, 'yes');
    }
    document.getElementById('welcomeBackdrop').classList.remove('active');
    toast(phone ? 'Cliente VIP guardado' : 'Puedes seguir navegando');
  } catch (error) {
    toast(error.message);
  }
}

async function continueInWhatsApp() {
  try {
    const phone = document.getElementById('leadPhone').value.replace(/\D/g, '');
    if (phone) await saveLead('menu_whatsapp');
    else localStorage.setItem(`${storageKey()}_skipped`, 'yes');

    const restaurantPhone = state.restaurant.whatsapp;
    const message = `Hola, estoy en ${state.table.name}. Quiero continuar la atención por WhatsApp.`;
    const url = whatsappUrl(restaurantPhone, message);
    document.getElementById('welcomeBackdrop').classList.remove('active');
    if (url) window.open(url, '_blank');
    else toast('El restaurante todavía no configuró su WhatsApp');
  } catch (error) {
    toast(error.message);
  }
}

function skipLead() {
  localStorage.setItem(`${storageKey()}_skipped`, 'yes');
  document.getElementById('welcomeBackdrop').classList.remove('active');
}

function renderCategories() {
  const el = document.getElementById('categories');
  const chips = [{ id: 'all', name: 'Todo' }, ...state.categories];
  el.innerHTML = chips.map(cat => `
    <button class="category-chip ${state.selectedCategory === cat.id ? 'active' : ''}" onclick="selectCategory('${cat.id}')">
      ${escapeHtml(cat.name)}
    </button>
  `).join('');
}

function selectCategory(categoryId) {
  state.selectedCategory = categoryId;
  renderCategories();
  renderMenu();
}

function renderMenu() {
  const list = document.getElementById('menuList');
  const items = state.selectedCategory === 'all'
    ? state.menuItems
    : state.menuItems.filter(item => item.categoryId === state.selectedCategory);

  if (items.length === 0) {
    list.innerHTML = '<div class="card"><strong>No hay productos disponibles en esta categoría.</strong></div>';
    return;
  }

  list.innerHTML = items.map(item => `
    <article class="menu-card">
      <div class="food-img">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">` : 'A'}</div>
      <div>
        <div class="item-title">${escapeHtml(item.name)}</div>
        <div class="item-meta">${escapeHtml(item.description || 'Sin descripción')}</div>
        <div class="price" style="margin-top:7px;">${money(item.price)}</div>
        ${modifierPickerHtml(item)}
      </div>
      <button class="btn small" onclick="addToCart('${item.id}')">Agregar</button>
    </article>
  `).join('');
}

function addToCart(itemId) {
  const modifierName = selectedMenuModifier(itemId);
  const item = state.menuItems.find(product => product.id === itemId);
  const existing = state.cart.find(line => line.itemId === itemId && (line.modifierName || '') === modifierName);
  if (existing) existing.qty += 1;
  else state.cart.push({
    localId: makeCartLocalId(itemId),
    itemId,
    qty: 1,
    note: '',
    modifierName,
    modifierGroupName: item?.modifierGroupName || 'Opción',
    dinerName: state.splitMode && state.diners.length === 1 ? state.diners[0] : ''
  });
  renderCartBar();
  toast('Producto agregado');
}

function changeQty(key, delta) {
  const line = state.cart.find(l => lineKey(l) === key);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) state.cart = state.cart.filter(l => lineKey(l) !== key);
  else if (Array.isArray(line.splitAssignments)) {
    let remaining = line.qty;
    line.splitAssignments = line.splitAssignments
      .map(part => {
        const qty = Math.min(remaining, Number(part.qty || 0));
        remaining -= qty;
        return { ...part, qty };
      })
      .filter(part => part.qty > 0);
  }
  renderCartBar();
  renderCartLines();
}

function cartTotal() {
  return state.cart.reduce((sum, line) => {
    const item = state.menuItems.find(i => i.id === line.itemId);
    return sum + ((item?.price || 0) * line.qty);
  }, 0);
}

function renderCartBar() {
  const bar = document.getElementById('cartBar');
  const count = state.cart.reduce((sum, line) => sum + line.qty, 0);
  document.getElementById('cartCount').textContent = `${count} producto${count === 1 ? '' : 's'}`;
  document.getElementById('cartTotal').textContent = money(cartTotal());
  bar.classList.toggle('active', count > 0);
}

function openCart() {
  renderCartLines();
  document.getElementById('customerName').value = state.customer?.name || '';
  document.getElementById('customerPhone').value = state.customer?.phone || '';
  document.getElementById('orderOptIn').checked = state.customer?.optInPromos !== false;
  const split = document.getElementById('orderSplitMode');
  const dinersInput = document.getElementById('orderDiners');
  if (split) split.checked = state.splitMode;
  if (dinersInput) dinersInput.value = dinersText();
  toggleOrderSplitMode();
  document.getElementById('modalBackdrop').classList.add('active');
}

function closeCart() {
  document.getElementById('modalBackdrop').classList.remove('active');
}

function renderCartLines() {
  const el = document.getElementById('cartLines');
  if (state.cart.length === 0) {
    el.innerHTML = '<div class="item"><div>Tu pedido está vacío.</div></div>';
    return;
  }
  el.innerHTML = state.cart.map(line => {
    const item = state.menuItems.find(i => i.id === line.itemId);
    if (!item) return '';
    const assigned = splitAssignedQty(line);
    const remaining = Math.max(0, Number(line.qty || 0) - assigned);
    const key = lineKey(line);
    const splitUnitHtml = state.splitMode && line.qty > 1 && state.diners.length ? `
      <div class="split-unit-box">
        <div class="item-meta"><strong>Dividir unidades</strong> · asignadas ${assigned}/${line.qty}${remaining ? ` · sin asignar ${remaining}` : ''}</div>
        <div class="split-unit-grid">
          ${state.diners.map(name => `
            <label>${escapeHtml(name)}
              <input class="input" type="number" min="0" max="${line.qty}" value="${splitQtyFor(line, name)}" onchange="setCartSplitQty('${escapeHtml(key)}', '${escapeHtml(name)}', this.value)" />
            </label>
          `).join('')}
        </div>
        <p class="muted mini-copy">Ejemplo: si son 3 limonadas, puedes poner 1 Eduardo, 1 Joel y 1 Ambrosio.</p>
      </div>
    ` : '';
    return `
      <div class="item cart-line-card">
        <div>
          <div class="item-title">${escapeHtml(item.name)}</div>
          <div class="item-meta">${money(item.price)} c/u${line.modifierName ? ` · ${escapeHtml(line.modifierGroupName || 'Opción')}: ${escapeHtml(line.modifierName)}` : ''}</div>
        </div>
        <div class="inline-actions">
          <button class="btn ghost small" onclick="changeQty('${escapeHtml(key)}', -1)">-</button>
          <strong>${line.qty}</strong>
          <button class="btn ghost small" onclick="changeQty('${escapeHtml(key)}', 1)">+</button>
        </div>
        ${state.splitMode ? `<label class="cart-diner-select">Cuenta principal / sobrante
          <select onchange="setCartDiner('${escapeHtml(key)}', this.value)">${dinerOptions(line.dinerName || '')}</select>
        </label>${splitUnitHtml}` : ''}
      </div>
    `;
  }).join('') + `<div class="item"><strong>Total</strong><strong>${money(cartTotal())}</strong></div>`;
}

async function sendAlert(type, note = '') {
  const labels = {
    waiter: 'Mesero solicitado',
    bill: 'Cuenta solicitada',
    charge: 'Carga/powerbank solicitado',
    quick: 'Solicitud enviada al staff',
    takeout: 'Solicitud para llevar enviada',
    repeat: 'Repetición enviada',
    feedback: 'Calificación enviada',
    other: 'Solicitud enviada'
  };
  try {
    await api(`/api/public/table/${state.tableId}/alert`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        note,
        customerName: state.customer?.name || '',
        customerPhone: state.customer?.phone || '',
        optInPromos: state.customer?.optInPromos !== false
      })
    });
    toast(labels[type] || labels.other);
  } catch (error) {
    toast(error.message);
  }
}


async function openSmartBill() {
  try {
    document.getElementById('billBackdrop').classList.add('active');
    document.getElementById('billSummaryBox').innerHTML = '<div class="item"><div>Cargando cuenta estimada...</div></div>';
    document.getElementById('billCustomerName').value = state.customer?.name || '';
    document.getElementById('billCustomerPhone').value = state.customer?.phone || '';
    document.getElementById('billOptIn').checked = state.customer?.optInPromos !== false;
    setBillWhenMinutes(0);
    const split = document.getElementById('billSplitMode');
    const dinersInput = document.getElementById('billDiners');
    if (split) split.checked = state.splitMode;
    if (dinersInput) dinersInput.value = dinersText();
    toggleBillSplitMode();
    document.getElementById('billPaymentMethod').value = 'card';
    document.getElementById('billBringTerminal').checked = true;
    document.getElementById('billNote').value = '';
    state.billTipPercent = 10;
    document.getElementById('billCustomTip').value = '';
    const data = await api(`/api/public/table/${state.tableId}/bill-summary?ts=${Date.now()}`);
    state.billSummary = data;
    renderBillSummary();
  } catch (error) {
    toast(error.message);
  }
}

function closeSmartBill() {
  document.getElementById('billBackdrop').classList.remove('active');
}

function selectBillTip(percent) {
  state.billTipPercent = Number(percent || 0);
  document.getElementById('billCustomTip').value = '';
  renderBillSummary();
}

function billSubtotal() {
  return Number(state.billSummary?.subtotal || 0);
}

function billTipAmount() {
  const custom = document.getElementById('billCustomTip')?.value;
  if (custom !== undefined && custom !== '') return Math.max(0, Number(custom || 0));
  return billSubtotal() * (Number(state.billTipPercent || 0) / 100);
}

function renderBillSummary() {
  const box = document.getElementById('billSummaryBox');
  const summary = state.billSummary;
  const subtotal = billSubtotal();
  const tip = billTipAmount();
  const total = subtotal + tip;
  const lines = summary?.lines || [];

  if (!summary) {
    box.innerHTML = '<div class="item"><div>No se pudo cargar la cuenta.</div></div>';
    return;
  }

  const lineHtml = lines.length
    ? lines.map(line => `
      <div class="item compact-row">
        <div>
          <div class="item-title">${escapeHtml(line.qty)} × ${escapeHtml(line.name)}${line.modifierName ? ` · ${escapeHtml(line.modifierName)}` : ''}</div>
          <div class="item-meta">Comanda #${escapeHtml(line.commandNumber || '-')} ${line.note ? `· Nota: ${escapeHtml(line.note)}` : ''}</div>
        </div>
        <strong>${money(line.subtotal)}</strong>
      </div>
    `).join('')
    : `<div class="item"><div>Aún no hay pedidos registrados en AUREA para esta mesa. Puedes pedir la cuenta de todos modos y el mesero confirmará el total.</div></div>`;

  const splitHtml = state.splitMode && summary.splitAccounts?.length
    ? `<div class="split-summary"><h3>Cuentas separadas</h3>${summary.splitAccounts.map(account => `
        <div class="split-account">
          <div class="split-account-head"><strong>${escapeHtml(account.name)}</strong><strong>${money(account.subtotal)}</strong></div>
          ${(account.lines || []).map(line => `<div class="item-meta">${escapeHtml(line.qty)} × ${escapeHtml(line.name)}${line.modifierName ? ` · ${escapeHtml(line.modifierName)}` : ''} · ${money(line.subtotal)}</div>`).join('')}
        </div>
      `).join('')}</div>`
    : '';

  box.innerHTML = `
    <div class="smart-bill-card">
      <div class="bill-disclaimer">${escapeHtml(summary.disclaimer || 'Cuenta estimada. Un mesero confirmará el total final.')}</div>
      <div class="list" style="margin-top:12px;">${lineHtml}</div>
      ${splitHtml}
      <div class="bill-totals">
        <div><span>Subtotal registrado</span><strong>${money(subtotal)}</strong></div>
        <div><span>Propina estimada</span><strong>${money(tip)}</strong></div>
        <div class="bill-grand"><span>Total estimado</span><strong>${money(total)}</strong></div>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-tip-button]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.tipButton) === Number(state.billTipPercent) && !document.getElementById('billCustomTip').value);
  });
}

function onPaymentMethodChange() {
  const method = document.getElementById('billPaymentMethod').value;
  if (method === 'card') document.getElementById('billBringTerminal').checked = true;
}

function setBillWhenChoice(input) {
  document.querySelectorAll('#billWhenOptions .choice-check').forEach(label => {
    label.classList.toggle('active', label.contains(input));
  });
}

function setBillWhenMinutes(minutes) {
  const input = document.querySelector(`input[name="billWhen"][value="${minutes}"]`) || document.querySelector('input[name="billWhen"][value="0"]');
  if (!input) return;
  input.checked = true;
  setBillWhenChoice(input);
}

function getBillWhenMinutes() {
  const selected = document.querySelector('input[name="billWhen"]:checked');
  return Number(selected?.value || 0);
}

async function submitBillRequest() {
  try {
    const customerName = document.getElementById('billCustomerName').value.trim();
    const customerPhone = document.getElementById('billCustomerPhone').value.replace(/\D/g, '');
    const customTip = document.getElementById('billCustomTip').value;
    const payload = {
      customerName,
      customerPhone,
      optInPromos: document.getElementById('billOptIn').checked,
      tipPercent: customTip === '' ? state.billTipPercent : 0,
      customTipAmount: customTip,
      paymentMethod: document.getElementById('billPaymentMethod').value,
      bringTerminal: document.getElementById('billBringTerminal').checked,
      whenMinutes: getBillWhenMinutes(),
      splitMode: document.getElementById('billSplitMode').checked,
      note: document.getElementById('billNote').value,
      diners: state.diners
    };
    if (payload.splitMode) await saveDinersRemote();
    const response = await api(`/api/public/table/${state.tableId}/bill-request`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (customerPhone) saveCustomerToStorage({ name: customerName, phone: customerPhone, optInPromos: payload.optInPromos });
    closeSmartBill();
    toast(response.message || 'Cuenta solicitada');
  } catch (error) {
    toast(error.message);
  }
}

function statusLabel(status) {
  const labels = {
    new: 'Enviado, pendiente de confirmación',
    confirmed: 'Confirmado',
    in_progress: 'En preparación',
    ready: 'Listo para entregar',
    delivered: 'Entregado',
    cancelled: 'Cancelado'
  };
  return labels[status] || status;
}

function renderOrderStatus(order) {
  const box = document.getElementById('orderStatusBox');
  const pending = order.status === 'new';
  const confirmed = ['confirmed', 'in_progress', 'ready', 'delivered'].includes(order.status);
  box.innerHTML = `
    <div class="card" style="box-shadow:none;">
      <div class="pill">Comanda #${escapeHtml(order.commandNumber || '-')}</div>
      <h2 style="margin:10px 0 8px;">${pending ? 'Tu pedido fue enviado. Un mesero lo confirmará.' : statusLabel(order.status)}</h2>
      <p class="muted" style="line-height:1.6; margin-top:0;">
        ${pending ? 'Tiempo estimado pendiente de confirmación.' : ''}
        ${confirmed && order.estimatedTime ? `Tiempo estimado: <strong>${escapeHtml(order.estimatedTime)}</strong>.` : ''}
        ${order.status === 'cancelled' ? 'Consulta con el mesero para más información.' : ''}
      </p>
      <div class="list" style="margin-top:12px;">
        ${order.items.map(item => `<div class="item"><span>${item.qty} × ${escapeHtml(item.name)}${item.modifierName ? ` · ${escapeHtml(item.modifierName)}` : ''}${item.dinerName ? ` · ${escapeHtml(item.dinerName)}` : ''}</span><strong>${money(item.subtotal)}</strong></div>`).join('')}
      </div>
      <div class="item" style="margin-top:12px;"><strong>Total</strong><strong>${money(order.total)}</strong></div>
    </div>
  `;
}

async function pollLastOrder() {
  if (!state.lastOrder?.id) return;
  try {
    const data = await api(`/api/public/orders/${state.lastOrder.id}`);
    state.lastOrder = data.order;
    localStorage.setItem(lastOrderKey(), JSON.stringify(data.order));
    renderOrderStatus(data.order);
    if (['delivered', 'cancelled'].includes(data.order.status) && state.orderPollTimer) {
      clearInterval(state.orderPollTimer);
      state.orderPollTimer = null;
    }
  } catch (error) {
    console.warn(error);
  }
}

function openOrderStatus(order) {
  state.lastOrder = order;
  localStorage.setItem(lastOrderKey(), JSON.stringify(order));
  renderOrderStatus(order);
  document.getElementById('orderStatusBackdrop').classList.add('active');
  if (state.orderPollTimer) clearInterval(state.orderPollTimer);
  state.orderPollTimer = setInterval(pollLastOrder, 4000);
}

function closeOrderStatus() {
  document.getElementById('orderStatusBackdrop').classList.remove('active');
}

function resumeLastOrder() {
  try {
    const cached = JSON.parse(localStorage.getItem(lastOrderKey()) || 'null');
    if (cached && !['delivered', 'cancelled'].includes(cached.status)) {
      state.lastOrder = cached;
      if (!state.orderPollTimer) state.orderPollTimer = setInterval(pollLastOrder, 5000);
    }
  } catch {}
}

async function submitOrder() {
  if (state.cart.length === 0) return toast('Agrega productos primero');
  const customerName = document.getElementById('customerName').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.replace(/\D/g, '');
  const optInPromos = document.getElementById('orderOptIn').checked;

  try {
    if (state.splitMode) {
      state.diners = parseDiners(document.getElementById('orderDiners')?.value || dinersText());
      saveDinersLocal();
      await saveDinersRemote();
    }
    const response = await api(`/api/public/table/${state.tableId}/order`, {
      method: 'POST',
      body: JSON.stringify({
        items: state.cart,
        diners: state.diners,
        customerName,
        customerPhone,
        optInPromos,
        note: document.getElementById('orderNote').value
      })
    });

    if (customerPhone) saveCustomerToStorage({ name: customerName, phone: customerPhone, optInPromos });
    state.cart = [];
    renderCartBar();
    closeCart();
    openOrderStatus(response.order);
    toast('Tu pedido fue enviado. Un mesero lo confirmará.');
  } catch (error) {
    toast(error.message);
  }
}


const quickRequestOptions = [
  'Servilletas',
  'Cubiertos',
  'Salsa',
  'Limón',
  'Hielo',
  'Plato extra',
  'Bolsa para llevar',
  'Cargador / powerbank',
  'Limpieza de mesa'
];

function openQuickRequest() {
  const wrap = document.getElementById('quickRequestOptions');
  wrap.innerHTML = quickRequestOptions.map(option => `
    <label class="service-chip">
      <input type="checkbox" value="${escapeHtml(option)}" />
      <span>${escapeHtml(option)}</span>
    </label>
  `).join('');
  document.getElementById('quickRequestNote').value = '';
  document.getElementById('quickRequestBackdrop').classList.add('active');
}

function closeQuickRequest() {
  document.getElementById('quickRequestBackdrop').classList.remove('active');
}

async function submitQuickRequest() {
  const selected = Array.from(document.querySelectorAll('#quickRequestOptions input:checked')).map(input => input.value);
  const note = document.getElementById('quickRequestNote').value.trim();
  if (!selected.length && !note) return toast('Elige una opción o escribe qué necesitas');
  const fullNote = [selected.join(', '), note].filter(Boolean).join(' · ');
  await sendAlert(selected.includes('Cargador / powerbank') && selected.length === 1 ? 'charge' : 'quick', fullNote);
  closeQuickRequest();
}

function setChoiceActive(input) {
  const groupName = input.name;
  document.querySelectorAll(`input[name="${groupName}"]`).forEach(item => {
    const label = item.closest('.choice-check');
    if (label) label.classList.toggle('active', item.checked);
  });
}

function closeRepeatOrder() {
  document.getElementById('repeatBackdrop').classList.remove('active');
}

async function openRepeatOrder() {
  state.repeatSelection = {};
  document.getElementById('repeatBackdrop').classList.add('active');
  document.getElementById('repeatItems').innerHTML = '<div class="item"><div>Buscando productos anteriores...</div></div>';
  document.getElementById('repeatNote').value = '';
  try {
    const data = await api(`/api/public/table/${state.tableId}/bill-summary?repeat=${Date.now()}`);
    const lines = data.lines || [];
    const byItem = new Map();
    lines.forEach(line => {
      if (!line.itemId) return;
      const existing = byItem.get(line.itemId) || { itemId: line.itemId, name: line.name, price: line.price, qty: 0 };
      existing.qty += Number(line.qty || 0);
      byItem.set(line.itemId, existing);
    });
    const items = Array.from(byItem.values());
    if (!items.length) {
      document.getElementById('repeatItems').innerHTML = '<div class="item"><div>Aún no hay productos anteriores para repetir. Puedes pedir desde el menú.</div></div>';
      return;
    }
    document.getElementById('repeatItems').innerHTML = items.map(item => `
      <div class="item">
        <div class="item-main">
          <div class="item-title">${escapeHtml(item.name)}</div>
          <div class="item-meta">Pedido antes: ${escapeHtml(item.qty)} · ${money(item.price)} c/u</div>
        </div>
        <div class="inline-actions end">
          <button class="btn ghost small" onclick="changeRepeatQty('${escapeHtml(item.itemId)}', -1)">-</button>
          <strong id="repeatQty-${escapeHtml(item.itemId)}">0</strong>
          <button class="btn secondary small" onclick="changeRepeatQty('${escapeHtml(item.itemId)}', 1)">+</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    document.getElementById('repeatItems').innerHTML = `<div class="item"><div>${escapeHtml(error.message)}</div></div>`;
  }
}

function changeRepeatQty(itemId, delta) {
  const next = Math.max(0, Math.min(20, Number(state.repeatSelection[itemId] || 0) + delta));
  state.repeatSelection[itemId] = next;
  const qtyEl = document.getElementById(`repeatQty-${itemId}`);
  if (qtyEl) qtyEl.textContent = next;
}

async function submitRepeatOrder() {
  const items = Object.entries(state.repeatSelection)
    .map(([itemId, qty]) => ({ itemId, qty, note: '', dinerName: '' }))
    .filter(item => item.qty > 0);
  if (!items.length) return toast('Elige al menos un producto para repetir');
  try {
    const response = await api(`/api/public/table/${state.tableId}/order`, {
      method: 'POST',
      body: JSON.stringify({
        items,
        customerName: state.customer?.name || '',
        customerPhone: state.customer?.phone || '',
        optInPromos: state.customer?.optInPromos !== false,
        note: document.getElementById('repeatNote').value || 'Repetición solicitada desde AUREA'
      })
    });
    closeRepeatOrder();
    openOrderStatus(response.order);
    toast('Repetición enviada. Un mesero la confirmará.');
  } catch (error) {
    toast(error.message);
  }
}

function openTakeoutRequest() {
  document.getElementById('takeoutNote').value = '';
  document.querySelectorAll('input[name="takeoutType"]').forEach((input, index) => {
    input.checked = index === 0;
    const label = input.closest('.choice-check');
    if (label) label.classList.toggle('active', input.checked);
  });
  document.getElementById('takeoutBackdrop').classList.add('active');
}

function closeTakeoutRequest() {
  document.getElementById('takeoutBackdrop').classList.remove('active');
}

async function submitTakeoutRequest() {
  const selected = document.querySelector('input[name="takeoutType"]:checked')?.value || 'Para llevar';
  const note = document.getElementById('takeoutNote').value.trim();
  await sendAlert('takeout', [selected, note].filter(Boolean).join(' · '));
  closeTakeoutRequest();
}

function openFeedback() {
  state.feedbackRating = 5;
  selectRating(5);
  document.getElementById('feedbackNote').value = '';
  document.getElementById('feedbackBackdrop').classList.add('active');
}

function closeFeedback() {
  document.getElementById('feedbackBackdrop').classList.remove('active');
}

function selectRating(rating) {
  state.feedbackRating = Number(rating || 5);
  document.querySelectorAll('.rating-btn').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.rating) === state.feedbackRating);
  });
}

async function submitFeedback() {
  try {
    const response = await api(`/api/public/table/${state.tableId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({
        rating: state.feedbackRating,
        note: document.getElementById('feedbackNote').value,
        customerName: state.customer?.name || '',
        customerPhone: state.customer?.phone || '',
        optInPromos: state.customer?.optInPromos !== false
      })
    });
    closeFeedback();
    toast(response.message || 'Gracias por calificar');
  } catch (error) {
    toast(error.message);
  }
}

load();
