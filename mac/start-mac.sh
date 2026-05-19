#!/bin/zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

print_header() {
  echo ""
  echo "AI 小说创作工作台 - mac 启动器"
  echo "--------------------------------"
}

fail_with_help() {
  echo ""
  echo "$1"
  echo ""
  echo "可以先看 README-MAC.md，里面写了最少需要准备什么。"
  exit 1
}

resolve_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    echo "corepack pnpm"
    return
  fi

  fail_with_help "没找到 pnpm。请先安装 Node.js 20.19 或更新版本，再重新打开这个启动器。"
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail_with_help "没找到 Node.js。请先安装 Node.js 20.19 或更新版本。"
  fi

  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major >= 24)) process.exit(1);' \
    || fail_with_help "当前 Node.js 版本太低。这个项目需要 Node.js 20.19、22.12 或更新版本。"
}

is_port_available() {
  node -e 'const net = require("node:net"); const port = Number(process.argv[1]); const server = net.createServer(); server.once("error", () => process.exit(1)); server.listen(port, "127.0.0.1", () => server.close(() => process.exit(0)));' "$1"
}

find_free_port() {
  node -e 'const net = require("node:net"); const start = Number(process.argv[1]); function tryPort(port) { const server = net.createServer(); server.once("error", () => tryPort(port + 1)); server.listen(port, "127.0.0.1", () => server.close(() => { console.log(port); })); } tryPort(start);' "$1"
}

print_header
check_node

PNPM_CMD="$(resolve_pnpm)"

if [ ! -d "node_modules" ]; then
  echo "第一次打开需要准备依赖，时间会稍久一点。"
  eval "$PNPM_CMD install"
fi

export AI_NOVEL_DATABASE_MODE="${AI_NOVEL_DATABASE_MODE:-sqlite}"
export AI_NOVEL_RUNTIME="${AI_NOVEL_RUNTIME:-desktop}"
export RAG_ENABLED="${RAG_ENABLED:-false}"
export ALLOW_LAN="${ALLOW_LAN:-false}"
export HOST="${AI_NOVEL_HOST:-127.0.0.1}"

if [ -z "$PORT" ] && ! is_port_available 3000; then
  export PORT="$(find_free_port 43123)"
  echo "检测到 3000 端口已被占用，本次改用 $PORT。"
fi

echo ""
echo "正在启动，稍等片刻会打开桌面窗口。"
echo "如果要退出，关闭桌面窗口后也可以直接关闭这个终端。"
echo ""

eval "$PNPM_CMD dev:desktop"
