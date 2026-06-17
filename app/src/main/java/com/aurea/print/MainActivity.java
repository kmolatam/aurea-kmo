package com.aurea.print;

import android.app.Activity;
import android.net.Uri;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.ScrollView;
import android.widget.Toast;

import java.lang.reflect.Method;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {
    private TextView status;
    private EditText textInput;
    private final int PAGE_WIDTH = 384; // 58mm @ 203dpi = 384 px aprox, según SDK Urovo
    private final int NO_ROTATE = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        handleDeepLink();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(28, 36, 28, 28);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Áurea Print");
        title.setTextSize(30);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Urovo i9100 · Bridge v0.2");
        subtitle.setTextSize(16);
        subtitle.setGravity(Gravity.CENTER_HORIZONTAL);
        subtitle.setPadding(0, 6, 0, 30);
        root.addView(subtitle);

        Button testBtn = new Button(this);
        testBtn.setText("IMPRIMIR PRUEBA ÁUREA");
        root.addView(testBtn);

        Button statusBtn = new Button(this);
        statusBtn.setText("REVISAR ESTADO DE IMPRESORA");
        root.addView(statusBtn);

        textInput = new EditText(this);
        textInput.setMinLines(8);
        textInput.setGravity(Gravity.TOP | Gravity.START);
        textInput.setText(defaultTicket());
        root.addView(textInput);

        Button printTextBtn = new Button(this);
        printTextBtn.setText("IMPRIMIR TEXTO DE ARRIBA");
        root.addView(printTextBtn);

        status = new TextView(this);
        status.setText("Listo para probar.");
        status.setTextSize(15);
        status.setPadding(0, 24, 0, 0);
        root.addView(status);

        setContentView(scroll);

        testBtn.setOnClickListener(v -> print(defaultTicket(), true, ""));
        printTextBtn.setOnClickListener(v -> print(textInput.getText().toString(), false, ""));
        statusBtn.setOnClickListener(v -> checkPrinterStatus());
    }

    private void handleDeepLink() {
        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (data != null && "aureaprint".equals(data.getScheme())) {
            String text = data.getQueryParameter("text");
            String returnUrl = data.getQueryParameter("returnUrl");
            boolean autoReturn = "1".equals(data.getQueryParameter("autoReturn")) || "true".equalsIgnoreCase(data.getQueryParameter("autoReturn"));
            if (text != null && text.trim().length() > 0) {
                textInput.setText(text);
                print(text, false, autoReturn ? returnUrl : "");
            }
        }
    }

    private String defaultTicket() {
        String date = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault()).format(new Date());
        return "        ÁUREA\n" +
                "------------------------\n" +
                "PRUEBA DE IMPRESIÓN\n\n" +
                "Dispositivo: Urovo i9100\n" +
                "Sistema: Áurea\n" +
                "Estado: OK\n" +
                "Fecha: " + date + "\n\n" +
                "Mesa: 4\n" +
                "Mesero: Juan\n\n" +
                "2x Hamburguesa\n" +
                "   Nota: sin cebolla\n" +
                "1x Agua mineral\n\n" +
                "------------------------\n" +
                "COCINA\n";
    }

    private void checkPrinterStatus() {
        try {
            Object printer = newPrinter();
            int openRet = (Integer) call(printer, "open");
            int st = (Integer) call(printer, "getStatus");
            call(printer, "close");
            setStatus("open=" + openRet + " | status=" + st + " | " + statusLabel(st));
        } catch (Exception e) {
            setStatus("Error revisando estado: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        }
    }

    private void print(String ticket, boolean sample, String returnUrl) {
        try {
            Object printer = newPrinter();
            int ret = (Integer) call(printer, "open");
            if (ret != 0) {
                setStatus("No se pudo abrir impresora. open=" + ret);
                return;
            }

            call(printer, "setGrayLevel", new Class[]{int.class}, new Object[]{2});
            call(printer, "setSpeedLevel", new Class[]{int.class}, new Object[]{7});
            call(printer, "setupPage", new Class[]{int.class, int.class}, new Object[]{PAGE_WIDTH, -1});
            call(printer, "clearPage");

            int y = 0;
            String[] lines = normalize(ticket).split("\\n");
            for (String line : lines) {
                boolean bold = line.contains("ÁUREA") || line.contains("AUREA") || line.contains("COMANDA") || line.contains("CUENTA") || line.contains("COCINA");
                int fontSize = bold ? 25 : 22;
                int height = drawLineOfText(printer, line, 0, y, fontSize, bold);
                y += Math.max(height, fontSize + 7);
                if (line.length() == 0) y += 8;
            }

            call(printer, "paperFeed", new Class[]{int.class}, new Object[]{20});
            int printStatus = (Integer) call(printer, "printPage", new Class[]{int.class}, new Object[]{NO_ROTATE});
            call(printer, "close");
            setStatus("Impresión enviada. status=" + printStatus + " | " + statusLabel(printStatus));
            Toast.makeText(this, "Áurea Print: ticket enviado", Toast.LENGTH_SHORT).show();
            scheduleReturnToAurea(returnUrl);
        } catch (Exception e) {
            setStatus("Error imprimiendo: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        }
    }

    private void scheduleReturnToAurea(String returnUrl) {
        if (returnUrl == null || returnUrl.trim().length() == 0) return;
        final String url = returnUrl.trim();
        setStatus("Ticket enviado. Regresando a AUREA...");
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                finish();
            } catch (Exception e) {
                setStatus("Impreso, pero no pude regresar: " + e.getMessage());
            }
        }, 900);
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

    private String statusLabel(int code) {
        switch (code) {
            case 0: return "OK / operación exitosa";
            case -1: return "Error general";
            default: return "Código del dispositivo";
        }
    }

    private void setStatus(final String msg) {
        runOnUiThread(() -> status.setText(msg));
    }
}
