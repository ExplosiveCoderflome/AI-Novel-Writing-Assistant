#!/usr/bin/env bash
# 将 NDK 交叉编译的 bionic sharp.node 注入 node-project.zip，
# 替换原 @img/sharp-wasm32/sharp.node（之前仅为 WASM 回退 shim）。
#
# 前置：
#   - C:/Android/vips/sharp.node 已编译（见 compile-sharp.sh）
#   - android-app/app/src/main/assets/nodejs/node-project.zip 已存在
#
# 用法：bash android/sharp-android/inject-sharp.sh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ZIP="$PROJECT_ROOT/android-app/app/src/main/assets/nodejs/node-project.zip"
SRC_NODE="$PROJECT_ROOT/android/sharp-android/sharp.node"
TARGET="node_modules/@img/sharp-wasm32/sharp.node"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ ! -f "$SRC_NODE" ]; then
  echo "ERROR: $SRC_NODE 不存在，先运行 compile-sharp.sh 生成 bionic sharp.node" >&2
  exit 1
fi
if [ ! -f "$ZIP" ]; then
  echo "ERROR: $ZIP 不存在" >&2
  exit 1
fi

PY="${PY:-C:/Users/Administrator/AppData/Local/Programs/Python/Python311/python.exe}"

"$PY" - "$ZIP" "$SRC_NODE" "$TARGET" <<'PYEOF'
import sys, zipfile, shutil, os
zip_path, src_node, target = sys.argv[1], sys.argv[2], sys.argv[3]
tmp = os.environ.get('TMPDIR') or os.path.join(os.path.dirname(zip_path), '.inject_tmp')
os.makedirs(tmp, exist_ok=True)
new_zip = os.path.join(tmp, 'np_inject.zip')
data = open(src_node,'rb').read()
zin = zipfile.ZipFile(zip_path,'r')
zout = zipfile.ZipFile(new_zip,'w',zipfile.ZIP_DEFLATED)
replaced = False
for it in zin.infolist():
    if it.filename == target:
        zout.writestr(it.filename, data)
        replaced = True
        print('replaced', target, len(data))
    else:
        zout.writestr(it, zin.read(it.filename))
if not replaced:
    # 目标条目不存在则追加（首次注入）
    zout.writestr(target, data)
    print('appended', target, len(data))
zin.close(); zout.close()
shutil.move(new_zip, zip_path)
print('updated', zip_path, os.path.getsize(zip_path))
PYEOF

echo "[inject-sharp] done: $TARGET <- $SRC_NODE"
