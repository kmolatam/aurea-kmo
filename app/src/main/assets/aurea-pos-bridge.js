(function(){
  try {
    var IS_IMIN = __IS_IMIN__;
    if(!String.prototype.replaceAll){
      String.prototype.replaceAll=function(search,replacement){
        var target=String(this);
        if(search instanceof RegExp){return target.replace(search,replacement);}
        return target.split(String(search)).join(String(replacement));
      };
    }
    if(!Object.assign){
      Object.assign=function(t){
        if(t==null){throw new TypeError('Cannot convert undefined or null to object');}
        var to=Object(t);
        for(var i=1;i<arguments.length;i++){
          var n=arguments[i];
          if(n!=null){for(var k in n){if(Object.prototype.hasOwnProperty.call(n,k)){to[k]=n[k];}}}
        }
        return to;
      };
    }

    var PRINT_MODE_KEY='aurea-print-mode-v1';
    localStorage.setItem(PRINT_MODE_KEY,'bridge');
    window.__AUREA_POS_NATIVE_PRINT__=true;
    window.__AUREA_POS_IMIN_USB_NATIVE__=IS_IMIN;

    function status(s){ try{ if(window.AureaPosPrint&&window.AureaPosPrint.setStatus){ window.AureaPosPrint.setStatus(String(s||'')); } }catch(e){} }
    function toast(s){ try{ if(window.AureaPosPrint&&window.AureaPosPrint.toast){ window.AureaPosPrint.toast(String(s||'')); } }catch(e){} }
    function cleanText(value){
      return String(value==null?'':value)
        .replace(/\r\n/g,'\n').replace(/\r/g,'\n')
        .replace(/[🔥🥗🥤🍽️🧾✨👨‍🍳🙋‍♂️⭐🔁🥡🔋]/gu,'')
        .replace(/[\u200d\ufe0f]/g,'')
        .split('\n').map(function(line){return line.replace(/[ \t]+$/g,'');}).join('\n')
        .replace(/\n{4,}/g,'\n\n\n')
        .trim();
    }
    function restaurant(){return (window.db&&window.db.restaurant)||(window.staffDb&&window.staffDb.restaurant)||(window.kitchenDb&&window.kitchenDb.restaurant)||{};}
    function line(width,ch){return Array(Math.max(8,Number(width||32))+1).join(ch||'-');}
    function center(value,width){var text=cleanText(value).replace(/\n/g,' ').trim(); width=Number(width||32); if(text.length>=width)return text; return Array(Math.floor((width-text.length)/2)+1).join(' ')+text;}
    function wrapText(value,width,indent){var text=cleanText(value).replace(/\s+/g,' ').trim(); indent=indent||''; width=Number(width||32); if(!text)return[]; var max=Math.max(12,width-indent.length); var words=text.split(' '), lines=[], current=''; for(var i=0;i<words.length;i++){var word=words[i]; if(!current)current=word; else if((current+' '+word).length<=max)current+=' '+word; else{lines.push(indent+current); current=word;}} if(current)lines.push(indent+current); return lines;}
    function row(left,right,width){width=Number(width||32); var l=cleanText(left), r=cleanText(right); var space=Math.max(1,width-l.length-r.length); if(space===1 && l.length+r.length+1>width)return l+'\n'+Array(Math.max(0,width-r.length)+1).join(' ')+r; return l+Array(space+1).join(' ')+r;}
    function money(value){var amount=Number(value||0); try{return '$'+amount.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}catch(e){return '$'+amount.toFixed(2);}}
    function charsForWidth(widthMm){return Number(widthMm||58)===80?42:32;}
    function itemLine(item,opts){opts=opts||{}; var width=Number(opts.width||32), showPrices=!!opts.showPrices; var qty=Number(item&&item.qty||item&&item.cantidad||0)||1; var name=cleanText(item&&item.name||item&&item.nombre||'Producto'); var subtotal=Number(item&&item.subtotal || ((Number(item&&item.price||0))*qty) ||0); var prefix=qty+'x '; var lines=[]; if(showPrices){var price=money(subtotal); var avail=Math.max(10,width-price.length-1); var nameLines=wrapText(prefix+name,avail); if(nameLines.length)lines.push(row(nameLines[0],price,width)); for(var i=1;i<nameLines.length;i++)lines.push(nameLines[i]);}else{lines=lines.concat(wrapText(prefix+name,width));} if(item&&item.modifierName)lines=lines.concat(wrapText((item.modifierGroupName||'Opcion')+': '+item.modifierName,width,'  ')); if(item&&item.note)lines=lines.concat(wrapText('Nota: '+item.note,width,'  ')); if(item&&item.dinerName)lines=lines.concat(wrapText('Cuenta: '+item.dinerName,width,'  ')); return lines.join('\n');}
    function buildOrderTicketText(order,options){options=options||{}; order=order||{}; var width=Number(options.width||charsForWidth(options.ticketWidthMm||58)); var restaurantName=cleanText(options.restaurantName||restaurant().name||'AUREA'); var created=options.dateTimeText||(order.createdAt?new Date(order.createdAt).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}):new Date().toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'})); var lines=[center(restaurantName,width), center('AUREA by KMO',width), line(width), center(options.title||('COMANDA #'+(order.commandNumber||'-')),width), center(order.tableName||options.tableName||'Mesa',width)]; if(options.stationLabel)lines.push(center(options.stationLabel,width)); if(created)lines.push(center(created,width)); lines.push(line(width)); var items=Array.isArray(options.items)?options.items:(Array.isArray(order.items)?order.items:[]); if(!items.length)lines.push(center('Sin productos',width)); else items.forEach(function(item,index){if(index)lines.push(''); lines.push(itemLine(item,{width:width,showPrices:options.showPrices}));}); if(order.note||options.note){lines.push(line(width)); lines=lines.concat(wrapText('Nota: '+(order.note||options.note),width));} if(options.showTotal){lines.push(line(width)); lines.push(row('TOTAL',money(order.total||options.total||0),width));} lines.push(line(width)); lines.push(center(options.footer||'Ticket de produccion',width)); lines.push(''); lines.push(''); return cleanText(lines.join('\n'));}
    function buildBillTicketText(payload,options){payload=payload||{}; options=options||{}; var width=Number(options.width||charsForWidth(options.ticketWidthMm||58)); var restaurantName=cleanText(options.restaurantName||restaurant().name||'AUREA'); var lines=[center(restaurantName,width),center('AUREA by KMO',width),line(width),center('TICKET DE CUENTA',width),center(payload.tableName||'Mesa',width),center(new Date().toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}),width),line(width)]; var items=Array.isArray(payload.items)?payload.items:[]; if(!items.length)lines.push(center('Sin productos',width)); else items.forEach(function(item,index){if(index)lines.push(''); lines.push(itemLine(item,{width:width,showPrices:true}));}); lines.push(line(width)); lines.push(row('TOTAL',money(payload.total||0),width)); if(payload.note){lines.push(''); lines=lines.concat(wrapText(payload.note,width));} lines.push(line(width)); lines.push(center(options.footer||'Gracias por su preferencia',width)); lines.push(''); lines.push(''); return cleanText(lines.join('\n'));}
    function htmlToText(html){var div=document.createElement('div'); div.innerHTML=String(html||''); Array.prototype.slice.call(div.querySelectorAll('script,style,.print-actions,button')).forEach(function(e){e.remove();}); Array.prototype.slice.call(div.querySelectorAll('.line')).forEach(function(e){e.textContent='\n--------------------------------\n';}); Array.prototype.slice.call(div.querySelectorAll('br')).forEach(function(e){e.replaceWith(document.createTextNode('\n'));}); return cleanText(div.innerText||div.textContent||'');}
    function nativePrint(text,opts){opts=opts||{}; var r=restaurant(); var payload=Object.assign({text:cleanText(text), logoDataUrl:r.logoDataUrl||'', logoText:r.logoText||r.name||'AUREA', feedDots:IS_IMIN?360:320, returnUrl:location.href},opts||{}); payload.text=cleanText(payload.text||text); if(!payload.text){status('Ticket vacío: no se mandó a imprimir'); return false;} if(window.AureaPosPrint&&window.AureaPosPrint.printPayload){ window.AureaPosPrint.printPayload(JSON.stringify(payload)); status((IS_IMIN?'iMin':'Android')+' enviando ticket...'); return true;} status('AureaPosPrint no disponible'); return false;}

    var originalOpen=window.open;
    window.open=function(url,name,features){
      if(!url||String(url)===''){
        var chunks=[];
        var fake={document:{open:function(){chunks=[];},write:function(h){chunks.push(String(h||''));},close:function(){setTimeout(function(){nativePrint(htmlToText(chunks.join('')),{});},30);}},focus:function(){},print:function(){nativePrint(htmlToText(chunks.join('')),{});},close:function(){}};
        return fake;
      }
      return originalOpen?originalOpen.apply(window,arguments):null;
    };
    window.print=function(){return nativePrint(htmlToText(document.body?document.body.innerHTML:''),{})};

    window.AureaPrintBridge={
      isAndroid:function(){return true;}, mode:function(){return 'bridge';}, setMode:function(){localStorage.setItem(PRINT_MODE_KEY,'bridge');return 'bridge';}, shouldUseBridge:function(){return true;},
      cleanText:cleanText,line:line,center:center,wrapText:wrapText,row:row,money:money,charsForWidth:charsForWidth,
      buildOrderTicketText:buildOrderTicketText,buildBillTicketText:buildBillTicketText,
      nativePayloadAvailable:function(){return !!(window.AureaPosPrint&&window.AureaPosPrint.printPayload);},
      printPayload:function(payload,options){payload=payload||{}; return nativePrint(payload.text||'',Object.assign({},options||{},payload));},
      printText:function(text,options){return nativePrint(text,options||{});},
      printTextIfBridge:function(text,options){return nativePrint(text,options||{});},
      openBluetoothBridgeConfig:function(){try{if(window.AureaPosPrint&&window.AureaPosPrint.openPrintBridgeConfig){window.AureaPosPrint.openPrintBridgeConfig(); return true;}}catch(e){} return false;},
      startBluetoothBridge:function(){try{if(window.AureaPosPrint&&window.AureaPosPrint.startPrintBridge){window.AureaPosPrint.startPrintBridge(); return true;}}catch(e){} return false;},
      stopBluetoothBridge:function(){try{if(window.AureaPosPrint&&window.AureaPosPrint.stopPrintBridge){window.AureaPosPrint.stopPrintBridge(); return true;}}catch(e){} return false;},
      getBluetoothBridgeDeviceId:function(){try{if(window.AureaPosPrint&&window.AureaPosPrint.getBridgeDeviceId){return window.AureaPosPrint.getBridgeDeviceId();}}catch(e){} return ''; }
    };
    console.log('Aurea POS bridge v0.9.6 comandas seguras activo. iMin USB nativo='+IS_IMIN);
    status(IS_IMIN?'iMin USB listo · POS real':'Android listo · usa Puente BT para impresoras externas');
  } catch(e) {
    console.log('Aurea POS patch error', e);
    try{ if(window.AureaPosPrint&&window.AureaPosPrint.setStatus){window.AureaPosPrint.setStatus('Patch error: '+e.message);} }catch(x){}
  }
})();
