package com.admgaffidigital.poskasirtoko;

import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    private static final String RAWBT_PACKAGE = "ru.a402d.rawbtprinter";
    private static final String RAWBT_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=" + RAWBT_PACKAGE;
    private AlertDialog nativeExitDialog;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // Tuning performa WebView Android: DOM Storage & Cache aktif + hilangkan overscroll jank
            try {
                WebSettings ws = webView.getSettings();
                ws.setDomStorageEnabled(true);
                ws.setDatabaseEnabled(true);
                ws.setCacheMode(WebSettings.LOAD_DEFAULT);
                webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            } catch (Exception ignored) {
            }

            // Daftarkan native bridge agar JS dapat berkomunikasi langsung dengan RawBT, Bluetooth & Lifecycle Android
            webView.addJavascriptInterface(new RawBTBridge(this), "AndroidRawBT");
            webView.addJavascriptInterface(new AppLifecycleBridge(this), "AndroidApp");

            // Tangani URI intent:, rawbt:, market:, whatsapp:, tel:, mailto: secara native di WebView
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request != null && request.getUrl() != null) {
                        String url = request.getUrl().toString();
                        if (handleExternalScheme(url)) {
                            return true;
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    if (handleExternalScheme(url)) {
                        return true;
                    }
                    return super.shouldOverrideUrlLoading(view, url);
                }
            });
        }

        // Intersep tombol & gestur Kembali Android secara native (prioritas tertinggi LIFO)
        // Menjamin setiap tekanan Back menutup lapisan UI berurutan & selalu menampilkan dialog keluar di halaman utama
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView currentWebView = getBridge() != null ? getBridge().getWebView() : null;
                if (currentWebView != null) {
                    currentWebView.evaluateJavascript(
                        "(function(){ if (typeof window.__posHandleNativeBack === 'function') { window.__posHandleNativeBack(); return 'HANDLED'; } return 'UNREADY'; })()",
                        result -> {
                            if (result == null || !result.contains("HANDLED")) {
                                showNativeExitDialog();
                            }
                        }
                    );
                } else {
                    showNativeExitDialog();
                }
            }
        });
    }

    /**
     * Dialog konfirmasi keluar native Android (fallback jika WebView/JS belum selesai dimuat saat Back ditekan).
     */
    private void showNativeExitDialog() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) {
                return;
            }
            if (nativeExitDialog != null && nativeExitDialog.isShowing()) {
                nativeExitDialog.dismiss();
                return;
            }
            nativeExitDialog = new AlertDialog.Builder(this)
                .setTitle("Keluar dari Aplikasi?")
                .setMessage("Apakah Anda yakin ingin menutup aplikasi POS Kasir Toko?")
                .setNegativeButton("Batal", (dialog, which) -> dialog.dismiss())
                .setPositiveButton("Ya, Tutup Aplikasi", (dialog, which) -> {
                    dialog.dismiss();
                    exitAppCleanly();
                })
                .setCancelable(true)
                .create();
            nativeExitDialog.show();
        });
    }

    private void exitAppCleanly() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                finishAndRemoveTask();
            } else {
                finishAffinity();
            }
        } catch (Exception e) {
            try {
                finish();
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * Intersep skema non-HTTP di WebView agar tidak memicu ERR_UNKNOWN_URL_SCHEME.
     */
    private boolean handleExternalScheme(String url) {
        if (url == null || url.isEmpty()) {
            return false;
        }

        try {
            if (url.startsWith("rawbt:")) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.setPackage(RAWBT_PACKAGE);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    openPlayStoreForPackage(this, RAWBT_PACKAGE);
                }
                return true;
            }

            if (url.startsWith("intent:")) {
                Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                    if (fallbackUrl != null && !fallbackUrl.isEmpty()) {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    } else if (intent.getPackage() != null) {
                        openPlayStoreForPackage(this, intent.getPackage());
                    }
                }
                return true;
            }

            if (url.startsWith("market:") || url.startsWith("whatsapp:") || url.startsWith("tel:") || url.startsWith("mailto:")
                || url.startsWith("https://wa.me/") || url.startsWith("http://wa.me/")
                || url.startsWith("https://api.whatsapp.com/") || url.startsWith("https://play.google.com/")) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            }
        } catch (Exception ignored) {
            return true;
        }

        return false;
    }

    private static boolean isPackageInstalled(Context ctx, String pkgName) {
        try {
            PackageManager pm = ctx.getPackageManager();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(pkgName, PackageManager.PackageInfoFlags.of(0));
            } else {
                pm.getPackageInfo(pkgName, 0);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static void openPlayStoreForPackage(Activity activity, String pkgName) {
        activity.runOnUiThread(() -> {
            try {
                Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkgName));
                marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(marketIntent);
            } catch (Exception e) {
                try {
                    Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkgName));
                    webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(webIntent);
                } catch (Exception ignored) {
                }
            }
        });
    }

    /**
     * JavaScript Interface native (`window.AndroidRawBT`) untuk koneksi & cetak RawBT yang stabil di APK.
     */
    private static class RawBTBridge {
        private final Activity activity;

        RawBTBridge(Activity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public boolean isRawBTInstalled() {
            return isPackageInstalled(activity, RAWBT_PACKAGE);
        }

        @JavascriptInterface
        public boolean isBluetoothEnabled() {
            try {
                BluetoothAdapter adapter = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    BluetoothManager manager = (BluetoothManager) activity.getSystemService(Context.BLUETOOTH_SERVICE);
                    if (manager != null) {
                        adapter = manager.getAdapter();
                    }
                }
                if (adapter == null) {
                    adapter = BluetoothAdapter.getDefaultAdapter();
                }
                return adapter != null && adapter.isEnabled();
            } catch (Exception e) {
                return true;
            }
        }

        @JavascriptInterface
        public String openRawBT() {
            if (!isPackageInstalled(activity, RAWBT_PACKAGE)) {
                openPlayStoreForPackage(activity, RAWBT_PACKAGE);
                return "NOT_INSTALLED";
            }

            try {
                Intent launchIntent = activity.getPackageManager().getLaunchIntentForPackage(RAWBT_PACKAGE);
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.runOnUiThread(() -> {
                        try {
                            activity.startActivity(launchIntent);
                        } catch (Exception ignored) {
                        }
                    });
                    return "OK";
                }
            } catch (Exception e) {
                return "ERROR:" + e.getMessage();
            }

            openPlayStoreForPackage(activity, RAWBT_PACKAGE);
            return "NOT_INSTALLED";
        }

        @JavascriptInterface
        public boolean openPlayStoreRawBT() {
            openPlayStoreForPackage(activity, RAWBT_PACKAGE);
            return true;
        }

        @JavascriptInterface
        public boolean openBluetoothSettings() {
            activity.runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(intent);
                } catch (Exception ignored) {
                }
            });
            return true;
        }

        @JavascriptInterface
        public String printBase64(String base64Data) {
            if (!isPackageInstalled(activity, RAWBT_PACKAGE)) {
                openPlayStoreForPackage(activity, RAWBT_PACKAGE);
                return "NOT_INSTALLED";
            }
            if (base64Data == null || base64Data.trim().isEmpty()) {
                return "ERROR:EMPTY_DATA";
            }

            final String cleanBase64 = base64Data.replaceAll("\\s+", "");
            try {
                final Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("rawbt:base64," + cleanBase64));
                intent.setPackage(RAWBT_PACKAGE);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                activity.runOnUiThread(() -> {
                    try {
                        activity.startActivity(intent);
                    } catch (Exception fallbackErr) {
                        try {
                            Intent altIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("rawbt:data:base64," + cleanBase64));
                            altIntent.setPackage(RAWBT_PACKAGE);
                            altIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            activity.startActivity(altIntent);
                        } catch (Exception ignored) {
                        }
                    }
                });
                return "OK";
            } catch (Exception e) {
                return "ERROR:" + e.getMessage();
            }
        }
    }

    /**
     * Bridge native (`window.AndroidApp`) untuk penutupan aplikasi, cetak PDF/Android PrintManager,
     * simpan & bagikan file ekspor (CSV/Excel/JSON), serta membuka tautan eksternal (WhatsApp/Browser).
     */
    private static class AppLifecycleBridge {
        private final Activity activity;
        private WebView activePrintWebView;

        AppLifecycleBridge(Activity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void exitApp() {
            activity.runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        activity.finishAndRemoveTask();
                    } else {
                        activity.finishAffinity();
                    }
                } catch (Exception e) {
                    try {
                        activity.finish();
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean openExternalUrl(String url) {
            if (url == null || url.trim().isEmpty()) return false;
            activity.runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(intent);
                } catch (Exception ignored) {
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean printHtml(String htmlContent, String jobName) {
            if (htmlContent == null || htmlContent.trim().isEmpty()) return false;
            final String safeJobName = (jobName != null && !jobName.trim().isEmpty())
                ? jobName.trim()
                : "POS Kasir Toko";

            activity.runOnUiThread(() -> {
                try {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    WebView printView = new WebView(activity);
                    printView.getSettings().setJavaScriptEnabled(false);
                    printView.getSettings().setAllowFileAccess(false);
                    printView.getSettings().setLoadsImagesAutomatically(true);
                    activePrintWebView = printView;

                    printView.setWebViewClient(new WebViewClient() {
                        @Override
                        public void onPageFinished(WebView view, String url) {
                            try {
                                PrintManager pm = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                                if (pm != null) {
                                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(safeJobName);
                                    PrintAttributes attrs = new PrintAttributes.Builder()
                                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                        .build();
                                    pm.print(safeJobName, adapter, attrs);
                                }
                            } catch (Exception ignored) {
                            } finally {
                                activePrintWebView = null;
                            }
                        }
                    });
                    printView.loadDataWithBaseURL("https://localhost/", htmlContent, "text/html", "UTF-8", null);
                } catch (Exception ignored) {
                    activePrintWebView = null;
                }
            });
            return true;
        }

        @JavascriptInterface
        public String saveAndShareFile(String filename, String mimeType, String base64Content) {
            if (filename == null || filename.trim().isEmpty() || base64Content == null) {
                return "ERROR:INVALID_ARGS";
            }
            final String safeName = filename.trim().replaceAll("[^a-zA-Z0-9._-]", "_");
            final String safeMime = (mimeType != null && !mimeType.trim().isEmpty())
                ? mimeType.split(";")[0].trim()
                : "application/octet-stream";

            try {
                final byte[] bytes = Base64.decode(base64Content, Base64.DEFAULT);

                // 1. Simpan salinan permanen ke folder Downloads (Android 10+ / API 29+ tanpa izin penyimpanan)
                boolean savedToDownloads = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                        values.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/POSKasirToko");
                        ContentResolver resolver = activity.getContentResolver();
                        Uri dlUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (dlUri != null) {
                            try (OutputStream os = resolver.openOutputStream(dlUri)) {
                                if (os != null) {
                                    os.write(bytes);
                                    os.flush();
                                    savedToDownloads = true;
                                }
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }

                // 2. Tulis ke cache FileProvider lalu buka dialog Bagikan / Buka File Android
                File exportDir = new File(activity.getCacheDir(), "exports");
                if (!exportDir.exists()) exportDir.mkdirs();
                File outFile = new File(exportDir, safeName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(bytes);
                    fos.flush();
                }

                Uri contentUri = FileProvider.getUriForFile(
                    activity,
                    activity.getPackageName() + ".fileprovider",
                    outFile
                );

                final Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType(safeMime);
                shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                activity.runOnUiThread(() -> {
                    try {
                        Intent chooser = Intent.createChooser(shareIntent, "Simpan / Bagikan " + safeName);
                        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(chooser);
                    } catch (Exception ignored) {
                    }
                });

                return savedToDownloads ? "OK_DOWNLOADS" : "OK_SHARE";
            } catch (Exception e) {
                return "ERROR:" + e.getMessage();
            }
        }
    }
}
