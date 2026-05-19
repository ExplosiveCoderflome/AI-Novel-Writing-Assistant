#!/bin/zsh

DIR="$(cd "$(dirname "$0")" && pwd)"

"$DIR/mac/start-mac.sh"
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo ""
  echo "启动没有完成。按任意键关闭这个窗口。"
  read -k 1
fi

exit "$STATUS"
