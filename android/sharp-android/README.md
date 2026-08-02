# 安卓端 sharp（漫画工作台）原生移植说明

漫画工作台依赖 `sharp`（基于 libvips）。安卓 APK 内嵌的 node 运行时是 JNI 嵌入版，
无法使用 glibc 预编译包，WASM 回退（`@img/sharp-wasm32`）又会因 emscripten pthreads
死锁卡死事件循环。唯一可行路径是 **NDK 交叉编译 bionic `sharp.node`**，链接 Termux 的
bionic libvips。

## 已验证结论

| 方案 | 结果 |
|------|------|
| `@img/sharp-wasm32`（WASM 回退） | ❌ 嵌入 JNI node 加载即死锁，事件循环被同步卡死 |
| `@img/sharp-linux-arm64`（glibc 预编译） | ❌ NEEDED `libc.so.6`/`ld-linux-aarch64.so.1`，bionic 无法加载 |
| **NDK 编译 bionic `sharp.node` + Termux libvips** | ✅ 真机实测渲染成功（`SHARP_OK bytes=96`） |

## 产物（均已提交到仓库）

- `android/sharp-android/sharp.node` — 编译好的 AArch64 bionic `sharp.node`（444KB）
- `android/sharp-android/compile-sharp.sh` — 用 NDK clang 编译 `sharp.node` 的脚本
- `android/sharp-android/pkg-config.py` — Termux libvips 的 pkg-config 包装器
- `android/sharp-android/assemble-libs.py` — 收集运行时 `.so` 闭包到 `jniLibs_arm64/`
- `android/sharp-android/inject-sharp.sh` — 将 `sharp.node` 注入 `node-project.zip`

## 运行时依赖（已在 APK 内）

- `android-app/app/src/main/jniLibs/arm64-v8a/` 下新增 45 个 Termux bionic `.so`
  （libvips 及其传递依赖闭包：glib/gio/gobject/cairo/pango/rsvg/OpenEXR/fontconfig/…）
- 这些 `.so` 在 Android linker 的 app lib 目录内互相解析；node 自身依赖
  （`libz.so.1`/`libcares`/`libuv`/`libicu` 等）由 `NodeService` 的 `binDir` 经
  `LD_LIBRARY_PATH` 提供，**不要**把 node 自身 `.so` 放进 `jniLibs`（会冲突导致
  `libnodebin.so` 加载失败）。

## 重新构建流程

```bash
# 1) 准备 Termux libvips + sharp 官方 C++ 头文件（一次性，见 compile-sharp.sh 顶部注释）
# 2) 编译 sharp.node
bash android/sharp-android/compile-sharp.sh
# 3) 注入 node-project.zip（node-project.zip 本身被 .gitignore 忽略，需从桌面构建产物取得）
bash android/sharp-android/inject-sharp.sh
# 4) 重建 APK
cd android-app && gradle clean assembleDebug
```

> `node-project.zip` / `bundle.cjs` / `www.zip` 均为重二进制/可重建产物，已在 `.gitignore`
> 忽略，仅保留手写 `app.js`、`init-db.cjs` 与上方脚本。重新生成 `node-project.zip` 的
> 上游桌面构建链路不在本目录，注入步骤依赖已存在的 zip 作为输入。
