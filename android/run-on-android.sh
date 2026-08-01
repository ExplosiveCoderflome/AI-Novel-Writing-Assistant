#!/usr/bin/env bash
# ============================================================================
# AI-Novel-Writing-Assistant — 手机端启动脚本（Termux / nodejs-mobile 通用）
# 作用：在安卓手机的 Node 运行时里启动后端 Express 服务，
#       前端 WebView 只需加载 http://localhost:3000 即可。
#
# 用法：
#   1) Termux 方案：
#      pkg install nodejs
#      cd AI-Novel-Writing-Assistant
#      bash android/run-on-android.sh
#   2) nodejs-mobile 方案（APK 内置 Node 后由 Java 调用本脚本亦可）
#
# 说明：
#   - 后端默认 SQLite（schema.sqlite.prisma），无需 Postgres
#   - RAG/Qdrant 默认禁用（不配置 QDRANT_URL 即离线可用）
#   - 漫画工坊默认禁用：依赖 sharp（libvips）。安卓有两种路径——
#       (a) 纯 WASM 回退 @img/sharp-wasm32：在 APK 内嵌的 JNI node 运行时里
#           会因 emscripten pthreads 工作线程死锁（模块加载即阻塞事件循环），不可用；
#       (b) 原生 sharp-linux-arm64：需用 NDK 交叉编译 libvips（含 glib/cairo/pango 等
#           大量系统库），属于独立专项，未纳入本版本。
#     故漫画工作台在安卓端暂不可用，其余创作功能均正常。
# ============================================================================

set -euo pipefail

# --- 根目录（脚本位于 android/ 下，上级即项目根） ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# --- 安卓专属数据目录（避免写进项目源码目录，便于备份/清理） ---
if [ -z "${AI_NOVEL_APP_DATA_DIR:-}" ]; then
  if [ -n "${HOME:-}" ]; then
    export AI_NOVEL_APP_DATA_DIR="$HOME/ai-novel-data"
  fi
fi
mkdir -p "${AI_NOVEL_APP_DATA_DIR}"

# --- 加载安卓环境变量覆盖（若存在） ---
if [ -f "$SCRIPT_DIR/.env.android" ]; then
  set -a
  . "$SCRIPT_DIR/.env.android"
  set +a
fi

# --- 关键环境变量（可被 .env.android 覆盖） ---
export NODE_ENV="${NODE_ENV:-production}"
export AI_NOVEL_RUNTIME="${AI_NOVEL_RUNTIME:-web}"
export PORT="${PORT:-3000}"
export HOST="${HOST:-localhost}"
export AI_NOVEL_DATABASE_MODE="${AI_NOVEL_DATABASE_MODE:-sqlite}"
export DATABASE_URL="${DATABASE_URL:-file:${AI_NOVEL_APP_DATA_DIR}/ai_novel.db}"

# 禁用 PC 专属/安卓不可用的能力
export AI_NOVEL_DISABLE_COMIC="${AI_NOVEL_DISABLE_COMIC:-1}"
export AI_NOVEL_DISABLE_RAG="${AI_NOVEL_DISABLE_RAG:-1}"

# --- 确保 Prisma SQLite client 已生成（首次运行） ---
echo "[android] 生成 Prisma SQLite client（首次稍慢）..."
( cd server && pnpm prisma generate --config prisma.config.ts ) || \
  ( cd server && npx prisma generate --config prisma.config.ts )

# --- 应用 SQLite 迁移 ---
echo "[android] 应用数据库迁移..."
( cd server && pnpm exec prisma migrate deploy --config prisma.config.ts ) || \
  echo "[android] 警告：迁移跳过（可能已存在）"

# --- 启动后端 ---
echo "[android] 启动后端 -> http://localhost:${PORT}"
echo "[android] 数据目录: ${AI_NOVEL_APP_DATA_DIR}"
exec node server/dist/app.js
