#!/usr/bin/env python3
"""从 Termux 仓库批量下载缺失的 .so 并放入 assets/noderuntime。

用法: python fetch-termux-libs.py
"""
import lzma
import os
import re
import shutil
import subprocess
import tarfile
import urllib.request

BASE = "https://packages.termux.dev/apt/termux-main"
DEST = "C:/Users/Administrator/AI-Novel-Writing-Assistant/android-app/app/src/main/assets/noderuntime"

# 缺失库 -> 可能来源包
NEEDED = {
    "libiconv.so": "libiconv",
    "liblzma.so.5": "liblzma",
    "libpcre2-8.so": "libpcre2",
    "libxml2.so.16": "libxml2",
    "libzstd.so.1": "libzstd",
    "libharfbuzz.so": "libharfbuzz",
    "libpixman-1.so": "libpixman",
    "libxcb.so": "libxcb",
    "libxcb-render.so": "libxcb",
    "libxcb-shm.so": "libxcb",
    "libgdk_pixbuf-2.0.so.0": "libgdk-pixbuf",
    "libstdc++.so": "libc++",
    "libbz2.so.1.0": "libbz2",
    "libpng.so": "libpng",
    "libjpeg.so": "libjpeg",
    "libwebp.so": "libwebp",
}

# 下载 Packages 索引
print("downloading Packages index...")
urllib.request.urlretrieve(f"{BASE}/dists/stable/main/binary-aarch64/Packages.gz", "/tmp/pkgs_full.gz")
with open("/tmp/pkgs_full.gz", "rb") as f:
    import gzip
    pkgs_text = gzip.decompress(f.read()).decode("utf-8", errors="ignore")

# 解析 Package -> Filename
pkg_file = {}
current = None
for line in pkgs_text.splitlines():
    if line.startswith("Package: "):
        current = line[len("Package: "):].strip()
    elif line.startswith("Filename: ") and current:
        pkg_file[current] = line[len("Filename: "):].strip()
        current = None

# 对每个缺失库，找到其真实来源包（从库文件反查）
# Termux 的库文件名与包名对应：libiconv.so -> libiconv 包等
def find_package_for_lib(libname):
    # libxcb-render/libxcb-shm 在 libxcb 包；libstdc++ 在 libc++ 包
    pkg_guess = NEEDED.get(libname)
    return pkg_guess

found = {}
for lib, pkg in NEEDED.items():
    fn = pkg_file.get(pkg)
    if fn:
        found[lib] = fn
        print(f"  {lib} <- {pkg}: {fn}")
    else:
        print(f"  {lib} <- {pkg}: NOT FOUND in index")

# 下载并解压
for lib, fn in found.items():
    url = f"{BASE}/{fn}"
    deb = f"/tmp/{os.path.basename(fn)}"
    try:
        urllib.request.urlretrieve(url, deb)
        with open(deb, "rb") as f:
            data = f.read()
        pos = 8
        extracted = []
        while pos < len(data):
            name = data[pos:pos+16].decode().strip()
            size = int(data[pos+48:pos+58].decode().strip())
            content = data[pos+60:pos+60+size]
            if "data.tar" in name:
                tar_data = lzma.decompress(content) if name.endswith("xz") else content
                tf = tarfile.open(fileobj=__import__("io").BytesIO(tar_data))
                for m in tf.getmembers():
                    if m.isfile() and (m.name.endswith(".so") or ".so." in m.name):
                        base = os.path.basename(m.name)
                        # 匹配目标库（含无后缀/带版本）
                        want_base = lib.split(".")[0]
                        if base.startswith(want_base) or lib.startswith(base.split(".")[0]):
                            data_out = tf.extractfile(m).read()
                            out = os.path.join(DEST, base)
                            open(out, "wb").write(data_out)
                            extracted.append(base)
            pos += 60 + size + (size % 2)
        print(f"  {lib}: extracted {extracted}")
    except Exception as e:
        print(f"  {lib}: FAILED {e}")

# 更新 runtime.list
rl = os.path.join(DEST, "runtime.list")
existing = set(open(rl).read().split()) if os.path.exists(rl) else set()
for f in os.listdir(DEST):
    if f.endswith(".so") or ".so." in f:
        existing.add(f)
open(rl, "w").write("\n".join(sorted(existing)) + "\n")
print(f"runtime.list: {len(existing)} entries")
