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
  var legacyPaymentTableLabel = 'Mesa';
  var legacyPaymentLines = [];
  var legacyPaymentDiscountPercent = 0;
  var legacyPaymentDiscountAmount = 0;
  var legacyPaymentSubmitting = false;
  var legacyPaymentDirty = false;

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

  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function emergencyButton(label, id, kind) {
    var bg = kind === 'success' ? '#5fd27a' : (kind === 'danger' ? '#ec6a6a' : '#2c2c31');
    var color = kind === 'success' || kind === 'danger' ? '#06100a' : '#f5f1e8';
    return '<button id="' + id + '" type="button" style="border:1px solid #4a4a4f;background:' + bg + ';color:' + color + ';font-weight:900;border-radius:8px;padding:12px 14px;min-height:44px;">' + escapeText(label) + '</button>';
  }

  function closeEmergencyPanel() {
    var panel = byId('aureaEmergencyPanel');
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  }

  function showEmergencyPanel(title, tableLabel, bodyHtml, primaryLabel, onPrimary) {
    closeEmergencyPanel();
    var panel = document.createElement('div');
    panel.id = 'aureaEmergencyPanel';
    panel.style.position = 'fixed';
    panel.style.left = '0';
    panel.style.top = '0';
    panel.style.right = '0';
    panel.style.bottom = '0';
    panel.style.zIndex = '2147483647';
    panel.style.background = 'rgba(0,0,0,.72)';
    panel.style.padding = '16px';
    panel.style.overflow = 'auto';
    panel.innerHTML =
      '<div style="max-width:520px;margin:24px auto;background:#17171a;color:#f5f1e8;border:2px solid #c9a44c;border-radius:10px;padding:16px;font-family:Arial,sans-serif;box-shadow:0 18px 48px rgba(0,0,0,.55);">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">'
      + '<div><div style="font-size:22px;font-weight:900;">' + escapeText(title) + '</div>'
      + '<div style="color:#d8c58a;font-size:14px;margin-top:4px;">' + escapeText(tableLabel || 'Mesa') + '</div></div>'
      + emergencyButton('Cerrar', 'aureaEmergencyCloseTop', '')
      + '</div>'
      + '<div>' + bodyHtml + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;">'
      + emergencyButton('Cancelar', 'aureaEmergencyCancel', '')
      + emergencyButton(primaryLabel, 'aureaEmergencyPrimary', 'success')
      + '</div>'
      + '</div>';
    document.body.appendChild(panel);
    byId('aureaEmergencyCloseTop').onclick = closeEmergencyPanel;
    byId('aureaEmergencyCancel').onclick = closeEmergencyPanel;
    byId('aureaEmergencyPrimary').onclick = onPrimary;
  }

  function emergencyField(label, id, type, value, extra) {
    return '<label style="display:block;margin:12px 0 0;font-weight:800;">' + escapeText(label)
      + '<input id="' + id + '" type="' + (type || 'text') + '" value="' + escapeText(value || '') + '" ' + (extra || '')
      + ' style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:8px;border:1px solid #505057;background:#fff;color:#111;font-size:18px;box-sizing:border-box;" />'
      + '</label>';
  }

  function emergencySelect(label, id, optionsHtml) {
    return '<label style="display:block;margin:12px 0 0;font-weight:800;">' + escapeText(label)
      + '<select id="' + id + '" style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:8px;border:1px solid #505057;background:#fff;color:#111;font-size:18px;box-sizing:border-box;">'
      + optionsHtml
      + '</select></label>';
  }

  function roundMoney(value) {
    return Math.round((toNumber(value) + 0.000001) * 100) / 100;
  }

  function compactText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function paymentLineSubtotal(line) {
    return roundMoney(toNumber(line.price) * toNumber(line.qty));
  }

  function paymentSubtotal() {
    var subtotal = 0;
    for (var i = 0; i < legacyPaymentLines.length; i += 1) {
      if (!legacyPaymentLines[i].remove) subtotal += paymentLineSubtotal(legacyPaymentLines[i]);
    }
    return roundMoney(subtotal);
  }

  function paymentTotalFromSubtotal(subtotal) {
    var discount = Math.min(subtotal, roundMoney(subtotal * (legacyPaymentDiscountPercent / 100)));
    legacyPaymentDiscountAmount = discount;
    return Math.max(0, roundMoney(subtotal - discount));
  }

  function inputNumber(id) {
    var el = byId(id);
    return el ? toNumber(el.value) : 0;
  }

  function textLine(left, right, width) {
    var l = String(left || '');
    var r = String(right || '');
    var space = Math.max(1, Number(width || 32) - l.length - r.length);
    return l + Array(space + 1).join(' ') + r;
  }

  function simpleTicketText(calc, payment) {
    var width = 32;
    var lines = [];
    lines.push('          AUREA');
    lines.push('--------------------------------');
    lines.push('TICKET FINAL');
    lines.push(compactText(legacyPaymentTableLabel || 'Mesa'));
    lines.push(new Date().toLocaleString ? new Date().toLocaleString() : String(new Date()));
    lines.push('--------------------------------');
    for (var i = 0; i < legacyPaymentLines.length; i += 1) {
      var line = legacyPaymentLines[i];
      if (line.remove) continue;
      lines.push(textLine(String(line.qty) + 'x ' + compactText(line.name || 'Producto').slice(0, 18), money(paymentLineSubtotal(line)), width));
      if (line.note) lines.push('  Nota: ' + compactText(line.note).slice(0, 24));
    }
    lines.push('--------------------------------');
    lines.push(textLine('Subtotal', money(calc.subtotal), width));
    if (legacyPaymentDiscountAmount > 0 || legacyPaymentDiscountPercent > 0) {
      lines.push(textLine('Desc. ' + legacyPaymentDiscountPercent + '%', '-' + money(legacyPaymentDiscountAmount), width));
    }
    lines.push(textLine('Total', money(calc.total), width));
    lines.push('--------------------------------');
    lines.push('Metodo: ' + calc.methodLabel);
    if (calc.cash > 0) lines.push(textLine('Efectivo', money(calc.cash), width));
    if (calc.card > 0) lines.push(textLine('Tarjeta', money(calc.card), width));
    if (calc.transfer > 0) lines.push(textLine('Transfer.', money(calc.transfer), width));
    if (calc.other > 0) lines.push(textLine('Otro', money(calc.other), width));
    lines.push(textLine('Cubierto', money(calc.covered), width));
    if (calc.change > 0) lines.push(textLine('FERIA', money(calc.change), width));
    if (calc.diners > 0) {
      lines.push('Comensales: ' + calc.diners);
      lines.push(textLine('Por comensal', money(calc.perDiner), width));
    }
    if (payment && payment.id) lines.push('Pago: ' + String(payment.id).slice(0, 24));
    lines.push('--------------------------------');
    lines.push('Gracias por su preferencia');
    lines.push('');
    lines.push('');
    return lines.join('\n');
  }

  function afterEmergencySuccess(message) {
    visibleLog(message);
    closeEmergencyPanel();
    try {
      if (window.loadData) window.loadData(false);
      else window.setTimeout(function () { window.location.reload(); }, 600);
    } catch (ignored) {}
  }

  function openDiscountEmergency(tableId, button) {
    var tableLabel = tableLabelFromButton(button, 'Mesa');
    legacyDiscountTableId = tableId;
    showEmergencyPanel(
      'Aplicar descuento',
      tableLabel,
      emergencyField('Porcentaje 0 a 100', 'emDiscountPercent', 'number', '0', 'min="0" max="100" step="0.01"')
        + '<label id="emDiscountReasonWrap" style="display:none;margin:12px 0 0;font-weight:800;">Motivo descuento 100%'
        + '<input id="emDiscountReason" type="text" placeholder="Cortesia, compensacion, invitacion..." style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:8px;border:1px solid #505057;background:#fff;color:#111;font-size:18px;box-sizing:border-box;" />'
        + '</label>'
        + '<div id="emDiscountHelp" style="margin-top:12px;color:#d8c58a;font-size:14px;">El servidor calcula subtotal y total real al aplicar.</div>',
      'Aplicar',
      submitDiscountEmergency
    );
    function syncReason() {
      var percent = toNumber(byId('emDiscountPercent') && byId('emDiscountPercent').value);
      var wrap = byId('emDiscountReasonWrap');
      if (wrap) wrap.style.display = percent >= 100 ? 'block' : 'none';
    }
    addLegacyListener('emDiscountPercent', 'input', syncReason);
    addLegacyListener('emDiscountPercent', 'change', syncReason);
    syncReason();
  }

  function submitDiscountEmergency() {
    var percent = toNumber(byId('emDiscountPercent') && byId('emDiscountPercent').value);
    var reason = byId('emDiscountReason') ? byId('emDiscountReason').value : '';
    var payload;
    if (percent < 0 || percent > 100) return visibleLog('Descuento invalido: usa 0 a 100');
    if (percent >= 100 && !reason) return visibleLog('Motivo obligatorio para descuento total');
    payload = {
      method: percent >= 100 ? 'courtesy' : 'pending',
      authorize: false,
      closeTable: false,
      discountPercent: percent,
      discountReason: reason
    };
    if (percent >= 100) payload.amountPaid = 0;
    visibleLog('enviando descuento');
    xhrJson('POST', '/api/admin/tables/' + legacyDiscountTableId + '/payment', payload, function () {
      afterEmergencySuccess('descuento aplicado OK');
    }, function (error) {
      visibleLog('error descuento: ' + error.message);
    });
  }

  function openPaymentEmergency(tableId, button) {
    var tableLabel = tableLabelFromButton(button, 'Mesa');
    legacyPaymentTableId = tableId;
    legacyPaymentTableLabel = tableLabel;
    legacyPaymentLines = [];
    legacyPaymentTotal = 0;
    legacyPaymentTotalKnown = false;
    legacyPaymentDiscountPercent = 0;
    legacyPaymentDiscountAmount = 0;
    legacyPaymentSubmitting = false;
    legacyPaymentDirty = false;
    showEmergencyPanel(
      'Ingresar pago',
      tableLabel,
      '<div id="emPaymentStatus" style="padding:10px;border:1px solid #5b4a20;border-radius:8px;background:#2a2414;color:#f3d987;font-weight:900;">Cargando cuenta...</div>'
        + '<div id="emPaymentAccount" style="margin-top:12px;"></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">'
        + emergencyButton('Editar cuenta', 'emToggleEdit', '')
        + emergencyButton('Guardar cambios', 'emSaveAccount', 'success')
        + '</div>'
        + emergencyField('Dividir entre comensales', 'emDinersCount', 'number', '', 'min="0" step="1" placeholder="Ej. 4"')
        + '<div id="emPerDiner" style="margin-top:8px;color:#d8c58a;font-weight:900;"></div>'
        + emergencySelect('Tipo de pago', 'emPaymentMode', '<option value="single">Metodo unico</option><option value="mixed">Pago mixto</option>')
        + '<div id="emSinglePay">'
        + emergencySelect('Metodo', 'emPaymentMethod', '<option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="other">Otro</option><option value="courtesy">Cortesia / descuento total</option>')
        + emergencyField('Recibido', 'emPaymentReceived', 'number', '', 'min="0" step="0.01" placeholder="Ej. 500"')
        + '</div>'
        + '<div id="emMixedPay" style="display:none;">'
        + emergencyField('Efectivo recibido', 'emCashAmount', 'number', '', 'min="0" step="0.01"')
        + emergencyField('Tarjeta', 'emCardAmount', 'number', '', 'min="0" step="0.01"')
        + emergencyField('Transferencia', 'emTransferAmount', 'number', '', 'min="0" step="0.01"')
        + emergencyField('Otro', 'emOtherAmount', 'number', '', 'min="0" step="0.01"')
        + '</div>'
        + emergencyField('Nota opcional', 'emPaymentNote', 'text', '', 'placeholder="voucher, autorizacion..."')
        + '<div id="emPaymentSummary" style="margin-top:14px;padding:12px;border-radius:10px;background:#101113;border:1px solid #4a4a4f;"></div>',
      'Confirmar e imprimir ticket',
      submitPaymentEmergency
    );
    bindAdvancedPaymentInputs();
    renderAdvancedPaymentPanel();
    xhrJson('GET', '/api/admin/legacy-data?ts=' + new Date().getTime(), null, function (data) {
      legacyDb = data;
      loadAdvancedPaymentData(data, tableId);
      renderAdvancedPaymentPanel();
    }, function (error) {
      var status = byId('emPaymentStatus');
      if (status) status.innerHTML = 'No pude cargar cuenta: ' + escapeText(error.message);
      updateAdvancedPaymentSummary();
    });
  }

  function bindAdvancedPaymentInputs() {
    var ids = ['emDinersCount', 'emPaymentMode', 'emPaymentMethod', 'emPaymentReceived', 'emCashAmount', 'emCardAmount', 'emTransferAmount', 'emOtherAmount'];
    for (var i = 0; i < ids.length; i += 1) {
      addLegacyListener(ids[i], 'input', updateAdvancedPaymentSummary);
      addLegacyListener(ids[i], 'change', updateAdvancedPaymentSummary);
    }
    if (byId('emToggleEdit')) byId('emToggleEdit').onclick = togglePaymentEditMode;
    if (byId('emSaveAccount')) byId('emSaveAccount').onclick = saveEmergencyAccountChanges;
  }

  function loadAdvancedPaymentData(data, tableId) {
    var totals = billTotalsForTable(data, tableId);
    var payment = totals.payment || {};
    legacyPaymentLines = [];
    legacyPaymentDiscountPercent = toNumber(payment.discountPercent || totals.discountPercent || 0);
    legacyPaymentDiscountAmount = toNumber(payment.discountAmount || totals.discountAmount || 0);
    for (var i = 0; i < (data.orders || []).length; i += 1) {
      var order = data.orders[i];
      if (order.tableId !== tableId) continue;
      if (order.status === 'cancelled' || order.closedWithTable === true) continue;
      var items = order.items || [];
      for (var j = 0; j < items.length; j += 1) {
        var item = items[j];
        legacyPaymentLines.push({
          orderId: item.orderId || order.id,
          itemIndex: item.itemIndex !== undefined ? item.itemIndex : j,
          name: item.name || 'Producto',
          qty: toNumber(item.qty || item.quantity || 0),
          price: toNumber(item.price || 0),
          note: item.note || '',
          modifierName: item.modifierName || '',
          complimentary: Boolean(item.complimentary),
          remove: false
        });
      }
    }
    legacyPaymentTotal = totals.total;
    legacyPaymentTotalKnown = true;
    legacyPaymentDirty = false;
    var session = activeSessionForTable(data, tableId);
    if (session && session.dinersCount && byId('emDinersCount')) byId('emDinersCount').value = String(session.dinersCount);
    if (byId('emPaymentReceived') && !byId('emPaymentReceived').value) byId('emPaymentReceived').value = String(totals.total || 0);
  }

  function renderAdvancedPaymentPanel() {
    renderPaymentAccountLines(false);
    updateAdvancedPaymentSummary();
  }

  function renderPaymentAccountLines(editing) {
    var box = byId('emPaymentAccount');
    var status = byId('emPaymentStatus');
    var html = '';
    var subtotal = paymentSubtotal();
    var total = paymentTotalFromSubtotal(subtotal);
    legacyPaymentTotal = total;
    if (status) {
      status.innerHTML = 'Total a pagar: <span style="font-size:24px;">' + money(total) + '</span>';
    }
    if (!box) return;
    if (!legacyPaymentLines.length) {
      box.innerHTML = '<div style="padding:10px;border:1px solid #5b4a20;border-radius:8px;color:#f3d987;">Sin productos cargados todavia.</div>';
      return;
    }
    html += '<div style="font-weight:900;margin-bottom:8px;">Resumen editable de cuenta</div>';
    for (var i = 0; i < legacyPaymentLines.length; i += 1) {
      var line = legacyPaymentLines[i];
      var opacity = line.remove ? '.45' : '1';
      html += '<div style="opacity:' + opacity + ';border:1px solid #3e3e45;border-radius:8px;padding:10px;margin:8px 0;background:#202126;">'
        + '<div style="font-weight:900;">' + escapeText(line.name) + '</div>'
        + '<div style="color:#d8c58a;margin-top:3px;">' + money(line.price) + ' c/u · Subtotal ' + money(paymentLineSubtotal(line)) + '</div>';
      if (editing) {
        html += '<div style="display:grid;grid-template-columns:80px 1fr;gap:8px;margin-top:8px;">'
          + '<label>Cant.<input id="emLineQty' + i + '" type="number" min="0" step="1" value="' + escapeText(line.qty) + '" style="width:100%;padding:10px;border-radius:7px;border:1px solid #555;font-size:17px;box-sizing:border-box;" /></label>'
          + '<label>Nota<input id="emLineNote' + i + '" type="text" value="' + escapeText(line.note || '') + '" style="width:100%;padding:10px;border-radius:7px;border:1px solid #555;font-size:17px;box-sizing:border-box;" /></label>'
          + '</div>'
          + '<label style="display:flex;gap:8px;align-items:center;margin-top:8px;"><input id="emLineRemove' + i + '" type="checkbox" ' + (line.remove ? 'checked' : '') + ' /> Eliminar producto</label>';
      } else if (line.note) {
        html += '<div style="color:#ddd;margin-top:4px;">Nota: ' + escapeText(line.note) + '</div>';
      }
      html += '</div>';
    }
    html += '<div style="margin-top:8px;border-top:1px solid #555;padding-top:8px;">Subtotal: <strong>' + money(subtotal) + '</strong>'
      + (legacyPaymentDiscountAmount > 0 || legacyPaymentDiscountPercent > 0 ? '<br>Descuento ' + legacyPaymentDiscountPercent + '%: <strong>-' + money(legacyPaymentDiscountAmount) + '</strong>' : '')
      + '<br>Total: <strong>' + money(total) + '</strong></div>';
    box.innerHTML = html;
    if (byId('emSaveAccount')) byId('emSaveAccount').style.display = editing ? 'block' : 'none';
    if (editing) {
      for (var j = 0; j < legacyPaymentLines.length; j += 1) {
        addLegacyListener('emLineQty' + j, 'input', syncPaymentLineEdits);
        addLegacyListener('emLineNote' + j, 'input', syncPaymentLineEdits);
        addLegacyListener('emLineRemove' + j, 'change', syncPaymentLineEdits);
      }
    }
  }

  function togglePaymentEditMode() {
    var box = byId('emPaymentAccount');
    var editing = !(box && box.getAttribute && box.getAttribute('data-editing') === '1');
    if (box && box.setAttribute) box.setAttribute('data-editing', editing ? '1' : '0');
    renderPaymentAccountLines(editing);
    updateAdvancedPaymentSummary();
  }

  function syncPaymentLineEdits() {
    for (var i = 0; i < legacyPaymentLines.length; i += 1) {
      if (byId('emLineQty' + i)) legacyPaymentLines[i].qty = Math.max(0, Math.min(99, Math.floor(toNumber(byId('emLineQty' + i).value))));
      if (byId('emLineNote' + i)) legacyPaymentLines[i].note = byId('emLineNote' + i).value;
      if (byId('emLineRemove' + i)) legacyPaymentLines[i].remove = byId('emLineRemove' + i).checked;
    }
    legacyPaymentDirty = true;
    updateAdvancedPaymentSummary();
  }

  function saveEmergencyAccountChanges() {
    syncPaymentLineEdits();
    visibleLog('guardando cambios cuenta');
    xhrJson('PATCH', '/api/admin/tables/' + legacyPaymentTableId + '/account-lines', {
      lines: legacyPaymentLines
    }, function () {
      visibleLog('cambios guardados OK');
      xhrJson('GET', '/api/admin/legacy-data?ts=' + new Date().getTime(), null, function (data) {
        legacyDb = data;
        loadAdvancedPaymentData(data, legacyPaymentTableId);
        legacyPaymentDirty = false;
        var box = byId('emPaymentAccount');
        if (box && box.setAttribute) box.setAttribute('data-editing', '0');
        renderAdvancedPaymentPanel();
      }, function (error) {
        visibleLog('guardado OK, pero no recargue cuenta: ' + error.message);
      });
    }, function (error) {
      visibleLog('error guardando cuenta: ' + error.message);
    });
  }

  function advancedPaymentCalc() {
    var subtotal = paymentSubtotal();
    var total = paymentTotalFromSubtotal(subtotal);
    var mode = byId('emPaymentMode') ? byId('emPaymentMode').value : 'single';
    var method = byId('emPaymentMethod') ? byId('emPaymentMethod').value : 'cash';
    var cash = 0;
    var card = 0;
    var transfer = 0;
    var other = 0;
    var methodLabel = 'Efectivo';
    if (mode === 'mixed') {
      method = 'mixed';
      methodLabel = 'Pago mixto';
      cash = inputNumber('emCashAmount');
      card = inputNumber('emCardAmount');
      transfer = inputNumber('emTransferAmount');
      other = inputNumber('emOtherAmount');
    } else if (method === 'cash') {
      cash = inputNumber('emPaymentReceived');
      methodLabel = 'Efectivo';
    } else if (method === 'card') {
      card = inputNumber('emPaymentReceived');
      methodLabel = 'Tarjeta';
    } else if (method === 'transfer') {
      transfer = inputNumber('emPaymentReceived');
      methodLabel = 'Transferencia';
    } else if (method === 'other') {
      other = inputNumber('emPaymentReceived');
      methodLabel = 'Otro';
    } else if (method === 'courtesy') {
      methodLabel = 'Cortesia';
    }
    var nonCash = roundMoney(card + transfer + other);
    var covered = roundMoney(cash + nonCash);
    var missing = Math.max(0, roundMoney(total - covered));
    var change = cash > 0 && covered > total ? roundMoney(covered - total) : 0;
    var nonCashOver = nonCash > total + 0.001;
    var diners = Math.max(0, Math.min(40, Math.floor(inputNumber('emDinersCount'))));
    var perDiner = diners > 0 ? roundMoney(total / diners) : 0;
    return {
      subtotal: subtotal,
      total: total,
      mode: mode,
      method: method,
      methodLabel: methodLabel,
      cash: cash,
      card: card,
      transfer: transfer,
      other: other,
      nonCash: nonCash,
      covered: covered,
      missing: missing,
      change: change,
      nonCashOver: nonCashOver,
      diners: diners,
      perDiner: perDiner
    };
  }

  function updateAdvancedPaymentSummary() {
    var calc = advancedPaymentCalc();
    var mixed = byId('emPaymentMode') && byId('emPaymentMode').value === 'mixed';
    if (byId('emSinglePay')) byId('emSinglePay').style.display = mixed ? 'none' : 'block';
    if (byId('emMixedPay')) byId('emMixedPay').style.display = mixed ? 'block' : 'none';
    if (byId('emPerDiner')) byId('emPerDiner').innerHTML = calc.diners > 0 ? 'Total por comensal: ' + money(calc.perDiner) : '';
    var summary = byId('emPaymentSummary');
    var primary = byId('aureaEmergencyPrimary');
    var canPay = legacyPaymentTotalKnown && calc.total >= 0 && calc.missing <= 0.001 && !calc.nonCashOver && !legacyPaymentSubmitting && !legacyPaymentDirty;
    if (calc.method === 'courtesy' && calc.total > 0.001) canPay = false;
    if (summary) {
      summary.innerHTML =
        '<div style="font-size:16px;">Total a pagar</div>'
        + '<div style="font-size:30px;font-weight:900;color:#f3d987;">' + money(calc.total) + '</div>'
        + '<div style="margin-top:8px;">Total cubierto: <strong>' + money(calc.covered) + '</strong></div>'
        + (calc.missing > 0 ? '<div style="margin-top:8px;color:#ffb4b4;font-size:22px;font-weight:900;">Faltan: ' + money(calc.missing) + '</div>' : '')
        + (calc.change > 0 ? '<div style="margin-top:8px;color:#5fd27a;font-size:28px;font-weight:900;">Feria: ' + money(calc.change) + '</div>' : '')
        + (legacyPaymentDirty ? '<div style="margin-top:8px;color:#ffb4b4;font-weight:900;">Guarda los cambios de cuenta antes de cobrar.</div>' : '')
        + (calc.nonCashOver ? '<div style="margin-top:8px;color:#ffb4b4;font-weight:900;">Tarjeta/transferencia/otro no pueden exceder el total.</div>' : '')
        + (calc.method === 'courtesy' && calc.total > 0.001 ? '<div style="margin-top:8px;color:#ffb4b4;font-weight:900;">Cortesia solo cierra cuentas en $0.</div>' : '')
        + '<div style="margin-top:8px;color:#d8c58a;">Metodo: ' + escapeText(calc.methodLabel) + '</div>';
    }
    if (primary) {
      primary.disabled = !canPay;
      primary.style.opacity = canPay ? '1' : '.45';
    }
  }

  function submitPaymentEmergency() {
    var calc = advancedPaymentCalc();
    var primary = byId('aureaEmergencyPrimary');
    var payload;
    if (legacyPaymentSubmitting) return;
    updateAdvancedPaymentSummary();
    if (primary && primary.disabled) return visibleLog('Pago incompleto o invalido');
    legacyPaymentSubmitting = true;
    if (primary) primary.disabled = true;
    payload = {
      method: calc.method,
      cashAmount: calc.cash,
      cardAmount: calc.card,
      transferAmount: calc.transfer,
      otherAmount: calc.other,
      amountPaid: calc.covered,
      closeTable: true,
      dinersCount: calc.diners,
      totalPerDiner: calc.perDiner,
      note: byId('emPaymentNote') ? byId('emPaymentNote').value : ''
    };
    visibleLog('enviando pago');
    xhrJson('POST', '/api/admin/tables/' + legacyPaymentTableId + '/payment', payload, function (data) {
      var payment = data && data.payment ? data.payment : {};
      printFinalTicketOnce(calc, payment);
      afterEmergencySuccess('pago registrado OK');
    }, function (error) {
      legacyPaymentSubmitting = false;
      if (primary) primary.disabled = false;
      visibleLog('error pago: ' + error.message);
    });
  }

  function printFinalTicketOnce(calc, payment) {
    var key = payment && payment.id ? payment.id : (legacyPaymentTableId + '-' + new Date().getTime());
    var storageKey = 'aurea_final_ticket_printed_' + key;
    var text;
    try {
      if (window.localStorage && localStorage.getItem(storageKey)) return;
      text = simpleTicketText(calc, payment);
      if (window.AureaPrintBridge && window.AureaPrintBridge.printTextIfBridge && window.AureaPrintBridge.printTextIfBridge(text, { feedDots: 320 })) {
        if (window.localStorage) localStorage.setItem(storageKey, '1');
        return;
      }
      if (window.AureaPrintBridge && window.AureaPrintBridge.printText && window.AureaPrintBridge.printText(text, { feedDots: 320 })) {
        if (window.localStorage) localStorage.setItem(storageKey, '1');
        return;
      }
    } catch (error) {
      visibleLog('pago OK, ticket no automatico: ' + (error.message || error));
    }
  }

  function openComplimentaryEmergency(tableId, button) {
    var tableLabel = tableLabelFromButton(button, 'Mesa');
    legacyComplimentaryTableId = tableId;
    showEmergencyPanel(
      'Enviar cortesia',
      tableLabel,
      emergencySelect('Producto', 'emCompItem', '<option value="">Cargando productos...</option>')
        + emergencyField('Cantidad', 'emCompQty', 'number', '1', 'min="1" max="20" step="1"')
        + emergencyField('Motivo opcional', 'emCompReason', 'text', '', 'placeholder="cortesia, compensacion..."')
        + '<div id="emCompStatus" style="margin-top:12px;color:#d8c58a;font-size:14px;">Cargando productos...</div>',
      'Enviar',
      submitComplimentaryEmergency
    );
    xhrJson('GET', '/api/admin/legacy-data?ts=' + new Date().getTime(), null, function (data) {
      var select = byId('emCompItem');
      var status = byId('emCompStatus');
      var items = data && data.menuItems ? data.menuItems : [];
      if (!select) return;
      if (!items.length) {
        select.innerHTML = '<option value="">No hay productos</option>';
        if (status) status.innerHTML = 'No encontre productos disponibles.';
        return;
      }
      select.innerHTML = '';
      for (var i = 0; i < items.length; i += 1) {
        var option = document.createElement('option');
        option.value = items[i].id;
        option.text = (items[i].name || 'Producto') + ' - ' + money(items[i].price || 0);
        select.appendChild(option);
      }
      if (status) status.innerHTML = 'Productos cargados.';
    }, function (error) {
      var select = byId('emCompItem');
      var status = byId('emCompStatus');
      if (select) select.innerHTML = '<option value="">Error cargando productos</option>';
      if (status) status.innerHTML = 'Error: ' + escapeText(error.message);
    });
  }

  function submitComplimentaryEmergency() {
    var itemId = byId('emCompItem') ? byId('emCompItem').value : '';
    var qty = Math.max(1, Math.min(20, Math.floor(toNumber(byId('emCompQty') && byId('emCompQty').value) || 1)));
    var reason = byId('emCompReason') ? byId('emCompReason').value : '';
    if (!itemId) return visibleLog('Selecciona producto');
    visibleLog('enviando cortesia');
    xhrJson('POST', '/api/admin/tables/' + legacyComplimentaryTableId + '/complimentary-item', {
      itemId: itemId,
      qty: qty,
      reason: reason,
      idempotency_key: 'em-comp-' + legacyComplimentaryTableId + '-' + itemId + '-' + new Date().getTime()
    }, function () {
      afterEmergencySuccess('cortesia enviada OK');
    }, function (error) {
      visibleLog('error cortesia: ' + error.message);
    });
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
    if (action === 'open-payment') return openPaymentEmergency(tableId, button);
    if (action === 'open-discount') return openDiscountEmergency(tableId, button);
    if (action === 'open-complimentary') return openComplimentaryEmergency(tableId, button);
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
