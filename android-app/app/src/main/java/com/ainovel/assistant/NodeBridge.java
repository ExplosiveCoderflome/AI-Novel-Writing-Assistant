package com.ainovel.assistant;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Logger;

/**
 * 封装 nodejs-mobile 的 JNI 入口。
 * nodejs-mobile gradle plugin 提供 io.nodejs.mobile.Node 类，
 * 其静态方法 Node.start(String scriptPath) 在后台线程运行 Node 源码。
 * 通过反射调用，避免编译期对未加载本地库的硬依赖。
 */
public final class NodeBridge {

    private static final Logger LOG = Logger.getLogger(NodeBridge.class.getName());
    private static final AtomicBoolean started = new AtomicBoolean(false);
    private static final String NODE_CLASS = "io.nodejs.mobile.Node";

    private NodeBridge() {}

    public static void start(String scriptPath) {
        if (started.compareAndSet(false, true)) {
            try {
                Class<?> nodeClass = Class.forName(NODE_CLASS);
                java.lang.reflect.Method m = nodeClass.getMethod("start", String.class);
                m.invoke(null, scriptPath);
            } catch (Throwable t) {
                LOG.severe("Failed to start Node runtime: " + t.getMessage());
                started.set(false);
            }
        }
    }

    public static boolean isStarted() {
        return started.get();
    }
}
