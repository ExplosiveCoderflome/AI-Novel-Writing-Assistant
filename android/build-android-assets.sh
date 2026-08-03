#!/usr/bin/env bash
# ============================================================================
# AI-Novel-Writing-Assistant — 安卓端资产构建脚本
#
# 作用：从源码生成被 .gitignore 忽略的三个安卓资产（fork 后首次构建必跑）：
#   1) android-app/app/src/main/assets/nodejs/bundle.cjs   （server 打包产物）
#   2) android-app/app/src/main/assets/www.zip             （前端静态资源）
#   3) android-app/app/src/main/assets/nodejs/node-project.zip （node 运行环境）
#   并注入 NDK 编译的 bionic sharp.node（漫画工作台原生渲染）。
#
# 用法（MSYS/Git-Bash 或 Linux/macOS 均可）：
#   bash android/build-android-assets.sh
#   cd android-app && gradle clean assembleDebug
#
# 注意：
#   - esbuild 必须用项目内 node_modules/.pnpm/esbuild@0.27.3（pnpm exec 可能解析到别的版本）
#   - Python 用 PY 环境变量覆盖（Windows 下写死 Python311 全路径）
#   - bundle.cjs 只 external sharp/better-sqlite3/@prisma/client（原生/重型模块），
#     express/cors/helmet 等必须打进包内（否则安卓运行时 require 404）
#   - www.zip / node-project.zip 条目不能带 www/ 或 nodejs/ 前缀
#     （NodeService 解压到 files/www、files/nodejs，多一层前缀会路径错位）
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODEJS_ASSETS="$PROJECT_ROOT/android-app/app/src/main/assets/nodejs"
WWW_DIR="$PROJECT_ROOT/android-app/app/src/main/assets/www"
ASSETS_ROOT="$PROJECT_ROOT/android-app/app/src/main/assets"

# Python：Windows 下裸 python3 是商店桩，必须显式全路径；可用 PY 覆盖
PY="${PY:-C:/Users/Administrator/AppData/Local/Programs/Python/Python311/python.exe}"
if ! "$PY" --version >/dev/null 2>&1; then
  PY="$(command -v python3 || command -v python)"
fi

to_win() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi
}

# esbuild：锁定项目内版本（pnpm exec 会解析到错误版本）
ESBUILD=""
for cand in "$PROJECT_ROOT"/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild; do
  [ -f "$cand" ] && ESBUILD="$cand" && break
done
if [ -z "$ESBUILD" ]; then
  echo "[android-assets] ERROR: 未找到项目内 esbuild，请先 pnpm install" >&2
  exit 1
fi

echo "[android-assets] PROJECT_ROOT = $PROJECT_ROOT"

# ---------------------------------------------------------------------------
# 1) bundle.cjs：esbuild 完整打包 server/src/app.ts
#    只 external 原生/重型模块；express/cors/helmet/morgan 等打进包内
# ---------------------------------------------------------------------------
echo "[android-assets] 1/3 构建 bundle.cjs ..."
ESB_WIN="$(to_win "$ESBUILD")"
SRC_WIN="$(to_win "$PROJECT_ROOT/server/src/app.ts")"
OUT_WIN="$(to_win "$NODEJS_ASSETS/bundle.cjs")"
"$ESB_WIN" "$SRC_WIN" \
  --bundle --platform=node --format=cjs \
  --outfile="$OUT_WIN" \
  --external:sharp --external:better-sqlite3 --external:@prisma/client \
  --log-level=warning
echo "  bundle.cjs $(stat -c%s "$NODEJS_ASSETS/bundle.cjs" 2>/dev/null || wc -c < "$NODEJS_ASSETS/bundle.cjs") bytes"

# ---------------------------------------------------------------------------
# 2) 前端构建 + www.zip：vite 构建（相对 base + 安卓 API 地址）→ www/ → 打包
#    注意：必须 AI_NOVEL_CLIENT_BASE=relative（file:// 加载需要相对路径），
#    VITE_API_BASE_URL 指向 127.0.0.1:3000（安卓上 localhost 解析异常）
# ---------------------------------------------------------------------------
echo "[android-assets] 2/3 构建前端 www.zip ..."
if [ -d "$PROJECT_ROOT/client/node_modules" ]; then
  (cd "$PROJECT_ROOT/client" && AI_NOVEL_CLIENT_BASE=relative VITE_API_BASE_URL="http://127.0.0.1:3000/api" npx vite build >/tmp/vite_android_build.log 2>&1) \
    && echo "  vite build OK" \
    || { echo "[android-assets] WARN: vite build 失败，使用现有 www/ 目录" >&2; }
  # vite 输出到 dist/，同步到 www/
  if [ -d "$PROJECT_ROOT/client/dist" ]; then
    rm -rf "$WWW_DIR"
    cp -r "$PROJECT_ROOT/client/dist" "$WWW_DIR"
  fi
else
  echo "[android-assets] WARN: client/node_modules 不存在，跳过前端构建（使用现有 www/）" >&2
fi
WWW_ZIP_WIN="$(to_win "$ASSETS_ROOT/www.zip")"
rm -f "$ASSETS_ROOT/www.zip"
(cd "$WWW_DIR" && "$PY" - "$WWW_ZIP_WIN" <<'PYEOF'
import sys, os, zipfile
out = os.path.abspath(sys.argv[1])
z = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)
count = 0
for root, _, files in os.walk("."):
    for f in files:
        p = os.path.join(root, f)
        if os.path.abspath(p) == out:
            continue  # 跳过输出文件自身，避免无限自包含
        arc = p[2:] if p.startswith("./") else p  # 去 ./ 前缀
        z.write(p, arc)
        count += 1
z.close()
print(f"  www.zip {count} files -> {os.path.getsize(out)} bytes")
PYEOF
)

# ---------------------------------------------------------------------------
# 3) node-project.zip：固定资产（依赖锁定），不重新打包。
#    依赖树包含安卓版原生库（better-sqlite3 ELF + WASM sharp 运行时），
#    Windows 开发机无法凭空生成（pnpm 会装 Windows 版原生库导致真机
#    bad ELF magic）。zip 缺失时从 GitHub Release 下载（见 README）。
# ---------------------------------------------------------------------------
if [ -f "$NODEJS_ASSETS/node-project.zip" ]; then
  echo "[android-assets] 3/3 node-project.zip 已存在（固定资产，跳过重建）"
  echo "  $(stat -c%s "$NODEJS_ASSETS/node-project.zip" 2>/dev/null || wc -c < "$NODEJS_ASSETS/node-project.zip") bytes"
else
  echo "[android-assets] 3/3 WARN: node-project.zip 缺失！" >&2
  echo "  请从 GitHub Release 下载（README 有说明），或从发布版 APK 提取。" >&2
fi

# 注：漫画工作台 sharp 使用 WASM 版（@img/sharp-wasm32 + @emnapi/runtime），
# 不注入 bionic sharp.node——原生版依赖 libvips 全家（libstdc++ ABI 在真机
# 不兼容，dlopen 失败）；WASM 版免原生库、真机验证渲染正常。

echo "[android-assets] 完成。现在可构建 APK："
echo "  cd android-app && gradle clean assembleDebug"
