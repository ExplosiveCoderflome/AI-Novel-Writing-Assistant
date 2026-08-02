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
# 2) www.zip：打包 www/ 目录内容（条目不带 www/ 前缀）
# ---------------------------------------------------------------------------
echo "[android-assets] 2/3 构建前端 www.zip ..."
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
# 3) node-project.zip：打包 assets/nodejs/ 目录内容 + 注入 bionic sharp.node
#    注意：assets/nodejs/ 必须已有真实扁平 node_modules（非 pnpm 软链）！
#    若无 node_modules 或缺失 sharp，请先 pnpm install 后手工解软链铺平。
# ---------------------------------------------------------------------------
echo "[android-assets] 3/3 构建 nodejs/node-project.zip ..."
NP_ZIP_WIN="$(to_win "$NODEJS_ASSETS/node-project.zip")"
rm -f "$NODEJS_ASSETS/node-project.zip"
(cd "$NODEJS_ASSETS" && "$PY" - "$NP_ZIP_WIN" <<'PYEOF'
import sys, os, zipfile
out = os.path.abspath(sys.argv[1])
z = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)
count = 0
for root, _, files in os.walk("."):
    for f in files:
        p = os.path.join(root, f)
        if os.path.abspath(p) == out:
            continue  # 跳过输出文件自身，避免无限自包含
        arc = p[2:] if p.startswith("./") else p
        z.write(p, arc)
        count += 1
z.close()
print(f"  node-project.zip {count} files -> {os.path.getsize(out)} bytes")
PYEOF
)

# 注入 bionic sharp.node（漫画工作台原生渲染，WASM 在 JNI node 下死锁不可用）
if [ -f "$PROJECT_ROOT/android/sharp-android/sharp.node" ]; then
  echo "[android-assets] 注入 bionic sharp.node ..."
  bash "$PROJECT_ROOT/android/sharp-android/inject-sharp.sh"
else
  echo "[android-assets] WARN: sharp.node 不存在，跳过注入（漫画工作台不可用）" >&2
fi

echo "[android-assets] 完成。现在可构建 APK："
echo "  cd android-app && gradle clean assembleDebug"
