(function () {
  var lastAction = '';
  var lastActionAt = 0;
  var visibleTimer = null;
  var legacyDb = null;
  var legacyDiscountTableId = '';
  var legacyPaymentTableId = '';
  var legacyComplimentaryTableId = '';
  var legacyPaymentTotal = 0;
  var legacyPaymentTotalKnown = false;

  function log(message, detail) {
    var entry = {
      at: new Date().toISOString(),
      message: message,
      detail: detail || ''
    };
    try {
      if (window.console && console.log) console.log('[AUREA legacy]', message, detail || '');
      var raw = window.localStorage ? localStorage.getItem('aurea_legacy_logs') : '';
      var list = raw ? JSON.parse(raw) : [];
      list.push(entry);
      while (list.length > 30) list.shift();
      if (window.localStorage) localStorage.setItem('aurea_legacy_logs', JSON.stringify(list));
    } catch (error) {
      if (window.console && console.log) console.log('[AUREA legacy log failed]', error && error.message ? error.message : error);
    }
  }

  function visibleLog(message, detail) {
    log(message, detail || '');
    try {
      if (window.toast) window.toast(message);
      var box = document.getElementById('aureaLegacyLogBox');
      if (!box) {
        box = document.createElement('div');
        box.id = 'aureaLegacyLogBox';
        box.style.position = 'fixed';
        box.style.left = '12px';
        box.style.bottom = '12px';
        box.style.zIndex = '99999';
        box.style.maxWidth = '86%';
        box.style.padding = '10px 12px';
        box.style.borderRadius = '8px';
        box.style.background = '#111';
        box.style.border = '1px solid #c9a44c';
        box.style.color = '#fff';
        box.style.fontSize = '14px';
        box.style.boxShadow = '0 8px 24px rgba(0,0,0,.35)';
        document.body.appendChild(box);
      }
      box.innerHTML = String(message);
      box.style.display = 'block';
      if (visibleTimer) window.clearTimeout(visibleTimer);
      visibleTimer = window.setTimeout(function () {
        box.style.display = 'none';
      }, 3200);
    } catch (error) {
      try {
        if (window.alert) window.alert(message);
      } catch (ignored) {}
    }
  }

  function actionLabel(action) {
    if (action === 'open-payment' || action === 'submit-payment') return 'pago';
    if (action === 'open-discount' || action === 'submit-discount') return 'descuento';
    if (action === 'open-complimentary' || action === 'submit-complimentary') return 'cortesia';
    if (action === 'daily-close') return 'corte';
    return 'accion';
  }

  function requestLabel(input) {
    var url = '';
    if (typeof input === 'string') url = input;
    else if (input && input.url) url = input.url;
    if (url.indexOf('/api/admin/tables/') !== -1 && url.indexOf('/payment') !== -1) {
      return lastAction === 'submit-discount' ? 'descuento' : 'pago';
    }
    if (url.indexOf('/api/admin/tables/') !== -1 && url.indexOf('/complimentary-item') !== -1) return 'cortesia';
    if (url.indexOf('/api/admin/daily-close') !== -1) return 'corte';
    return '';
  }

  function responseFromXhr(xhr) {
    return {
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      statusText: xhr.statusText || '',
      text: function () {
        return Promise.resolve(xhr.responseText || '');
      },
      json: function () {
        return new Promise(function (resolve, reject) {
          try {
            resolve(JSON.parse(xhr.responseText || '{}'));
          } catch (error) {
            reject(error);
          }
        });
      }
    };
  }

  function addClass(el, className) {
    if (!el) return;
    if ((' ' + el.className + ' ').indexOf(' ' + className + ' ') === -1) {
      el.className = el.className ? el.className + ' ' + className : className;
    }
  }

  function removeClass(el, className) {
    if (!el) return;
    el.className = (' ' + el.className + ' ').replace(' ' + className + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function toNumber(value) {
    var parsed = Number(String(value || 0).replace(',', '.'));
    return isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    var amount = Math.round(toNumber(value) * 100) / 100;
    return '$' + amount.toFixed(2);
  }

  function setText(id, value) {
    var el = byId(id);
    if (el) el.textContent = value;
  }

  function setValue(id, value) {
    var el = byId(id);
    if (el) el.value = value;
  }

  function setChecked(id, value) {
    var el = byId(id);
    if (el) el.checked = Boolean(value);
  }

  function showModal(id) {
    addClass(byId(id), 'active');
  }

  function hideModal(id) {
    removeClass(byId(id), 'active');
  }

  function xhrJson(method, url, payload, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      xhr.timeout = 6500;
    } catch (ignored) {}
    xhr.onreadystatechange = function () {
      var data;
      if (xhr.readyState !== 4) return;
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch (error) {
        data = { ok: false, message: xhr.responseText || 'Respuesta invalida' };
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.ok !== false) {
        onSuccess(data);
      } else {
        onError(new Error(data.message || ('Error ' + xhr.status)));
      }
    };
    xhr.onerror = function () {
      onError(new Error('Error de red'));
    };
    xhr.ontimeout = function () {
      onError(new Error('Tiempo agotado'));
    };
    xhr.send(payload ? JSON.stringify(payload) : null);
  }

  function loadAdminData(callback, onError) {
    if (legacyDb) {
      callback(legacyDb);
      return;
    }
    visibleLog('cargando datos admin');
    xhrJson('GET', '/api/admin/legacy-data?ts=' + new Date().getTime(), null, function (data) {
      legacyDb = data;
      callback(legacyDb);
    }, function (error) {
      if (onError) onError(error);
      else visibleLog('error cargando datos: ' + error.message);
    });
  }

  function refreshAdminData(callback, onError) {
    legacyDb = null;
    loadAdminData(callback || function () {}, onError);
  }

  function emptyTotals() {
    return {
      table: null,
      session: null,
      payment: null,
      lines: [],
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      total: 0
    };
  }

  function safeBillTotalsForTable(tableId) {
    if (!legacyDb) return emptyTotals();
    try {
      return billTotalsForTable(legacyDb, tableId) || emptyTotals();
    } catch (error) {
      log('totals-error', error && error.message ? error.message : String(error));
      return emptyTotals();
    }
  }

  function parentWithClass(node, className) {
    while (node && node !== document) {
      if (node.className && (' ' + node.className + ' ').indexOf(' ' + className + ' ') !== -1) return node;
      node = node.parentNode;
    }
    return null;
  }

  function tableLabelFromButton(button, fallback) {
    var card = parentWithClass(button, 'item');
    var title = null;
    if (card && card.getElementsByClassName) {
      title = card.getElementsByClassName('item-title')[0];
    }
    return (title && (title.innerText || title.textContent)) || fallback || 'Mesa';
  }

  function tableById(db, tableId) {
    var tables = db && db.tables ? db.tables : [];
    for (var i = 0; i < tables.length; i += 1) {
      if (tables[i].id === tableId) return tables[i];
    }
    return null;
  }

  function activeSessionForTable(db, tableId) {
    var sessions = db && db.tableSessions ? db.tableSessions : [];
    var found = null;
    for (var i = 0; i < sessions.length; i += 1) {
      if (sessions[i].tableId === tableId && sessions[i].status === 'active') {
        if (!found || String(sessions[i].createdAt || '') > String(found.createdAt || '')) found = sessions[i];
      }
    }
    return found;
  }

  function activePaymentForTable(db, tableId, session) {
    var payments = db && db.payments ? db.payments : [];
    for (var i = 0; i < payments.length; i += 1) {
      if (session && payments[i].id && payments[i].id === session.paymentId) return payments[i];
    }
    for (var j = 0; j < payments.length; j += 1) {
      if (session && payments[j].sessionId === session.id && payments[j].status !== 'cancelled') return payments[j];
    }
    for (var k = 0; k < payments.length; k += 1) {
      if (payments[k].tableId === tableId && payments[k].status !== 'cancelled') return payments[k];
    }
    return null;
  }

  function billTotalsForTable(db, tableId) {
    var session = activeSessionForTable(db, tableId);
    var orders = db && db.orders ? db.orders : [];
    var lines = [];
    var subtotal = 0;
    var payment = activePaymentForTable(db, tableId, session);
    var discountPercent = payment ? toNumber(payment.discountPercent) : 0;
    var table = tableById(db, tableId);
    for (var i = 0; i < orders.length; i += 1) {
      var order = orders[i];
      if (order.tableId !== tableId) continue;
      if (order.status === 'cancelled' || order.closedWithTable === true) continue;
      if (session && order.sessionId && order.sessionId !== session.id) continue;
      var items = order.items || [];
      for (var j = 0; j < items.length; j += 1) {
        var item = items[j];
        var qty = toNumber(item.qty || item.quantity || 0);
        var price = toNumber(item.price || 0);
        var lineSubtotal = toNumber(item.subtotal || (qty * price));
        lines.push(item);
        subtotal += lineSubtotal;
      }
    }
    var discountAmount = Math.min(subtotal, subtotal * (discountPercent / 100));
    var total = Math.max(0, subtotal - discountAmount);
    return {
      table: table,
      session: session,
      payment: payment,
      lines: lines,
      subtotal: subtotal,
      discountPercent: discountPercent,
      discountAmount: discountAmount,
      total: total
    };
  }

  function renderDiscountPreviewLegacy() {
    var totals = safeBillTotalsForTable(legacyDiscountTableId);
    var hasTotals = legacyDb && totals.subtotal > 0;
    var percent = toNumber(byId('adminDiscountPercent') && byId('adminDiscountPercent').value);
    var valid = percent >= 0 && percent <= 100;
    var amount = valid ? Math.min(totals.subtotal, totals.subtotal * (percent / 100)) : 0;
    var total = Math.max(0, totals.subtotal - amount);
    var full = valid && percent >= 100;
    var reason = byId('adminDiscountReason') ? byId('adminDiscountReason').value : '';
    var reasonRow = byId('adminDiscountReasonRow');
    var submit = byId('adminDiscountSubmitBtn');
    var preview = byId('adminDiscountPreview');
    if (reasonRow) reasonRow.style.display = full ? 'block' : 'none';
    if (submit) submit.disabled = !valid || (full && !reason);
    if (preview) {
      preview.innerHTML = '<div class="item"><div class="item-main">'
        + '<div class="item-title">Vista previa</div>'
        + (hasTotals
          ? '<div class="item-meta">Subtotal: <strong>' + money(totals.subtotal) + '</strong></div>'
            + '<div class="item-meta">Descuento ' + (valid ? percent : 0) + '%: <strong>-' + money(amount) + '</strong></div>'
            + '<div class="item-meta">Total final: <strong>' + money(total) + '</strong></div>'
          : '<div class="item-meta">El servidor calculara subtotal, descuento y total al aplicar.</div>')
        + (!valid ? '<div class="item-meta" style="color:#ffb4b4;">Usa un porcentaje entre 0 y 100.</div>' : '')
        + (full && !reason ? '<div class="item-meta" style="color:#ffb4b4;">Motivo obligatorio para descuento total.</div>' : '')
        + '</div></div>';
    }
  }

  function openDiscountLegacy(tableId, button) {
    visibleLog('abriendo descuento legacy');
    legacyDiscountTableId = tableId;
    setText('adminDiscountTableName', tableLabelFromButton(button, 'Mesa') + ' - Caja/Admin');
    setValue('adminDiscountPercent', '0');
    setValue('adminDiscountReason', '');
    renderDiscountPreviewLegacy();
    showModal('adminDiscountModal');
    refreshAdminData(function (db) {
      var totals = billTotalsForTable(db, tableId);
      setText('adminDiscountTableName', ((totals.session && totals.session.tableName) || (totals.table && totals.table.name) || 'Mesa') + ' - Caja/Admin');
      if (byId('adminDiscountPercent') && (byId('adminDiscountPercent').value === '' || byId('adminDiscountPercent').value === '0')) {
        setValue('adminDiscountPercent', String(totals.discountPercent || 0));
      }
      setValue('adminDiscountReason', totals.payment && totals.payment.discountReason ? totals.payment.discountReason : '');
      renderDiscountPreviewLegacy();
    }, function (error) {
      visibleLog('form descuento listo; datos no cargaron: ' + error.message);
    });
  }

  function submitDiscountLegacy() {
    var percent = toNumber(byId('adminDiscountPercent') && byId('adminDiscountPercent').value);
    var full = percent >= 100;
    var reason = byId('adminDiscountReason') ? byId('adminDiscountReason').value : '';
    var payload;
    if (percent < 0 || percent > 100) {
      visibleLog('Descuento invalido');
      return;
    }
    if (full && !reason) {
      visibleLog('Motivo obligatorio para descuento total');
      return;
    }
    visibleLog('enviando request descuento');
    payload = {
      method: full ? 'courtesy' : 'pending',
      authorize: false,
      closeTable: false,
      discountPercent: percent,
      discountReason: reason
    };
    if (full) payload.amountPaid = 0;
    xhrJson('POST', '/api/admin/tables/' + legacyDiscountTableId + '/payment', payload, function () {
      visibleLog('respuesta backend descuento OK');
      hideModal('adminDiscountModal');
      refreshAdminData(function () {
        if (window.loadData) window.loadData(false);
      });
    }, function (error) {
      visibleLog('respuesta backend descuento ERROR: ' + error.message);
    });
  }

  function openComplimentaryLegacy(tableId, button) {
    visibleLog('abriendo cortesia legacy');
    legacyComplimentaryTableId = tableId;
    setText('adminCompTableName', tableLabelFromButton(button, 'Mesa') + ' - Caja/Admin');
    setValue('adminCompQty', '1');
    setValue('adminCompReason', '');
    var loadingSelect = byId('adminCompItemSelect');
    if (loadingSelect) {
      loadingSelect.innerHTML = '<option value="">Cargando productos...</option>';
      loadingSelect.disabled = true;
    }
    if (byId('adminComplimentarySubmitBtn')) byId('adminComplimentarySubmitBtn').disabled = true;
    showModal('adminComplimentaryModal');
    refreshAdminData(function (db) {
      var totals = billTotalsForTable(db, tableId);
      var products = [];
      var items = db && db.menuItems ? db.menuItems : [];
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].available !== false) products.push(items[i]);
      }
      if (!products.length) {
        visibleLog('No hay productos disponibles');
        return;
      }
      setText('adminCompTableName', ((totals.session && totals.session.tableName) || (totals.table && totals.table.name) || 'Mesa') + ' - Caja/Admin');
      var select = byId('adminCompItemSelect');
      if (select) {
        select.innerHTML = '';
        for (var j = 0; j < products.length; j += 1) {
          var option = document.createElement('option');
          option.value = products[j].id;
          option.text = (products[j].name || 'Producto') + ' - ' + money(products[j].price || 0);
          select.appendChild(option);
        }
        select.disabled = false;
      }
      if (byId('adminComplimentarySubmitBtn')) byId('adminComplimentarySubmitBtn').disabled = false;
      setValue('adminCompQty', '1');
      setValue('adminCompReason', '');
    }, function (error) {
      var select = byId('adminCompItemSelect');
      if (select) {
        select.innerHTML = '<option value="">No se pudieron cargar productos</option>';
        select.disabled = true;
      }
      visibleLog('error cargando productos: ' + error.message);
    });
  }

  function submitComplimentaryLegacy() {
    var itemId = byId('adminCompItemSelect') ? byId('adminCompItemSelect').value : '';
    var qty = Math.max(1, Math.min(20, Math.floor(toNumber(byId('adminCompQty') && byId('adminCompQty').value) || 1)));
    var reason = byId('adminCompReason') ? byId('adminCompReason').value : '';
    if (!itemId) {
      visibleLog('Selecciona un producto');
      return;
    }
    visibleLog('enviando request cortesia');
    xhrJson('POST', '/api/admin/tables/' + legacyComplimentaryTableId + '/complimentary-item', {
      itemId: itemId,
      qty: qty,
      reason: reason,
      idempotency_key: 'comp-' + legacyComplimentaryTableId + '-' + itemId + '-' + new Date().getTime()
    }, function () {
      visibleLog('respuesta backend cortesia OK');
      hideModal('adminComplimentaryModal');
      refreshAdminData(function () {
        if (window.loadData) window.loadData(false);
      });
    }, function (error) {
      visibleLog('respuesta backend cortesia ERROR: ' + error.message);
    });
  }

  function renderPaymentPreviewLegacy() {
    var methodEl = byId('adminPaymentMethod');
    var receivedEl = byId('adminPaymentReceived');
    var tipEl = byId('adminPaymentTipFromChange');
    var method = methodEl ? methodEl.value : 'cash';
    var received = toNumber(receivedEl && receivedEl.value);
    var total = legacyPaymentTotal;
    if (!legacyPaymentTotalKnown) {
      var submitUnknown = byId('adminPaymentSubmitBtn');
      var tipRowUnknown = byId('adminPaymentTipRow');
      if (tipRowUnknown) tipRowUnknown.style.display = 'none';
      if (receivedEl) receivedEl.disabled = false;
      if (submitUnknown) submitUnknown.disabled = false;
      var previewUnknown = byId('adminPaymentPreview');
      if (previewUnknown) {
        previewUnknown.innerHTML = '<div class="item"><div class="item-main">'
          + '<div class="item-title">Resumen de pago</div>'
          + '<div class="item-meta">Captura el monto recibido. El servidor validara el total real al confirmar.</div>'
          + '<div class="item-meta">Recibido: <strong>' + money(received) + '</strong></div>'
          + '</div></div>';
      }
      return;
    }
    if (total <= 0) {
      method = 'courtesy';
      received = 0;
      if (methodEl) methodEl.value = method;
      if (receivedEl) {
        receivedEl.value = '0';
        receivedEl.disabled = true;
      }
    } else if (receivedEl) {
      receivedEl.disabled = false;
    }
    var diff = Math.max(0, received - total);
    var useTip = tipEl && tipEl.checked && total > 0;
    var tip = useTip ? diff : 0;
    var change = method === 'cash' && !useTip ? diff : 0;
    var insufficient = received + 0.001 < total;
    var invalidOverpay = method !== 'cash' && diff > 0 && !useTip;
    var tipRow = byId('adminPaymentTipRow');
    if (tipRow) tipRow.style.display = received > total ? 'flex' : 'none';
    var submit = byId('adminPaymentSubmitBtn');
    if (submit) submit.disabled = insufficient || invalidOverpay;
    var preview = byId('adminPaymentPreview');
    if (preview) {
      preview.innerHTML = '<div class="item"><div class="item-main">'
        + '<div class="item-title">Resumen de pago</div>'
        + '<div class="item-meta">Metodo: ' + method + '</div>'
        + '<div class="item-meta">Total cuenta: <strong>' + money(total) + '</strong></div>'
        + '<div class="item-meta">Recibido: <strong>' + money(received) + '</strong></div>'
        + '<div class="item-meta">Propina: <strong>' + money(tip) + '</strong></div>'
        + '<div class="item-meta">Cambio: <strong>' + money(change) + '</strong></div>'
        + (insufficient ? '<div class="item-meta" style="color:#ffb4b4;">Monto insuficiente.</div>' : '')
        + (invalidOverpay ? '<div class="item-meta" style="color:#ffb4b4;">Captura total exacto o registra propina.</div>' : '')
        + '</div></div>';
    }
  }

  function openPaymentLegacy(tableId, button) {
    visibleLog('abriendo pago legacy');
    legacyPaymentTableId = tableId;
    legacyPaymentTotal = 0;
    legacyPaymentTotalKnown = false;
    setText('adminPaymentTableName', tableLabelFromButton(button, 'Mesa') + ' - Caja/Admin');
    setText('adminPaymentTotal', 'Validando...');
    setValue('adminPaymentMethod', 'cash');
    setValue('adminPaymentReceived', '');
    setChecked('adminPaymentTipFromChange', false);
    setValue('adminPaymentNote', '');
    renderPaymentPreviewLegacy();
    showModal('adminPaymentModal');
    refreshAdminData(function (db) {
      var totals = billTotalsForTable(db, tableId);
      if (!totals.lines.length) {
        visibleLog('No se encontraron productos en datos ligeros; el backend validara');
        return;
      }
      legacyPaymentTotal = totals.total;
      legacyPaymentTotalKnown = true;
      setText('adminPaymentTableName', ((totals.session && totals.session.tableName) || (totals.table && totals.table.name) || 'Mesa') + ' - Caja/Admin');
      setText('adminPaymentTotal', money(totals.total));
      setValue('adminPaymentMethod', totals.total <= 0 ? 'courtesy' : 'cash');
      setValue('adminPaymentReceived', String(totals.total || 0));
      setChecked('adminPaymentTipFromChange', false);
      setValue('adminPaymentNote', '');
      renderPaymentPreviewLegacy();
    }, function (error) {
      setText('adminPaymentTotal', 'Servidor validara');
      visibleLog('form pago listo; datos no cargaron: ' + error.message);
    });
  }

  function submitPaymentLegacy() {
    var method = byId('adminPaymentMethod') ? byId('adminPaymentMethod').value : 'cash';
    var received = toNumber(byId('adminPaymentReceived') && byId('adminPaymentReceived').value);
    var total = legacyPaymentTotal;
    if (legacyPaymentTotalKnown && total <= 0) {
      method = 'courtesy';
      received = 0;
    }
    var useTip = legacyPaymentTotalKnown && byId('adminPaymentTipFromChange') && byId('adminPaymentTipFromChange').checked && total > 0;
    var tipAmount = useTip ? Math.max(0, received - total) : 0;
    if (legacyPaymentTotalKnown && received + 0.001 < total) {
      visibleLog('Monto insuficiente');
      return;
    }
    visibleLog('enviando request pago');
    xhrJson('POST', '/api/admin/tables/' + legacyPaymentTableId + '/payment', {
      method: method,
      amountPaid: received,
      tipAmount: tipAmount,
      closeTable: true,
      note: byId('adminPaymentNote') ? byId('adminPaymentNote').value : ''
    }, function () {
      visibleLog('respuesta backend pago OK');
      hideModal('adminPaymentModal');
      refreshAdminData(function () {
        if (window.loadData) window.loadData(false);
      });
    }, function (error) {
      visibleLog('respuesta backend pago ERROR: ' + error.message);
    });
  }

  function installFetchCompat() {
    if (!window.Promise) {
      visibleLog('WebView legacy: Promise no disponible');
      return;
    }
    if (window.fetch && !window.fetch.__aureaLegacyWrapped) {
      var nativeFetch = window.fetch;
      var wrappedFetch = function (input, init) {
        var label = requestLabel(input);
        if (label) visibleLog('enviando request ' + label);
        return nativeFetch.apply(window, arguments).then(function (response) {
          if (label) visibleLog('respuesta backend ' + label + ' ' + response.status);
          return response;
        }, function (error) {
          if (label) visibleLog('respuesta backend ' + label + ' error');
          throw error;
        });
      };
      wrappedFetch.__aureaLegacyWrapped = true;
      window.fetch = wrappedFetch;
      return;
    }
    if (!window.fetch && window.XMLHttpRequest) {
      window.fetch = function (input, init) {
        return new Promise(function (resolve, reject) {
          var label = requestLabel(input);
          var xhr = new XMLHttpRequest();
          var url = typeof input === 'string' ? input : input.url;
          var method = init && init.method ? init.method : 'GET';
          if (label) visibleLog('enviando request ' + label);
          xhr.open(method, url, true);
          xhr.withCredentials = true;
          var headers = init && init.headers ? init.headers : {};
          if (headers.forEach) {
            headers.forEach(function (value, key) { xhr.setRequestHeader(key, value); });
          } else {
            for (var key in headers) {
              if (Object.prototype.hasOwnProperty.call(headers, key)) xhr.setRequestHeader(key, headers[key]);
            }
          }
          xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (label) visibleLog('respuesta backend ' + label + ' ' + xhr.status);
            resolve(responseFromXhr(xhr));
          };
          xhr.onerror = function () {
            if (label) visibleLog('respuesta backend ' + label + ' error');
            reject(new Error('Network request failed'));
          };
          xhr.send(init && init.body ? init.body : null);
        });
      };
      window.fetch.__aureaLegacyWrapped = true;
      visibleLog('WebView legacy: fetch via XHR activo');
    }
  }

  function closestActionElement(target) {
    var node = target;
    while (node && node !== document) {
      if (node.getAttribute && node.getAttribute('data-legacy-action')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function callAction(action, button) {
    var tableId = button && button.getAttribute ? button.getAttribute('data-table-id') : '';
    var actions = window.AureaAdminActions || {};
    log('action:' + action, tableId || '');
    if (action === 'open-payment') return openPaymentLegacy(tableId, button);
    if (action === 'open-discount') return openDiscountLegacy(tableId, button);
    if (action === 'open-complimentary') return openComplimentaryLegacy(tableId, button);
    if (action === 'submit-payment') return submitPaymentLegacy();
    if (action === 'submit-discount') return submitDiscountLegacy();
    if (action === 'submit-complimentary') return submitComplimentaryLegacy();
    if (action === 'daily-close' && typeof actions.submitDailyClose === 'function') return actions.submitDailyClose();
    if (action === 'open-payment' && typeof window.openAdminPaymentModal === 'function') return window.openAdminPaymentModal(tableId);
    if (action === 'open-discount' && typeof window.applyAdminDiscountForTable === 'function') return window.applyAdminDiscountForTable(tableId);
    if (action === 'open-complimentary' && typeof window.openAdminComplimentaryModal === 'function') return window.openAdminComplimentaryModal(tableId);
    if (action === 'submit-payment' && typeof window.submitAdminPayment === 'function') return window.submitAdminPayment();
    if (action === 'submit-discount' && typeof window.submitAdminDiscount === 'function') return window.submitAdminDiscount();
    if (action === 'submit-complimentary' && typeof window.submitAdminComplimentary === 'function') return window.submitAdminComplimentary();
    if (action === 'daily-close' && typeof window.submitDailyClose === 'function') return window.submitDailyClose();
    log('missing-handler:' + action, tableId || '');
    visibleLog('Accion no disponible en este WebView');
    return null;
  }

  function isSubmitAction(action) {
    return action === 'open-payment'
      || action === 'open-discount'
      || action === 'open-complimentary'
      || action === 'submit-payment'
      || action === 'submit-discount'
      || action === 'submit-complimentary'
      || action === 'daily-close';
  }

  function stopEvent(event) {
    if (event.preventDefault) event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    if (event.stopPropagation) event.stopPropagation();
  }

  function onAction(event) {
    var button = closestActionElement(event.target || event.srcElement);
    if (!button) return;
    var action = button.getAttribute('data-legacy-action');
    var shouldStop = isSubmitAction(action);
    var now = Date.now ? Date.now() : new Date().getTime();
    if (lastAction === action && now - lastActionAt < 650) {
      if (shouldStop) {
        stopEvent(event);
        return false;
      }
      return true;
    }
    lastAction = action;
    lastActionAt = now;
    visibleLog('click ' + actionLabel(action) + ' detectado');
    if (shouldStop) stopEvent(event);
    try {
      callAction(action, button);
    } catch (error) {
      log('action-error:' + action, error && error.stack ? error.stack : String(error));
      visibleLog(error && error.message ? error.message : 'Error en accion legacy');
    }
    return !shouldStop;
  }

  function addLegacyListener(id, eventName, handler) {
    var el = byId(id);
    if (!el) return;
    if (el.addEventListener) el.addEventListener(eventName, handler, false);
    else if (el.attachEvent) el.attachEvent('on' + eventName, handler);
  }

  function bindLegacyInputs() {
    addLegacyListener('adminDiscountPercent', 'input', renderDiscountPreviewLegacy);
    addLegacyListener('adminDiscountPercent', 'change', renderDiscountPreviewLegacy);
    addLegacyListener('adminDiscountReason', 'input', renderDiscountPreviewLegacy);
    addLegacyListener('adminDiscountReason', 'change', renderDiscountPreviewLegacy);
    addLegacyListener('adminPaymentMethod', 'change', renderPaymentPreviewLegacy);
    addLegacyListener('adminPaymentReceived', 'input', renderPaymentPreviewLegacy);
    addLegacyListener('adminPaymentReceived', 'change', renderPaymentPreviewLegacy);
    addLegacyListener('adminPaymentTipFromChange', 'change', renderPaymentPreviewLegacy);
    addLegacyListener('adminPaymentTipFromChange', 'click', renderPaymentPreviewLegacy);
  }

  function installWindowFallbacks() {
    if (!window.openAdminPaymentModal) window.openAdminPaymentModal = openPaymentLegacy;
    if (!window.applyAdminDiscountForTable) window.applyAdminDiscountForTable = openDiscountLegacy;
    if (!window.openAdminComplimentaryModal) window.openAdminComplimentaryModal = openComplimentaryLegacy;
    if (!window.submitAdminPayment) window.submitAdminPayment = submitPaymentLegacy;
    if (!window.submitAdminDiscount) window.submitAdminDiscount = submitDiscountLegacy;
    if (!window.submitAdminComplimentary) window.submitAdminComplimentary = submitComplimentaryLegacy;
    if (!window.renderAdminPaymentPreview) window.renderAdminPaymentPreview = renderPaymentPreviewLegacy;
    if (!window.renderAdminDiscountPreview) window.renderAdminDiscountPreview = renderDiscountPreviewLegacy;
    if (!window.closeAdminPaymentModal) window.closeAdminPaymentModal = function () {
      legacyPaymentTableId = '';
      hideModal('adminPaymentModal');
    };
    if (!window.closeAdminDiscountModal) window.closeAdminDiscountModal = function () {
      legacyDiscountTableId = '';
      hideModal('adminDiscountModal');
    };
    if (!window.closeAdminComplimentaryModal) window.closeAdminComplimentaryModal = function () {
      legacyComplimentaryTableId = '';
      hideModal('adminComplimentaryModal');
    };
  }

  window.onerror = function (message, source, lineno, colno, error) {
    log('window-error', [message, source, lineno, colno, error && error.stack ? error.stack : ''].join(' | '));
    return false;
  };

  if (window.addEventListener) {
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event && event.reason;
      log('unhandled-rejection', reason && reason.stack ? reason.stack : String(reason || ''));
    });
    document.addEventListener('click', onAction, true);
    document.addEventListener('touchend', onAction, true);
  } else if (document.attachEvent) {
    document.attachEvent('onclick', onAction);
  }

  window.AureaLegacyCompat = {
    log: log,
    visibleLog: visibleLog,
    lastAction: function () { return lastAction; }
  };

  installFetchCompat();
  installWindowFallbacks();
  bindLegacyInputs();
  log('loaded', navigator.userAgent || '');
})();
