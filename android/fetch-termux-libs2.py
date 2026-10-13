#!/usr/bin/env python3
"""从 Termux 仓库自动补齐缺失的 .so：按库文件名反查包并下载解压。"""
import gzip
import io
import lzma
import os
import tarfile
import urllib.request

BASE = "https://packages.termux.dev/apt/termux-main"
DEST = "C:/Users/Administrator/AI-Novel-Writing-Assistant/android-app/app/src/main/assets/noderuntime"

# 目标缺失库（libname -> 候选包名）
TARGETS = {
    "libpcre2-8.so": ["libpcre2-8", "libpcre2"],
    "libzstd.so.1": ["libzstd", "zstd"],
    "libharfbuzz.so": ["libharfbuzz", "harfbuzz"],
    "libfribidi.so": ["libfribidi", "fribidi"],
    "libcurl.so": ["libcurl", "curl"],
    "libgdk_pixbuf-2.0.so.0": ["libgdk-pixbuf", "gdk-pixbuf"],
    "libX11.so": ["libx11", "x11"],
    "libXau.so": ["libxau", "xau"],
    "libXdmcp.so": ["libxdmcp", "xdmcp"],
    "libXext.so": ["libxext", "xext"],
    "libXrender.so": ["libxrender", "xrender"],
    "libandroid-shmem.so": ["libandroid-shmem", "android-shmem"],
    "libstdc++.so": ["libc++", "libstdc++"],
}

print("downloading Packages index...")
urllib.request.urlretrieve(f"{BASE}/dists/stable/main/binary-aarch64/Packages.gz", "/tmp/pkgs2.gz")
with open("/tmp/pkgs2.gz", "rb") as f:
    pkgs_text = gzip.decompress(f.read()).decode("utf-8", errors="ignore")

# 解析所有包块
blocks = {}
current = None
for line in pkgs_text.splitlines():
    if line.startswith("Package: "):
        current = line[len("Package: "):].strip()
        blocks[current] = {}
    elif current and ":" in line:
        k, v = line.split(":", 1)
        blocks[current][k.strip()] = v.strip()

# 反查：包含目标库文件的包（看 Installed-Size 或依赖，最可靠是直接尝试候选包名）
def find_filename(libname, candidates):
    for c in candidates:
        if c in blocks:
            fn = blocks[c].get("Filename")
            if fn:
                return fn
    # 模糊匹配包名包含候选关键词
    key = candidates[0].replace("lib", "").replace("-", "")
    for pkg, info in blocks.items():
        if key in pkg.lower():
            fn = info.get("Filename")
            if fn and fn.endswith("_aarch64.deb"):
                return fn
    return None

ok = 0
fail = []
for lib, cands in TARGETS.items():
    fn = find_filename(lib, cands)
    if not fn:
        fail.append(lib)
        print(f"  {lib}: NO PACKAGE FOUND")
        continue
    url = f"{BASE}/{fn}"
    deb = f"/tmp/tl_{os.path.basename(fn)}"
    try:
        urllib.request.urlretrieve(url, deb)
        with open(deb, "rb") as f:
            data = f.read()
        pos = 8
        got = []
        while pos < len(data):
            name = data[pos:pos+16].decode().strip()
            size = int(data[pos+48:pos+58].decode().strip())
            content = data[pos+60:pos+60+size]
            if "data.tar" in name:
                tar_data = lzma.decompress(content) if name.endswith("xz") else content
                tf = tarfile.open(fileobj=io.BytesIO(tar_data))
                for m in tf.getmembers():
                    if m.isfile() and (m.name.endswith(".so") or ".so." in m.name):
                        base = os.path.basename(m.name)
                        # 接受目标库名匹配（前缀或包含）
                        want = lib.split(".so")[0]
                        if base.startswith(want) or want.startswith(base.split(".so")[0]):
                            open(os.path.join(DEST, base), "wb").write(tf.extractfile(m).read())
                            got.append(base)
            pos += 60 + size + (size % 2)
        print(f"  {lib} ({os.path.basename(fn)}): {got}")
        ok += 1
    except Exception as e:
        fail.append(lib)
        print(f"  {lib}: FAIL {e}")

print(f"\n完成: {ok} 成功, {len(fail)} 失败: {fail}")
