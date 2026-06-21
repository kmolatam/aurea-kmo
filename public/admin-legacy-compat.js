(function () {
  var lastAction = '';
  var lastActionAt = 0;
  var visibleTimer = null;

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
    if (action === 'open-payment' && typeof actions.openPayment === 'function') return actions.openPayment(tableId);
    if (action === 'open-discount' && typeof actions.openDiscount === 'function') return actions.openDiscount(tableId);
    if (action === 'open-complimentary' && typeof actions.openComplimentary === 'function') return actions.openComplimentary(tableId);
    if (action === 'submit-payment' && typeof actions.submitPayment === 'function') return actions.submitPayment();
    if (action === 'submit-discount' && typeof actions.submitDiscount === 'function') return actions.submitDiscount();
    if (action === 'submit-complimentary' && typeof actions.submitComplimentary === 'function') return actions.submitComplimentary();
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
    return action === 'submit-payment'
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
  log('loaded', navigator.userAgent || '');
})();
