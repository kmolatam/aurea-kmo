(function () {
  var lastAction = '';
  var lastActionAt = 0;

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
    log('action:' + action, tableId || '');
    if (action === 'open-payment' && typeof window.openAdminPaymentModal === 'function') return window.openAdminPaymentModal(tableId);
    if (action === 'open-discount' && typeof window.applyAdminDiscountForTable === 'function') return window.applyAdminDiscountForTable(tableId);
    if (action === 'submit-payment' && typeof window.submitAdminPayment === 'function') return window.submitAdminPayment();
    if (action === 'submit-discount' && typeof window.submitAdminDiscount === 'function') return window.submitAdminDiscount();
    if (action === 'daily-close' && typeof window.submitDailyClose === 'function') return window.submitDailyClose();
    log('missing-handler:' + action, tableId || '');
    if (window.toast) window.toast('Accion no disponible en este WebView. Revisa consola legacy.');
    return null;
  }

  function onAction(event) {
    var button = closestActionElement(event.target || event.srcElement);
    if (!button) return;
    var action = button.getAttribute('data-legacy-action');
    var now = Date.now ? Date.now() : new Date().getTime();
    if (lastAction === action && now - lastActionAt < 650) {
      if (event.preventDefault) event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      if (event.stopPropagation) event.stopPropagation();
      return false;
    }
    lastAction = action;
    lastActionAt = now;
    if (event.preventDefault) event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    if (event.stopPropagation) event.stopPropagation();
    try {
      callAction(action, button);
    } catch (error) {
      log('action-error:' + action, error && error.stack ? error.stack : String(error));
      if (window.toast) window.toast(error && error.message ? error.message : 'Error en accion legacy');
    }
    return false;
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

  log('loaded', navigator.userAgent || '');
})();
