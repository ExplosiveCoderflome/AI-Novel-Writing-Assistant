package com.ainovel.assistant;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;

import java.io.File;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends AppCompatActivity {

    private static final int NOTIF_PERM_REQUEST = 1001;
    public static final String ACTION_SERVER_READY = "com.ainovel.assistant.SERVER_READY";
    private WebView webView;
    private LinearLayout loadingLayout;
    private boolean frontendLoaded = false;
    private final BroadcastReceiver serverReadyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            loadFrontend();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 沉浸式：隐藏状态栏，前端内容占满全屏不被遮挡
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.hide(WindowInsetsCompat.Type.statusBars());
            insetsController.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        loadingLayout = findViewById(R.id.loading_layout);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        // 允许 file:// 页面访问 http://127.0.0.1:3000 的后端 API（跨域）
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        // WebView 下载（前端导出 a[download] / blob）→ 写入公共 Downloads/AINovel，
        // Android 10+ 通过 MediaStore 免权限写入，用户文件管理器直接可见
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                String fileName = parseDownloadFileName(contentDisposition, url);
                if (url.startsWith("blob:")) {
                    saveBlobDownload(url, fileName, mimetype);
                } else {
                    downloadToPublicStorage(url, userAgent, fileName, mimetype);
                }
            } catch (Exception e) {
                android.util.Log.e("AINOVEL", "download failed: " + e.getMessage());
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(android.webkit.WebView view, String url) {
                super.onPageFinished(view, url);
                // 注入安卓 App 标志：前端据此强制桌面布局（本 App 已固定横屏，
                // 不使用宽度断点判断移动端，避免低分辨率手机横屏误入移动布局）
                view.evaluateJavascript("window.__ANDROID_APP__ = true;", null);
            }
        });

        // 直接启动 Node 服务（前台服务在 Android 12+ 即使无通知权限也能运行，
        // 只是通知不可见；不阻塞在权限请求上，避免用户未授权导致服务永不启动）
        startNodeService();

        // 注册 server 就绪广播：node 服务监听 3000 后才加载前端，避免白屏/请求失败
        IntentFilter filter = new IntentFilter(ACTION_SERVER_READY);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(serverReadyReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(serverReadyReceiver, filter);
        }

        // 兜底：若 60 秒内广播未到达（如 node 已运行但日志未匹配），也尝试加载前端
        webView.postDelayed(() -> loadFrontend(), 60_000);
    }

    private void loadFrontend() {
        if (frontendLoaded) {
            return;
        }
        frontendLoaded = true;
        runOnUiThread(() -> {
            // 前端静态资源解压到 files/www，用 file:// 加载（不依赖后端存活）；
            // 后端 API 通过 http://127.0.0.1:3000 访问
            File wwwDir = new File(getFilesDir(), "www");
            File indexHtml = new File(wwwDir, "index.html");
            if (indexHtml.exists()) {
                webView.loadUrl("file://" + indexHtml.getAbsolutePath());
            } else {
                // 兜底：若前端未就绪，直接连后端（后端会返回 API 响应/404）
                webView.loadUrl("http://127.0.0.1:3000/");
            }
            // 隐藏 Loading，显示 WebView
            webView.setVisibility(View.VISIBLE);
            if (loadingLayout != null) {
                loadingLayout.setVisibility(View.GONE);
            }
        });
    }

    private void startNodeService() {
        try {
            startForegroundService(new Intent(this, NodeService.class));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIF_PERM_REQUEST) {
            startNodeService();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try {
            unregisterReceiver(serverReadyReceiver);
        } catch (Exception ignored) {
        }
    }

    // ---- 下载辅助（导出到公共 Downloads/AINovel）----

    private static String parseDownloadFileName(String contentDisposition, String url) {
        if (contentDisposition != null) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("filename\\*?=(?:UTF-8'')?\"?([^;\"]+)\"?").matcher(contentDisposition);
            if (m.find()) {
                try {
                    return java.net.URLDecoder.decode(m.group(1).trim(), "UTF-8");
                } catch (Exception ignored) {
                    return m.group(1).trim();
                }
            }
        }
        String path = url.contains("?") ? url.substring(0, url.indexOf("?")) : url;
        String name = path.substring(path.lastIndexOf("/") + 1);
        return name.isEmpty() ? "download.txt" : name;
    }

    /** 常规 URL 下载：流式写入公共 Downloads/AINovel（MediaStore，免权限） */
    private void downloadToPublicStorage(String url, String userAgent, String fileName, String mimetype) {
        new Thread(() -> {
            try {
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                conn.setRequestProperty("User-Agent", userAgent != null ? userAgent : "Mozilla/5.0");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                java.io.InputStream in = conn.getInputStream();
                writeToPublicDownloads(in, fileName, mimetype);
                in.close();
                conn.disconnect();
            } catch (Exception e) {
                android.util.Log.e("AINOVEL", "url download failed: " + e.getMessage());
            }
        }).start();
    }

    /** blob URL 下载：evaluateJavascript 取回 base64，解码写入公共目录 */
    private void saveBlobDownload(String blobUrl, String fileName, String mimetype) {
        webView.evaluateJavascript(
            "(async () => { const r = await fetch('" + blobUrl + "'); const b = await r.arrayBuffer(); " +
            "let bytes = new Uint8Array(b); let bin = ''; const chunk = 0x8000; " +
            "for (let i = 0; i < bytes.length; i += chunk) { bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)); } " +
            "return btoa(bin); })()",
            value -> {
                if (value == null || value.equals("null")) return;
                try {
                    String base64 = value.replaceAll("^\"|\"$", "");
                    byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                    writeToPublicDownloads(new java.io.ByteArrayInputStream(data), fileName, mimetype);
                } catch (Exception e) {
                    android.util.Log.e("AINOVEL", "blob download failed: " + e.getMessage());
                }
            });
    }

    /** 写入公共 Downloads/AINovel 目录（Android 10+ MediaStore 免权限） */
    private void writeToPublicDownloads(java.io.InputStream in, String fileName, String mimetype) {
        try {
            String type = mimetype != null ? mimetype : "application/octet-stream";
            android.content.ContentValues values = new android.content.ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, type);
            values.put(MediaStore.Downloads.RELATIVE_PATH, "Download/AINovel");
            android.net.Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            android.net.Uri item = getContentResolver().insert(collection, values);
            if (item == null) {
                android.util.Log.e("AINOVEL", "MediaStore insert failed for " + fileName);
                return;
            }
            java.io.OutputStream out = getContentResolver().openOutputStream(item);
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
            out.flush();
            out.close();
            android.util.Log.i("AINOVEL", "downloaded to Download/AINovel/" + fileName);
        } catch (Exception e) {
            android.util.Log.e("AINOVEL", "writeToPublicDownloads failed: " + e.getMessage());
        }
    }
}
