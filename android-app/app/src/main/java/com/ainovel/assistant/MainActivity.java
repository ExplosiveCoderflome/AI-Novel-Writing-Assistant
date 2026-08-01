package com.ainovel.assistant;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
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
        webView.setWebViewClient(new WebViewClient());

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
}
