(function () {
  const BRIDGE_PACKAGE = 'com.aurea.print';
  const BRIDGE_SCHEME = 'aureaprint';
  const PRINT_MODE_KEY = 'aurea-print-mode-v1';

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function mode() {
    return localStorage.getItem(PRINT_MODE_KEY) || 'auto';
  }

  function setMode(value) {
    const clean = ['auto', 'bridge', 'web'].includes(value) ? value : 'auto';
    localStorage.setItem(PRINT_MODE_KEY, clean);
    return clean;
  }

  function shouldUseBridge() {
    const current = mode();
    if (current === 'bridge') return true;
    if (current === 'web') return false;
    return isAndroid();
  }

  function cleanText(value) {
    return String(value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[🔥🥗🥤🍽️🧾✨👨‍🍳🙋‍♂️⭐🔁🥡🔋]/gu, '')
      .replace(/[\u200d\ufe0f]/g, '')
      .split('\n')
      .map(line => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function line(width = 32, char = '-') {
    return String(char || '-').repeat(Math.max(8, Number(width || 32)));
  }

  function center(value, width = 32) {
    const text = cleanText(value).replace(/\n/g, ' ').trim();
    if (text.length >= width) return text;
    const left = Math.floor((width - text.length) / 2);
    return `${' '.repeat(left)}${text}`;
  }

  function wrapText(value, width = 32, indent = '') {
    const text = cleanText(value).replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const max = Math.max(12, Number(width || 32) - String(indent || '').length);
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      if (!current) current = word;
      else if (`${current} ${word}`.length <= max) current += ` ${word}`;
      else {
        lines.push(`${indent}${current}`);
        current = word;
      }
    }
    if (current) lines.push(`${indent}${current}`);
    return lines;
  }

  function row(left, right, width = 32) {
    const l = cleanText(left);
    const r = cleanText(right);
    const space = Math.max(1, Number(width || 32) - l.length - r.length);
    if (space === 1 && l.length + r.length + 1 > width) return `${l}\n${r.padStart(width)}`;
    return `${l}${' '.repeat(space)}${r}`;
  }

  function money(value) {
    const amount = Number(value || 0);
    return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function ticketWidthMm(settingsValue) {
    return Number(settingsValue || 58) === 80 ? 80 : 58;
  }

  function charsForWidth(widthMm = 58) {
    return ticketWidthMm(widthMm) === 80 ? 42 : 32;
  }

  function itemLine(item, options = {}) {
    const width = Number(options.width || 32);
    const showPrices = Boolean(options.showPrices);
    const qty = Number(item?.qty || item?.cantidad || 0) || 1;
    const name = cleanText(item?.name || item?.nombre || 'Producto');
    const subtotal = Number(item?.subtotal || (Number(item?.price || 0) * qty) || 0);
    const prefix = `${qty}x `;
    const lines = [];
    if (showPrices) {
      const price = money(subtotal);
      const available = Math.max(10, width - price.length - 1);
      const nameLines = wrapText(`${prefix}${name}`, available);
      if (nameLines.length) lines.push(row(nameLines[0], price, width));
      nameLines.slice(1).forEach(part => lines.push(part));
    } else {
      lines.push(...wrapText(`${prefix}${name}`, width));
    }
    if (item?.modifierName) lines.push(...wrapText(`${item.modifierGroupName || 'Opcion'}: ${item.modifierName}`, width, '  '));
    if (item?.note) lines.push(...wrapText(`Nota: ${item.note}`, width, '  '));
    if (item?.dinerName) lines.push(...wrapText(`Cuenta: ${item.dinerName}`, width, '  '));
    return lines.join('\n');
  }

  function buildOrderTicketText(order, options = {}) {
    const width = Number(options.width || charsForWidth(options.ticketWidthMm || 58));
    const restaurant = cleanText(options.restaurantName || 'AUREA');
    const title = cleanText(options.title || `COMANDA #${order?.commandNumber || '-'}`);
    const tableName = cleanText(order?.tableName || options.tableName || 'Mesa');
    const stationLabel = cleanText(options.stationLabel || '');
    const created = options.dateTimeText || (order?.createdAt ? new Date(order.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }));
    const lines = [
      center(restaurant, width),
      center('AUREA by KMO', width),
      line(width),
      center(title, width),
      center(tableName, width)
    ];
    if (stationLabel) lines.push(center(stationLabel, width));
    if (created) lines.push(center(created, width));
    lines.push(line(width));

    const items = Array.isArray(options.items) ? options.items : (Array.isArray(order?.items) ? order.items : []);
    if (!items.length) lines.push(center('Sin productos', width));
    else items.forEach((item, index) => {
      if (index) lines.push('');
      lines.push(itemLine(item, { width, showPrices: options.showPrices }));
    });

    if (order?.note || options.note) {
      lines.push(line(width));
      lines.push(...wrapText(`Nota: ${order?.note || options.note}`, width));
    }

    if (options.showTotal) {
      lines.push(line(width));
      lines.push(row('TOTAL', money(order?.total || options.total || 0), width));
    }

    lines.push(line(width));
    lines.push(center(options.footer || 'Ticket de produccion', width));
    lines.push('');
    lines.push('');
    return cleanText(lines.join('\n'));
  }

  function buildBillTicketText(payload = {}, options = {}) {
    const width = Number(options.width || charsForWidth(options.ticketWidthMm || 58));
    const restaurant = cleanText(options.restaurantName || 'AUREA');
    const tableName = cleanText(payload.tableName || 'Mesa');
    const lines = [
      center(restaurant, width),
      center('AUREA by KMO', width),
      line(width),
      center('TICKET DE CUENTA', width),
      center(tableName, width),
      center(new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }), width),
      line(width)
    ];
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) lines.push(center('Sin productos', width));
    else items.forEach((item, index) => {
      if (index) lines.push('');
      lines.push(itemLine(item, { width, showPrices: true }));
    });
    lines.push(line(width));
    lines.push(row('TOTAL', money(payload.total || 0), width));
    if (payload.note) {
      lines.push('');
      lines.push(...wrapText(payload.note, width));
    }
    lines.push(line(width));
    lines.push(center(options.footer || 'Gracias por su preferencia', width));
    lines.push('');
    lines.push('');
    return cleanText(lines.join('\n'));
  }

  function currentReturnUrl(options = {}) {
    if (options.returnUrl === false) return '';
    if (typeof options.returnUrl === 'string' && options.returnUrl.trim()) return options.returnUrl.trim();
    return window.location.href;
  }

  function nativePayloadAvailable() {
    return Boolean(window.__AUREA_POS_NATIVE_PRINT__ && window.AureaPosPrint && typeof window.AureaPosPrint.printPayload === 'function');
  }

  function buildPrintPayload(text, options = {}) {
    const ticket = cleanText(text);
    return {
      text: ticket,
      logoDataUrl: String(options.logoDataUrl || ''),
      logoText: cleanText(options.logoText || options.restaurantName || ''),
      feedDots: Math.max(0, Math.min(520, Number(options.feedDots || 260))),
      returnUrl: currentReturnUrl(options)
    };
  }

  function printPayload(payload = {}, options = {}) {
    const data = buildPrintPayload(payload.text || '', { ...options, ...payload });
    if (!data.text) return false;
    if (nativePayloadAvailable()) {
      window.AureaPosPrint.printPayload(JSON.stringify(data));
      return true;
    }
    return printText(data.text, data);
  }

  function printText(text, options = {}) {
    const data = buildPrintPayload(text, options);
    const ticket = data.text;
    if (!ticket) return false;
    if (nativePayloadAvailable()) {
      window.AureaPosPrint.printPayload(JSON.stringify(data));
      return true;
    }
    const encoded = encodeURIComponent(ticket);
    const returnUrl = currentReturnUrl(options);
    const returnPart = returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}&autoReturn=1` : '';
    const intentUrl = `intent://print?text=${encoded}${returnPart}#Intent;scheme=${BRIDGE_SCHEME};package=${BRIDGE_PACKAGE};end`;
    window.location.href = intentUrl;
    return true;
  }

  function printTextIfBridge(text, options = {}) {
    if (!shouldUseBridge()) return false;
    return printText(text, options);
  }

  window.AureaPrintBridge = {
    isAndroid,
    mode,
    setMode,
    shouldUseBridge,
    cleanText,
    line,
    center,
    wrapText,
    row,
    money,
    charsForWidth,
    buildOrderTicketText,
    buildBillTicketText,
    currentReturnUrl,
    nativePayloadAvailable,
    printPayload,
    printText,
    printTextIfBridge
  };
})();
