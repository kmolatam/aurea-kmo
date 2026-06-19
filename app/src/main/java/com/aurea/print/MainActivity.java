package com.aurea.print;

import android.app.Activity;
import android.net.Uri;
import android.content.Intent;
import android.content.SharedPreferences;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Typeface;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.lang.reflect.Method;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.nio.charset.Charset;
import java.util.Map;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;

public class MainActivity extends Activity {
    private static final String PREFS = "aurea_pos_prefs";
    private static final String KEY_URL = "aurea_url";
    private static final String DEFAULT_URL = "https://aurea.kmo.lat/staff.html?pos=1&print=bridge&posui=compact&fresh=0.9.6";

    private TextView status;
    private EditText urlInput;
    private WebView webView;
    private LinearLayout topBar;
    private Button floatingMenuButton;

    private final int PAGE_WIDTH = 384; // Urovo i9100 / 58mm aprox
    private final int NO_ROTATE = 0;
    private final int DEFAULT_FEED_DOTS = 300; // aprox 3cm para evitar cortes al final
    private static final String ACTION_USB_PERMISSION = "com.aurea.print.USB_PERMISSION";
    private UsbManager usbManager;
    private String pendingUsbTicket = null;
    private String pendingUsbLogoText = null;
    private int pendingUsbFeedDots = DEFAULT_FEED_DOTS;


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);
        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
        registerUsbReceiver();
        buildKioskUi();
        handleIncomingIntent(getIntent(), true);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent, false);
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(usbReceiver); } catch (Exception ignored) {}
        super.onDestroy();
    }

    private void buildKioskUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xff0b0b0d);

        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.VERTICAL);
        topBar.setPadding(10, 10, 10, 8);
        topBar.setBackgroundColor(0xff151519);
        root.addView(topBar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.aurea_apk_logo);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(58), dp(58));
        logoParams.gravity = Gravity.CENTER_HORIZONTAL;
        logoParams.bottomMargin = 4;
        topBar.addView(logo, logoParams);

        TextView title = new TextView(this);
        title.setText("Áurea POS · v0.9.6 Comandas seguras");
        title.setTextSize(14);
        title.setTextColor(0xfff5f1e8);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        topBar.addView(title);

        urlInput = new EditText(this);
        urlInput.setSingleLine(true);
        urlInput.setText(loadSavedUrl());
        urlInput.setTextColor(0xff111111);
        urlInput.setTextSize(11);
        topBar.addView(urlInput, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        row1.setGravity(Gravity.CENTER);
        topBar.addView(row1);

        Button adminBtn = smallButton("Admin");
        Button staffBtn = smallButton("Meseros");
        Button kitchenBtn = smallButton("Cocina");
        Button reloadBtn = smallButton("Recargar");
        row1.addView(adminBtn);
        row1.addView(staffBtn);
        row1.addView(kitchenBtn);
        row1.addView(reloadBtn);

        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        row2.setGravity(Gravity.CENTER);
        topBar.addView(row2);

        Button goBtn = smallButton("Ir URL");
        Button testBtn = smallButton("Test print");
        Button bridgeBtn = smallButton("Forzar print");
        Button hideBtn = smallButton("Ocultar barra");
        row2.addView(goBtn);
        row2.addView(testBtn);
        row2.addView(bridgeBtn);
        row2.addView(hideBtn);

        LinearLayout row3 = new LinearLayout(this);
        row3.setOrientation(LinearLayout.HORIZONTAL);
        row3.setGravity(Gravity.CENTER);
        topBar.addView(row3);

        Button bridgeConfigBtn = smallButton("Puente BT");
        Button bridgeStartBtn = smallButton("Puente ON");
        Button bridgeStopBtn = smallButton("Puente OFF");
        Button bridgeOnceBtn = smallButton("Buscar jobs");
        row3.addView(bridgeConfigBtn);
        row3.addView(bridgeStartBtn);
        row3.addView(bridgeStopBtn);
        row3.addView(bridgeOnceBtn);

        status = new TextView(this);
        status.setText("Listo. Barra oculta por defecto.");
        status.setTextColor(0xffc9a44c);
        status.setTextSize(12);
        status.setPadding(3, 5, 3, 0);
        topBar.addView(status);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setTextZoom(100);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        webView.addJavascriptInterface(new AureaJsBridge(), "AureaPosPrint");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injectCompatibilityPatch();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request != null && request.getUrl() != null ? request.getUrl().toString() : "";
                return handleSpecialUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleSpecialUrl(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                setStatus("Áurea cargado: " + shortUrl(url));
                injectCompatibilityPatch();
                if (isIminDevice()) injectIminJsSdk();
                injectNativePrintPatch();
            }
        });

        root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1
        ));

        setContentView(root);

        // POS real: oculto por defecto para no quitar espacio a Admin/Meseros/Cocina.
        topBar.setVisibility(View.GONE);
        addFloatingMenuButton();

        adminBtn.setOnClickListener(v -> loadPath("/admin.html"));
        staffBtn.setOnClickListener(v -> loadPath("/staff.html"));
        kitchenBtn.setOnClickListener(v -> loadPath("/kitchen.html"));
        reloadBtn.setOnClickListener(v -> webView.reload());
        goBtn.setOnClickListener(v -> loadUrlAndSave(urlInput.getText().toString()));
        testBtn.setOnClickListener(v -> testPrint());
        bridgeBtn.setOnClickListener(v -> injectNativePrintPatch());
        bridgeConfigBtn.setOnClickListener(v -> openBridgeConfig());
        bridgeStartBtn.setOnClickListener(v -> startIntegratedBridge(false));
        bridgeStopBtn.setOnClickListener(v -> stopIntegratedBridge());
        bridgeOnceBtn.setOnClickListener(v -> startIntegratedBridge(true));
        hideBtn.setOnClickListener(v -> {
            topBar.setVisibility(View.GONE);
            Toast.makeText(this, "Barra oculta. Toca ⋯ o Atrás para mostrarla.", Toast.LENGTH_LONG).show();
        });
    }

    private void openBridgeConfig() {
        try {
            startActivity(new Intent(this, BridgeActivity.class));
        } catch (Exception e) {
            setStatus("No pude abrir configuración puente: " + e.getMessage());
        }
    }

    private void startIntegratedBridge(boolean once) {
        try {
            Intent svc = new Intent(this, BridgeService.class);
            svc.setAction(once ? BridgeCore.ACTION_ONCE : BridgeCore.ACTION_START);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc);
            else startService(svc);
            setStatus(once ? "Buscando trabajos de impresión..." : "Puente Bluetooth activo en segundo plano");
        } catch (Exception e) {
            setStatus("No pude iniciar puente: " + e.getMessage());
        }
    }

    private void stopIntegratedBridge() {
        try {
            Intent svc = new Intent(this, BridgeService.class);
            svc.setAction(BridgeCore.ACTION_STOP);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc);
            else startService(svc);
            setStatus("Puente Bluetooth detenido");
        } catch (Exception e) {
            setStatus("No pude detener puente: " + e.getMessage());
        }
    }


    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void addFloatingMenuButton() {
        try {
            floatingMenuButton = new Button(this);
            floatingMenuButton.setText("⋯");
            floatingMenuButton.setTextSize(18);
            floatingMenuButton.setAllCaps(false);
            floatingMenuButton.setPadding(0, 0, 0, 0);
            floatingMenuButton.setAlpha(0.72f);
            floatingMenuButton.setBackgroundColor(0xaa151519);
            floatingMenuButton.setTextColor(0xfff5f1e8);
            floatingMenuButton.setOnClickListener(v -> {
                if (topBar == null) return;
                if (topBar.getVisibility() == View.GONE) {
                    topBar.setVisibility(View.VISIBLE);
                    Toast.makeText(this, "Barra POS visible", Toast.LENGTH_SHORT).show();
                } else {
                    topBar.setVisibility(View.GONE);
                    Toast.makeText(this, "Barra POS oculta", Toast.LENGTH_SHORT).show();
                }
            });
            FrameLayout.LayoutParams fp = new FrameLayout.LayoutParams(dp(42), dp(34), Gravity.TOP | Gravity.RIGHT);
            fp.setMargins(0, dp(5), dp(5), 0);
            addContentView(floatingMenuButton, fp);
        } catch (Exception ignored) {}
    }

    private Button smallButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(12);
        b.setAllCaps(false);
        b.setPadding(6, 3, 6, 3);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        lp.setMargins(3, 4, 3, 0);
        b.setLayoutParams(lp);
        return b;
    }

    private String loadSavedUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        return prefs.getString(KEY_URL, DEFAULT_URL);
    }

    private void saveUrl(String url) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, url).apply();
    }

    private void loadUrlAndSave(String raw) {
        String url = normalizeUrl(raw);
        urlInput.setText(url);
        saveUrl(url);
        setStatus("Cargando " + shortUrl(url));
        try { webView.clearCache(false); } catch (Exception ignored) {}
        webView.loadUrl(url);
    }

    private void loadPath(String path) {
        String origin = originFromUrl(urlInput.getText().toString());
        String glue = path.contains("?") ? "&" : "?";
        loadUrlAndSave(origin + path + glue + "pos=1&print=bridge&posui=compact&fresh=0.9.6");
    }

    private String normalizeUrl(String raw) {
        String value = String.valueOf(raw == null ? "" : raw).trim();
        if (value.length() == 0) value = DEFAULT_URL;
        if (!value.startsWith("http://") && !value.startsWith("https://")) value = "https://" + value;
        return value;
    }

    private String originFromUrl(String raw) {
        try {
            Uri uri = Uri.parse(normalizeUrl(raw));
            String scheme = uri.getScheme() == null ? "https" : uri.getScheme();
            String host = uri.getHost();
            if (host == null || host.length() == 0) return "https://aurea.kmo.lat";
            String port = uri.getPort() > 0 ? ":" + uri.getPort() : "";
            return scheme + "://" + host + port;
        } catch (Exception e) {
            return "https://aurea.kmo.lat";
        }
    }

    private String shortUrl(String url) {
        if (url == null) return "";
        return url.length() > 72 ? url.substring(0, 69) + "..." : url;
    }

    private void handleIncomingIntent(Intent intent, boolean firstLoad) {
        Uri data = intent != null ? intent.getData() : null;
        if (data != null && "aureaprint".equals(data.getScheme())) {
            String text = data.getQueryParameter("text");
            String returnUrl = data.getQueryParameter("returnUrl");
            if (text != null && text.trim().length() > 0) {
                print(text, "", "", DEFAULT_FEED_DOTS);
                if (returnUrl != null && returnUrl.trim().length() > 0) {
                    loadUrlAndSave(returnUrl);
                    return;
                }
            }
        }
        if (firstLoad) loadUrlAndSave(loadSavedUrl());
    }

    private boolean handleSpecialUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("intent://print") || url.startsWith("aureaprint://print")) {
            Uri uri = uriFromAureaPrintUrl(url);
            if (uri != null) {
                String text = uri.getQueryParameter("text");
                String returnUrl = uri.getQueryParameter("returnUrl");
                if (text != null && text.trim().length() > 0) {
                    print(text, "", "", DEFAULT_FEED_DOTS);
                    if (returnUrl != null && returnUrl.trim().length() > 0) {
                        urlInput.setText(returnUrl);
                        saveUrl(returnUrl);
                    }
                } else {
                    setStatus("Solicitud de impresión sin texto.");
                }
            }
            return true;
        }
        return false;
    }

    private Uri uriFromAureaPrintUrl(String url) {
        try {
            if (url.startsWith("aureaprint://")) return Uri.parse(url);
            if (url.startsWith("intent://print")) {
                int hash = url.indexOf("#Intent");
                String beforeHash = hash >= 0 ? url.substring(0, hash) : url;
                String query = "";
                int q = beforeHash.indexOf('?');
                if (q >= 0) query = beforeHash.substring(q);
                return Uri.parse("aureaprint://print" + query);
            }
        } catch (Exception e) {
            setStatus("No pude leer URL de impresión: " + e.getMessage());
        }
        return null;
    }

    private void injectCompatibilityPatch() {
        String js =
            "(function(){try{" +
            "if(!String.prototype.replaceAll){String.prototype.replaceAll=function(search,replacement){var target=String(this); if(search instanceof RegExp){return target.replace(search,replacement);} return target.split(String(search)).join(String(replacement));};}" +
            "if(!Object.assign){Object.assign=function(t){if(t==null){throw new TypeError('Cannot convert undefined or null to object');} var to=Object(t); for(var i=1;i<arguments.length;i++){var n=arguments[i]; if(n!=null){for(var k in n){if(Object.prototype.hasOwnProperty.call(n,k)){to[k]=n[k];}}}} return to;};}" +
            "}catch(e){console.log('Aurea compat patch error',e);}})();";
        webView.evaluateJavascript(js, null);
    }

    private void injectIminJsSdk() {
        // v0.8.6 ya no depende del wrapper JS del SDK.
        // Usamos el protocolo WebSocket local del iMin directamente desde aurea-pos-bridge.js.
        setStatus("iMin USB preparado");
    }

    private String readAssetText(String name) throws Exception {
        InputStream is = getAssets().open(name);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = is.read(buffer)) != -1) bos.write(buffer, 0, read);
        is.close();
        return new String(bos.toByteArray(), "UTF-8");
    }

    private void testPrint() {
        print(defaultTicket(), "", "AUREA", DEFAULT_FEED_DOTS);
    }

    private void injectNativePrintPatch() {
        final boolean imin = isIminDevice();
        try {
            String js = readAssetText("aurea-pos-bridge.js").replace("__IS_IMIN__", imin ? "true" : "false");
            webView.evaluateJavascript(js, null);
            setStatus(imin ? "Puente iMin USB nativo activo" : "Áurea POS listo · usa Puente BT para impresoras externas");
        } catch (Exception e) {
            setStatus("No pude cargar puente POS: " + e.getMessage());
        }
    }

    public class AureaJsBridge {
        @JavascriptInterface
        public void printText(final String text) {
            new Thread(() -> print(text, "", "", DEFAULT_FEED_DOTS)).start();
        }

        @JavascriptInterface
        public void printPayload(final String json) {
            new Thread(() -> {
                try {
                    JSONObject obj = new JSONObject(json == null ? "{}" : json);
                    String text = obj.optString("text", "");
                    String logoDataUrl = obj.optString("logoDataUrl", "");
                    String logoText = obj.optString("logoText", "");
                    int feedDots = obj.optInt("feedDots", DEFAULT_FEED_DOTS);
                    print(text, logoDataUrl, logoText, feedDots);
                } catch (Exception e) {
                    print(json, "", "", DEFAULT_FEED_DOTS);
                }
            }).start();
        }

        @JavascriptInterface
        public void toast(final String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void setStatus(final String message) {
            runOnUiThread(() -> MainActivity.this.setStatus(message));
        }

        @JavascriptInterface
        public void openPrintBridgeConfig() {
            runOnUiThread(() -> openBridgeConfig());
        }

        @JavascriptInterface
        public void startPrintBridge() {
            runOnUiThread(() -> startIntegratedBridge(false));
        }

        @JavascriptInterface
        public void stopPrintBridge() {
            runOnUiThread(() -> stopIntegratedBridge());
        }

        @JavascriptInterface
        public String getBridgeDeviceId() {
            return BridgeCore.getOrCreateDeviceId(MainActivity.this);
        }
    }

    private String defaultTicket() {
        String date = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault()).format(new Date());
        return "        AUREA POS\n" +
                "--------------------------------\n" +
                "PRUEBA IMPRESION DIRECTA\n\n" +
                "Dispositivo: Android / Puente BT\n" +
                "Sistema: Aurea POS v0.9.6.1 sin Urovo forzado\n" +
                "Estado: OK\n" +
                "Fecha: " + date + "\n\n" +
                "1x Ticket de prueba\n" +
                "   Sin Chrome / Sin popup\n\n" +
                "--------------------------------\n" +
                "LISTO\n";
    }

    private void print(String ticket, String logoDataUrl, String logoText, int feedDots) {
        // v0.9.6.1: NO forzar Urovo en cualquier Android.
        // El error ClassNotFoundException android.device.PrinterManager sale cuando un equipo
        // no es Urovo y aun así se intenta usar la impresora interna Urovo.
        // Las comandas reales de barras se imprimen por BridgeCore vía Bluetooth.
        if (isIminDevice()) {
            if (!printImin(ticket, logoDataUrl, logoText, feedDots)) {
                runOnUiThread(() -> Toast.makeText(this, "iMin no imprimió; revisa mensaje amarillo", Toast.LENGTH_LONG).show());
            }
            return;
        }
        if (isUrovoPrinterAvailable()) {
            printUrovo(ticket, logoDataUrl, logoText, feedDots);
            return;
        }
        setStatus("Este equipo no tiene impresora interna Urovo/iMin. Para comandas usa Puente BT + impresoras Bluetooth.");
        runOnUiThread(() -> Toast.makeText(this, "Sin impresora interna. Usa Puente BT.", Toast.LENGTH_LONG).show());
    }

    private void printIminViaWebView(String ticket, String logoDataUrl, String logoText, int feedDots) {
        final String safeTicket = ticket == null ? "" : ticket;
        final String safeLogo = logoText == null || logoText.trim().isEmpty() ? "AUREA" : logoText.trim();
        final int safeFeed = feedDots <= 0 ? DEFAULT_FEED_DOTS : feedDots;
        runOnUiThread(() -> {
            try {
                injectNativePrintPatch();
                String js = "(function(){try{"
                        + "var t=" + JSONObject.quote(safeTicket) + ";"
                        + "var l=" + JSONObject.quote(safeLogo) + ";"
                        + "if(window.AureaPrintBridge&&window.AureaPrintBridge.printText){"
                        + "window.AureaPrintBridge.printText(t,{logoText:l,feedDots:" + safeFeed + "});"
                        + "}else if(window.AureaPosPrint){window.AureaPosPrint.setStatus('Puente iMin no listo');}"
                        + "}catch(e){if(window.AureaPosPrint){window.AureaPosPrint.setStatus('Test JS error: '+e.message);}}})();";
                webView.evaluateJavascript(js, null);
            } catch (Exception e) {
                setStatus("Error lanzando iMin SDK: " + e.getMessage());
            }
        });
    }

    private boolean isIminDevice() {
        String info = (Build.MANUFACTURER + " " + Build.BRAND + " " + Build.MODEL + " " + Build.DEVICE + " " + Build.PRODUCT).toLowerCase(Locale.ROOT);
        return info.contains("imin") || info.contains("i22") || info.contains("i22t01") || info.contains("falcon");
    }

    private boolean isUrovoPrinterAvailable() {
        try {
            Class.forName("android.device.PrinterManager");
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean printImin(String ticket, String logoDataUrl, String logoText, int feedDots) {
        // v0.8.9: Diagnosis demostró que Falcon 1 usa iMin_80_Printer por USB.
        // No dependemos de IminPrintUtils ni WebSocket: mandamos ESC/POS directo al endpoint USB.
        return printIminUsbEscPos(ticket, logoText, feedDots, false);
    }

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
            UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
            if (granted && device != null && pendingUsbTicket != null) {
                String t = pendingUsbTicket;
                String l = pendingUsbLogoText;
                int f = pendingUsbFeedDots;
                pendingUsbTicket = null;
                pendingUsbLogoText = null;
                new Thread(() -> printIminUsbEscPos(t, l, f, true)).start();
            } else {
                setStatus("Permiso USB iMin denegado o sin dispositivo.");
            }
        }
    };

    private void registerUsbReceiver() {
        try {
            IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(usbReceiver, filter);
            }
        } catch (Exception e) {
            setStatus("No pude registrar USB receiver: " + e.getMessage());
        }
    }

    private boolean printIminUsbEscPos(String ticket, String logoText, int feedDots, boolean afterPermission) {
        try {
            wakeIminUsbPrinterPower();
            UsbDevice device = findIminUsbPrinter();
            if (device == null) {
                setStatus("iMin USB: no encontré impresora. Devices: " + usbDeviceSummary());
                return false;
            }
            if (usbManager == null) usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
            if (!usbManager.hasPermission(device)) {
                pendingUsbTicket = ticket;
                pendingUsbLogoText = logoText;
                pendingUsbFeedDots = feedDots;
                PendingIntent pi = PendingIntent.getBroadcast(
                        this,
                        2108,
                        new Intent(ACTION_USB_PERMISSION).setPackage(getPackageName()),
                        Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0
                );
                usbManager.requestPermission(device, pi);
                setStatus("iMin USB encontrado. Autoriza permiso USB y vuelve a probar si no imprime solo.");
                return false;
            }

            UsbInterface intf = null;
            UsbEndpoint out = null;
            for (int i = 0; i < device.getInterfaceCount(); i++) {
                UsbInterface candidate = device.getInterface(i);
                UsbEndpoint candidateOut = null;
                for (int e = 0; e < candidate.getEndpointCount(); e++) {
                    UsbEndpoint ep = candidate.getEndpoint(e);
                    if (ep.getDirection() == UsbConstants.USB_DIR_OUT) candidateOut = ep;
                }
                if (candidateOut != null) {
                    intf = candidate;
                    out = candidateOut;
                    break;
                }
            }
            if (intf == null || out == null) {
                setStatus("iMin USB sin endpoint OUT. " + usbDeviceSummary());
                return false;
            }

            UsbDeviceConnection conn = usbManager.openDevice(device);
            if (conn == null) {
                setStatus("iMin USB: openDevice regresó null.");
                return false;
            }
            boolean claimed = conn.claimInterface(intf, true);
            if (!claimed) {
                conn.close();
                setStatus("iMin USB: no pude claimInterface.");
                return false;
            }

            try {
                byte[] payload = buildEscPosTicket(ticket, logoText, feedDots);
                int offset = 0;
                while (offset < payload.length) {
                    int size = Math.min(4096, payload.length - offset);
                    byte[] chunk = new byte[size];
                    System.arraycopy(payload, offset, chunk, 0, size);
                    int written = conn.bulkTransfer(out, chunk, size, 5000);
                    if (written < 0) {
                        setStatus("iMin USB bulkTransfer falló en offset " + offset);
                        return false;
                    }
                    offset += size;
                }
                setStatus("Ticket enviado a iMin USB ESC-POS v0.9.1 · " + device.getVendorId() + ":" + device.getProductId());
                runOnUiThread(() -> Toast.makeText(this, "Ticket enviado a iMin USB", Toast.LENGTH_SHORT).show());
                return true;
            } finally {
                try { conn.releaseInterface(intf); } catch (Exception ignored) {}
                try { conn.close(); } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            setStatus("Error iMin USB: " + e.getClass().getSimpleName() + " - " + rootMessage(e));
            return false;
        }
    }

    private UsbDevice findIminUsbPrinter() {
        if (usbManager == null) usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
        if (usbManager == null) return null;
        UsbDevice fallback = null;
        for (UsbDevice d : usbManager.getDeviceList().values()) {
            String man = d.getManufacturerName() == null ? "" : d.getManufacturerName().toLowerCase(Locale.ROOT);
            String prod = d.getProductName() == null ? "" : d.getProductName().toLowerCase(Locale.ROOT);
            int vid = d.getVendorId();
            int pid = d.getProductId();
            boolean byName = man.contains("imin") || prod.contains("imin") || prod.contains("printer") || prod.contains("80");
            boolean byKnownIds = (vid == 14569 && (pid == 4749 || pid == 4750)) || (vid == 1305 && pid == 8211);
            boolean hasPrinterInterface = false;
            for (int i = 0; i < d.getInterfaceCount(); i++) {
                if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) hasPrinterInterface = true;
            }
            if (byName || byKnownIds) return d;
            if (fallback == null && hasPrinterInterface) fallback = d;
        }
        return fallback;
    }

    private String usbDeviceSummary() {
        try {
            if (usbManager == null) usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
            if (usbManager == null) return "UsbManager null";
            StringBuilder sb = new StringBuilder();
            for (UsbDevice d : usbManager.getDeviceList().values()) {
                if (sb.length() > 0) sb.append(" | ");
                sb.append(d.getVendorId()).append(":").append(d.getProductId())
                  .append(" ").append(d.getManufacturerName()).append("/").append(d.getProductName())
                  .append(" ifaces=").append(d.getInterfaceCount());
            }
            return sb.length() == 0 ? "sin USB devices" : sb.toString();
        } catch (Exception e) {
            return "error listando USB: " + e.getMessage();
        }
    }

    private void wakeIminUsbPrinterPower() {
        // En Diagnosis se observó /sys/extcon-usb-gpio/usb_printer_power.
        // En apps normales puede fallar por permisos; se intenta sin depender de esto.
        try {
            Runtime.getRuntime().exec(new String[]{"sh", "-c", "echo 1 > /sys/extcon-usb-gpio/usb_printer_power"});
        } catch (Exception ignored) {}
    }

    private byte[] buildEscPosTicket(String ticket, String logoText, int feedDots) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        bos.write(new byte[]{0x1B, 0x40}); // init
        bos.write(new byte[]{0x1B, 0x61, 0x01}); // center
        bos.write(new byte[]{0x1D, 0x21, 0x11}); // double width/height
        writeEscText(bos, (logoText == null || logoText.trim().isEmpty() ? "AUREA" : logoText.trim()) + "\n");
        bos.write(new byte[]{0x1D, 0x21, 0x00});
        writeEscText(bos, "AUREA POS\n");
        bos.write(new byte[]{0x1B, 0x61, 0x00}); // left
        writeEscText(bos, "------------------------------------------------\n");
        String normalized = normalize(ticket);
        if (!normalized.endsWith("\n")) normalized += "\n";
        writeEscText(bos, normalized);
        writeEscText(bos, "------------------------------------------------\n");
        int lines = Math.max(4, Math.min(10, feedDots <= 0 ? 5 : feedDots / 60));
        bos.write(new byte[]{0x1B, 0x64, (byte) lines}); // feed n lines
        bos.write(new byte[]{0x1D, 0x56, 0x42, 0x00}); // partial cut
        return bos.toByteArray();
    }

    private void writeEscText(ByteArrayOutputStream bos, String text) throws Exception {
        String value = text == null ? "" : text;
        try {
            bos.write(value.getBytes(Charset.forName("GB18030")));
        } catch (Exception e) {
            bos.write(value.getBytes("UTF-8"));
        }
    }

    private boolean printIminText(Object printer, String text, float size, boolean bold, boolean underline) {
        if (text == null) text = "";
        if (!text.endsWith("\n")) text += "\n";
        if (tryCall(printer, "printText", new Class[]{String.class, float.class, boolean.class, boolean.class}, new Object[]{text, size, bold, underline})) return true;
        if (tryCall(printer, "printText", new Class[]{String.class, int.class}, new Object[]{text, 0})) return true;
        if (tryCall(printer, "printText", new Class[]{String.class}, new Object[]{text})) return true;
        return false;
    }

    private void forceBooleanField(Object target, String fieldName, boolean value) {
        if (target == null) return;
        try {
            java.lang.reflect.Field f = target.getClass().getDeclaredField(fieldName);
            f.setAccessible(true);
            f.setBoolean(target, value);
        } catch (Exception ignored) {}
    }

    private int getIminStatus(Object printer, Object connectType) {
        try {
            if (connectType != null) {
                Method m = printer.getClass().getMethod("getPrinterStatus", connectType.getClass());
                Object result = m.invoke(printer, connectType);
                if (result instanceof Integer) return (Integer) result;
            }
        } catch (Exception ignored) {}
        for (int t : new int[]{1, 0, 2}) {
            try {
                Method m = printer.getClass().getMethod("getPrinterStatus", int.class);
                Object result = m.invoke(printer, t);
                if (result instanceof Integer) return (Integer) result;
            } catch (Exception ignored) {}
        }
        return Integer.MIN_VALUE;
    }

    private String rootMessage(Exception e) {
        Throwable t = e;
        while (t.getCause() != null) t = t.getCause();
        return t.getMessage() != null ? t.getMessage() : String.valueOf(t);
    }

    private Object newIminPrinter() throws Exception {
        String[] classNames = new String[]{
                "com.sunmi.peripheral.printer.IminPrintUtils",
                "com.imin.printerlib.IminPrintUtils",
                "com.imin.printerlib.util.IminPrintUtils",
                "com.imin.printer.IminPrintUtils",
                "com.imin.library.IminPrintUtils",
                "com.imin.printerlibs.IminPrintUtils",
                "com.imin.print.IminPrintUtils"
        };
        Exception last = null;
        for (String name : classNames) {
            try {
                Class<?> cls = Class.forName(name);
                try {
                    Method getInstance = cls.getMethod("getInstance", android.content.Context.class);
                    return getInstance.invoke(null, this);
                } catch (Exception ignored) {}
                try {
                    Method getInstance = cls.getMethod("getInstance", Activity.class);
                    return getInstance.invoke(null, this);
                } catch (Exception ignored) {}
                try {
                    Method getInstance = cls.getMethod("getInstance");
                    return getInstance.invoke(null);
                } catch (Exception ignored) {}
            } catch (Exception e) { last = e; }
        }
        throw new ClassNotFoundException("IminPrintUtils no encontrado. SDK iMin no está en la app ni preinstalado. Copiar JAR/AAR oficial a app/libs si aparece este mensaje.", last);
    }

    private Object iminConnectType(String wanted) throws Exception {
        String[] enumNames = new String[]{
                "com.sunmi.peripheral.printer.IminPrintUtils$PrintConnectType",
                "com.imin.printerlib.IminPrintUtils$PrintConnectType",
                "com.imin.printerlib.util.IminPrintUtils$PrintConnectType",
                "com.imin.printer.IminPrintUtils$PrintConnectType",
                "com.imin.library.IminPrintUtils$PrintConnectType",
                "com.imin.printerlibs.IminPrintUtils$PrintConnectType",
                "com.imin.print.IminPrintUtils$PrintConnectType"
        };
        Exception last = null;
        for (String name : enumNames) {
            try {
                Class<?> enumClass = Class.forName(name);
                Object[] constants = enumClass.getEnumConstants();
                if (constants != null) {
                    for (Object c : constants) {
                        if (String.valueOf(c).equalsIgnoreCase(wanted)) return c;
                    }
                    return constants[0];
                }
            } catch (Exception e) { last = e; }
        }
        throw new ClassNotFoundException("PrintConnectType no encontrado", last);
    }

    private boolean tryCall(Object target, String methodName, Class<?>[] types, Object[] args) {
        try {
            Method m = target.getClass().getMethod(methodName, types);
            m.invoke(target, args);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void sleepQuiet(long ms) {
        try { Thread.sleep(ms); } catch (Exception ignored) {}
    }

    private void printUrovo(String ticket, String logoDataUrl, String logoText, int feedDots) {
        Object printer = null;
        try {
            printer = newPrinter();
            int ret = (Integer) call(printer, "open");
            if (ret != 0) {
                setStatus("No se pudo abrir impresora Urovo. open=" + ret);
                return;
            }

            call(printer, "setGrayLevel", new Class[]{int.class}, new Object[]{2});
            call(printer, "setSpeedLevel", new Class[]{int.class}, new Object[]{7});
            call(printer, "setupPage", new Class[]{int.class, int.class}, new Object[]{PAGE_WIDTH, -1});
            call(printer, "clearPage");

            int y = 0;
            y = drawLogoOrText(printer, logoDataUrl, logoText, y);
            String[] lines = normalize(ticket).split("\n");
            for (String line : lines) {
                boolean bold = isBoldLine(line);
                int fontSize = bold ? 25 : 22;
                int height = drawLineOfText(printer, line, 0, y, fontSize, bold);
                y += Math.max(height, fontSize + 7);
                if (line.length() == 0) y += 8;
            }

            call(printer, "paperFeed", new Class[]{int.class}, new Object[]{Math.max(20, Math.min(520, feedDots))});
            int printStatus = (Integer) call(printer, "printPage", new Class[]{int.class}, new Object[]{NO_ROTATE});
            setStatus("Ticket enviado a Urovo. status=" + printStatus);
            runOnUiThread(() -> Toast.makeText(this, "Ticket impreso", Toast.LENGTH_SHORT).show());
        } catch (Exception e) {
            setStatus("Error Urovo: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        } finally {
            try { if (printer != null) call(printer, "close"); } catch (Exception ignored) {}
        }
    }

    private int drawLogoOrText(Object printer, String logoDataUrl, String logoText, int y) {
        try {
            Bitmap logo = decodeLogo(logoDataUrl);
            if (logo != null) {
                Bitmap scaled = scaleLogo(logo, 240, 96);
                int x = Math.max(0, (PAGE_WIDTH - scaled.getWidth()) / 2);
                if (tryDrawBitmap(printer, scaled, x, y)) return y + scaled.getHeight() + 12;
            }
        } catch (Exception ignored) {}

        String label = logoText != null && logoText.trim().length() > 0 ? logoText.trim() : "";
        if (label.length() > 0) {
            try {
                int height = drawLineOfText(printer, centerText(label, 24), 0, y, 27, true);
                return y + Math.max(height, 35) + 6;
            } catch (Exception ignored) {}
        }
        return y;
    }

    private Bitmap decodeLogo(String dataUrl) {
        try {
            if (dataUrl == null || dataUrl.trim().length() == 0) return null;
            String raw = dataUrl.trim();
            int comma = raw.indexOf(',');
            if (comma >= 0) raw = raw.substring(comma + 1);
            byte[] bytes = Base64.decode(raw, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) { return null; }
    }

    private Bitmap scaleLogo(Bitmap bitmap, int maxWidth, int maxHeight) {
        int w = bitmap.getWidth();
        int h = bitmap.getHeight();
        if (w <= 0 || h <= 0) return bitmap;
        float scale = Math.min((float) maxWidth / (float) w, (float) maxHeight / (float) h);
        scale = Math.min(1.0f, Math.max(0.1f, scale));
        int newW = Math.max(1, Math.round(w * scale));
        int newH = Math.max(1, Math.round(h * scale));
        return Bitmap.createScaledBitmap(bitmap, newW, newH, true);
    }

    private boolean tryDrawBitmap(Object printer, Bitmap bitmap, int x, int y) {
        String[] names = new String[]{"drawBitmap", "drawBitmapEx", "drawImage"};
        for (String name : names) {
            try {
                Method m = printer.getClass().getMethod(name, Bitmap.class, int.class, int.class);
                m.invoke(printer, bitmap, x, y);
                return true;
            } catch (Exception ignored) {}
            try {
                Method m = printer.getClass().getMethod(name, Bitmap.class, int.class, int.class, int.class);
                m.invoke(printer, bitmap, x, y, NO_ROTATE);
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    private String centerText(String text, int width) {
        String clean = text == null ? "" : text.replace("\n", " ").trim();
        if (clean.length() >= width) return clean;
        int left = (width - clean.length()) / 2;
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < left; i++) out.append(' ');
        out.append(clean);
        return out.toString();
    }

    private boolean isBoldLine(String line) {
        String upper = String.valueOf(line == null ? "" : line).toUpperCase(Locale.ROOT);
        return upper.contains("AUREA") || upper.contains("ÁUREA") || upper.contains("COMANDA") || upper.contains("CUENTA") || upper.contains("COCINA") || upper.contains("BEBIDAS") || upper.contains("TOTAL") || upper.contains("PRUEBA");
    }

    private int drawLineOfText(Object printer, String line, int x, int y, int fontSize, boolean bold) throws Exception {
        Method m = printer.getClass().getMethod("drawText", String.class, int.class, int.class, String.class, int.class, boolean.class, boolean.class, int.class);
        Object result = m.invoke(printer, line, x, y, "", fontSize, bold, false, NO_ROTATE);
        return (Integer) result;
    }

    private String normalize(String text) {
        return text == null ? "" : text.replace("\r\n", "\n").replace("\r", "\n");
    }

    private Object newPrinter() throws Exception {
        Class<?> cls = Class.forName("android.device.PrinterManager");
        return cls.getConstructor().newInstance();
    }

    private Object call(Object target, String methodName) throws Exception {
        Method m = target.getClass().getMethod(methodName);
        return m.invoke(target);
    }

    private Object call(Object target, String methodName, Class<?>[] types, Object[] args) throws Exception {
        Method m = target.getClass().getMethod(methodName, types);
        return m.invoke(target, args);
    }

    private void setStatus(final String msg) {
        runOnUiThread(() -> { if (status != null) status.setText(msg); });
    }

    @Override
    public void onBackPressed() {
        if (topBar != null && topBar.getVisibility() == View.GONE) {
            topBar.setVisibility(View.VISIBLE);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
