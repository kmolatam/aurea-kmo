package com.aurea.print;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.net.Uri;

public class BridgeService extends Service {
    private static final int NOTIF_ID = 2407;
    private static final String CHANNEL_ID = "aurea_bridge_silent_v0962";
    private volatile boolean running = false;
    private Thread worker;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? BridgeCore.ACTION_START : intent.getAction();
        if (BridgeCore.ACTION_STOP.equals(action)) {
            stopBridge();
            stopSelf();
            return START_NOT_STICKY;
        }
        startForeground(NOTIF_ID, buildNotification("Activo, esperando comandas"));
        if (BridgeCore.ACTION_ONCE.equals(action)) {
            runOnceAsync();
        } else {
            startBridge();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopBridge();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void startBridge() {
        if (running) return;
        running = true;
        acquireWakeLock();
        SharedPreferences p = BridgeCore.prefs(this);
        p.edit().putBoolean("service_running", true).putString("last_status", "Puente activo").apply();
        worker = new Thread(() -> {
            log("Servicio persistente iniciado. Device ID: " + BridgeCore.getOrCreateDeviceId(this));
            while (running) {
                try {
                    int count = BridgeCore.pollAndPrintOnce(this, this::log);
                    if (count == 0) setStatus("Activo, sin pendientes - " + BridgeCore.now());
                    else setStatus("Activo, impresos: " + count + " - " + BridgeCore.now());
                    BridgeCore.sleepQuiet(2000);
                } catch (Exception e) {
                    log("Error ciclo servicio: " + e.getMessage());
                    BridgeCore.sleepQuiet(3000);
                }
            }
            log("Servicio persistente detenido.");
        });
        worker.start();
    }

    private void stopBridge() {
        running = false;
        SharedPreferences p = BridgeCore.prefs(this);
        p.edit().putBoolean("service_running", false).putString("last_status", "Puente detenido").apply();
        releaseWakeLock();
    }

    private void runOnceAsync() {
        new Thread(() -> {
            try {
                int count = BridgeCore.pollAndPrintOnce(this, this::log);
                log("Búsqueda manual terminada. Impresos: " + count);
            } catch (Exception e) {
                log("Error búsqueda manual: " + e.getMessage());
            }
            stopSelf();
        }).start();
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AureaPrintBridge::WakeLock");
                wakeLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
        wakeLock = null;
    }

    private void log(String message) {
        SharedPreferences p = BridgeCore.prefs(this);
        String line = BridgeCore.now() + " - " + message + "\n";
        String current = p.getString("service_log", "Logs servicio:\n");
        String next = current + line;
        if (next.length() > 20000) next = "Logs servicio:\n" + next.substring(next.length() - 18000);
        p.edit().putString("service_log", next).putString("last_status", message).apply();
        updateNotification(message);
    }

    private void setStatus(String status) {
        BridgeCore.prefs(this).edit().putString("last_status", status).apply();
        updateNotification(status);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Áurea Print Bridge silencioso", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Mantiene activo el puente de impresión de Áurea sin sonido ni vibración.");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setVibrationPattern(new long[]{0L});
            channel.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, BridgeActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        boolean error = BridgeCore.hasLocalError(this);
        String title = error ? "ERROR DE IMPRESIÓN ÁUREA" : "Áurea Print Bridge activo";
        String body = error
                ? BridgeCore.prefs(this).getString(BridgeCore.KEY_LAST_ERROR, text)
                : text;
        b.setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setSmallIcon(error ? android.R.drawable.stat_notify_error : android.R.drawable.stat_sys_upload_done)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setDefaults(0)
                .setVibrate(new long[]{0L})
                .setSound(null);
        if (Build.VERSION.SDK_INT >= 26) {
            b.setBadgeIconType(Notification.BADGE_ICON_NONE);
        }
        if (Build.VERSION.SDK_INT >= 26) {
            b.setSilent(true);
        }
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_LOW);
        }
        return b.build();
    }

    private void updateNotification(String text) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotification(text));
        } catch (Exception ignored) {}
    }
}
