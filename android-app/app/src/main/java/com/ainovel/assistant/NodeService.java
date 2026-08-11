package com.ainovel.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.app.Service;
import android.os.IBinder;
import android.content.res.AssetManager;
import android.content.res.AssetFileDescriptor;

import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 前台服务：把 assets/nodejs 解压到 filesDir，用内嵌的 Termux Node 二进制
 * (lib/arm64/node) 启动后端，常驻通知保活。
 */
public class NodeService extends Service {

    private static final String CHANNEL_ID = "ainovel_node_channel";
    private static final int NOTIF_ID = 1001;

    private Process nodeProcess;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIF_ID, buildNotification());
        startNode();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    private void startNode() {
        if (nodeProcess != null) return;
        // 解压 + 启动放后台线程，避免阻塞 Service 创建导致 ANR
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    android.util.Log.e("AINOVEL", "startNode: extracting assets...");
                    File nodeDir = new File(getFilesDir(), "nodejs");
                    File extractFlag = new File(nodeDir, ".extracted");
                    if (!extractFlag.exists()) {
                        extractZip(getAssets(), "nodejs/node-project.zip", nodeDir);
                        extractFlag.createNewFile();
                    }
                    android.util.Log.e("AINOVEL", "startNode: assets extracted to " + nodeDir.getAbsolutePath());

                    // 前端静态资源（解压到 files/www，WebView 用 file:// 加载）
                    File wwwDir = new File(getFilesDir(), "www");
                    File wwwFlag = new File(wwwDir, ".extracted");
                    if (!wwwFlag.exists()) {
                        extractZip(getAssets(), "www.zip", wwwDir);
                        wwwFlag.createNewFile();
                    }

                    File dataDir = new File(getFilesDir(), "data");
                    dataDir.mkdirs();

                    // 强制把 libnodebin.so 从 APK 提取到 nativeLibraryDir（该分区可执行）
                    try {
                        System.loadLibrary("nodebin");
                    } catch (Throwable t) {
                        android.util.Log.w("AINOVEL", "System.loadLibrary(nodebin) note: " + t.getMessage());
                    }
                    File nativeLibDir = new File(getApplicationInfo().nativeLibraryDir);
                    File nodeBin = new File(nativeLibDir, "libnodebin.so");
                    if (!nodeBin.exists()) {
                        throw new IOException("embedded node binary not found at " + nodeBin.getAbsolutePath());
                    }
                    android.util.Log.e("AINOVEL", "startNode: node bin=" + nodeBin.getAbsolutePath());

                    // 解压 node 运行库到 filesDir/bin（库加载不受 noexec 限制）
                    File binDir = new File(getFilesDir(), "bin");
                    extractRuntime(getAssets(), binDir);
                    android.util.Log.e("AINOVEL", "startNode: runtime at " + binDir.getAbsolutePath());

                    // 启动前用 better-sqlite3 直接执行 Prisma SQL 迁移建表（安卓/web 模式下 server 不自动建表）
                    java.util.Map<String, String> dbEnv = new java.util.HashMap<>();
                    dbEnv.put("LD_LIBRARY_PATH", binDir.getAbsolutePath() + ":" + System.getenv("LD_LIBRARY_PATH"));
                    dbEnv.put("HOME", nodeDir.getAbsolutePath());
                    dbEnv.put("OPENSSL_CONF", "/dev/null");
                    dbEnv.put("AI_NOVEL_APP_DATA_DIR", dataDir.getAbsolutePath());
                    try {
                        File initDb = new File(nodeDir, "init-db.cjs");
                        ArrayList<String> dbCmd = new ArrayList<>();
                        dbCmd.add(nodeBin.getAbsolutePath());
                        dbCmd.add(initDb.getAbsolutePath());
                        ProcessBuilder dbpb = new ProcessBuilder(dbCmd);
                        dbpb.directory(nodeDir);
                        dbpb.environment().putAll(dbEnv);
                        dbpb.redirectErrorStream(true);
                        dbpb.redirectInput(ProcessBuilder.Redirect.from(new java.io.File("/dev/null")));
                        Process dbp = dbpb.start();
                        java.io.InputStream dbis = dbp.getInputStream();
                        java.io.BufferedReader dbr = new java.io.BufferedReader(new java.io.InputStreamReader(dbis));
                        String dbl;
                        while ((dbl = dbr.readLine()) != null) {
                            android.util.Log.i("NODEJS-MOBILE", "[init-db] " + dbl);
                        }
                        int dbc = dbp.waitFor();
                        android.util.Log.e("AINOVEL", "init-db exited with code " + dbc);
                    } catch (Exception dbe) {
                        android.util.Log.e("AINOVEL", "init-db failed (continuing): " + dbe.getMessage());
                    }

                    // 构建启动命令
                    ArrayList<String> cmd = new ArrayList<>();
                    cmd.add(nodeBin.getAbsolutePath());
                    cmd.add("app.js");
                    // 环境
                    java.util.Map<String, String> env = new java.util.HashMap<>();
                    env.put("NODE_PATH", nodeDir.getAbsolutePath());
                    env.put("AI_NOVEL_RUNTIME", "web");
                    env.put("AI_NOVEL_DATABASE_MODE", "sqlite");
                    env.put("AI_NOVEL_APP_DATA_DIR", dataDir.getAbsolutePath());
                    env.put("DATABASE_URL", "file:" + nodeDir.getAbsolutePath() + "/dev.db");
                    // 允许 file:// 页面（WebView 从本地加载，Origin 为 null）跨域访问后端 API
                    env.put("CORS_ORIGIN", "null");
                    env.put("PORT", "3000");
                    env.put("HOST", "127.0.0.1");
                    env.put("OPENSSL_CONF", "/dev/null");
                    env.put("LD_LIBRARY_PATH", binDir.getAbsolutePath() + ":" + System.getenv("LD_LIBRARY_PATH"));
                    env.put("HOME", nodeDir.getAbsolutePath());

                    ProcessBuilder pb = new ProcessBuilder(cmd);
                    pb.directory(nodeDir);
                    pb.environment().putAll(env);
                    pb.redirectErrorStream(true);
                    nodeProcess = pb.start();
                    android.util.Log.e("AINOVEL", "startNode: node process started");

                    // 读取 node 输出到 logcat
                    final InputStream is = nodeProcess.getInputStream();
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            boolean notified = false;
                            try (BufferedReader br = new BufferedReader(new InputStreamReader(is))) {
                                String line;
                                while ((line = br.readLine()) != null) {
                                    android.util.Log.i("NODEJS-MOBILE", line);
                                    // 检测 server 监听就绪（日志含端口/监听字样），通知前端加载
                                    if (!notified && isServerReadyLine(line)) {
                                        notified = true;
                                        sendServerReadyBroadcast();
                                    }
                                }
                            } catch (IOException e) {
                                android.util.Log.e("NODEJS-MOBILE", "node stdout reader ended: " + e.getMessage());
                            }
                        }
                    }).start();

                    int code = nodeProcess.waitFor();
                    android.util.Log.e("AINOVEL", "node process exited with code " + code);
                    nodeProcess = null;
                } catch (Exception e) {
                    android.util.Log.e("AINOVEL", "startNode FAILED", e);
                    writeDebug("START_FAIL: " + android.util.Log.getStackTraceString(e));
                }
            }
        }).start();
    }

    private void writeDebug(String msg) {
        try {
            File f = new File(getExternalFilesDir(null), "debug.txt");
            java.io.FileWriter fw = new java.io.FileWriter(f, true);
            fw.write(msg + "\n");
            fw.close();
        } catch (Exception ignore) {}
    }

    /** 流式解压 assets 中的单个 zip 到 destDir（避免对大目录逐文件 AssetManager.open） */
    private void extractZip(AssetManager am, String assetPath, File destDir) throws IOException {
        destDir.mkdirs();
        android.content.res.AssetFileDescriptor afd = am.openFd(assetPath);
        try {
            java.io.FileInputStream fis = new java.io.FileInputStream(afd.getFileDescriptor());
            long skip = afd.getStartOffset();
            while (skip > 0) {
                long n = fis.skip(skip);
                if (n <= 0) break;
                skip -= n;
            }
            java.io.BufferedInputStream bis = new java.io.BufferedInputStream(fis);
            ZipInputStream zis = new ZipInputStream(bis);
            ZipEntry entry;
            int count = 0;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();
                File outFile = new File(destDir, name);
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                } else {
                    outFile.getParentFile().mkdirs();
                    try (OutputStream os = new java.io.FileOutputStream(outFile)) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = zis.read(buf)) > 0) os.write(buf, 0, n);
                    }
                }
                zis.closeEntry();
                count++;
                if (count % 5000 == 0) {
                    android.util.Log.e("AINOVEL", "unzipped " + count + " entries");
                }
            }
            zis.close();
            android.util.Log.e("AINOVEL", "unzip done: " + count + " entries -> " + destDir.getAbsolutePath());
        } finally {
            afd.close();
        }
    }

    /** 解压 node 运行时（assets/noderuntime/*）到 binDir，并设可执行权限 */
    private void extractRuntime(AssetManager am, File binDir) throws IOException {
        binDir.mkdirs();
        ArrayList<String> files = readAssetLines(am, "noderuntime/runtime.list");
        for (String f : files) {
            InputStream in = am.open("noderuntime/" + f);
            File out = new File(binDir, f);
            copyFile(in, out);
            if (f.equals("libnodebin.so")) {
                out.setExecutable(true);
            }
        }
        android.util.Log.e("AINOVEL", "runtime extracted to " + binDir.getAbsolutePath());
    }

    private ArrayList<String> readAssetLines(AssetManager am, String assetPath) throws IOException {
        ArrayList<String> lines = new ArrayList<>();
        InputStream in = am.open(assetPath);
        BufferedReader br = new BufferedReader(new InputStreamReader(in));
        String line;
        while ((line = br.readLine()) != null) {
            line = line.trim();
            if (!line.isEmpty()) lines.add(line);
        }
        br.close();
        return lines;
    }

    private void copyFile(InputStream in, File out) throws IOException {
        out.getParentFile().mkdirs();
        try (OutputStream os = new java.io.FileOutputStream(out)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        }
        in.close();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "小说创作引擎", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("本地 AI 创作服务运行中");
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("AI 小说创作引擎")
                .setContentText("本地服务运行中（localhost:3000）")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setOngoing(true)
                .build();
    }

    /** 判断 node 输出行是否为 server 监听就绪日志 */
    private boolean isServerReadyLine(String line) {
        if (line == null) return false;
        String l = line.toLowerCase();
        return (l.contains("listening") && l.contains("3000"))
                || l.contains("listening on http://localhost:3000");
    }

    /** 通知 MainActivity：server 已就绪，可以加载前端 */
    private void sendServerReadyBroadcast() {
        try {
            Intent intent = new Intent(MainActivity.ACTION_SERVER_READY);
            intent.setPackage(getPackageName());
            sendBroadcast(intent);
            android.util.Log.e("AINOVEL", "SERVER_READY broadcast sent");
        } catch (Exception e) {
            android.util.Log.e("AINOVEL", "broadcast failed: " + e.getMessage());
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
