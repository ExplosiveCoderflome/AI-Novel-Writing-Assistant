# 保留 nodejs-mobile JNI 绑定类
-keep class com.nodejs.mobile.** { *; }
-keep class io.nodejs.mobile.** { *; }
-keep class nodejs.** { *; }

# 保留 better-sqlite3 等 native 模块名
-keep class better_sqlite3 { *; }

# WebView / 反射调用不混淆
-keepattributes *Annotation*
-keep class * extends android.app.Service
-keep class * extends android.app.Activity
