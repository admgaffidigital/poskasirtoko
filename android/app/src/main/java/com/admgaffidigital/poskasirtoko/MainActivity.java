package com.admgaffidigital.poskasirtoko;

import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String RAWBT_PACKAGE = "ru.a402d.rawbtprinter";
    private static final String RAWBT_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=" + RAWBT_PACKAGE;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
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

            if (url.startsWith("market:") || url.startsWith("whatsapp:") || url.startsWith("tel:") || url.startsWith("mailto:")) {
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
                    Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(RAWBT_PLAY_STORE_URL));
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
     * Bridge native (`window.AndroidApp`) untuk penutupan aplikasi yang bersih setelah konfirmasi pengguna.
     */
    private static class AppLifecycleBridge {
        private final Activity activity;

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
    }
}
