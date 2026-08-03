#!/usr/bin/env python3
"""裁剪 node-project.zip：只保留安卓运行时必需的依赖。

bundle.cjs 已内联所有纯 JS 依赖（express/langchain/@aws-sdk 等），
node_modules 运行时只需 sharp、better-sqlite3、@prisma/client 三棵依赖树。
本脚本从完整 zip 裁剪出精简 zip，压缩后 <100MB 可直接提交进仓库。

用法: python prune-node-project.py <input.zip> <output.zip>
"""
import sys
import zipfile

KEEP_PREFIXES = (
    # sharp 及其运行时依赖
    "node_modules/sharp/",
    "node_modules/@img/colour/",
    "node_modules/@img/sharp-wasm32/",
    "node_modules/detect-libc/",
    "node_modules/semver/",
    "node_modules/color/",
    "node_modules/color-string/",
    "node_modules/color-convert/",
    "node_modules/color-name/",
    "node_modules/simple-swizzle/",
    "node_modules/is-arrayish/",
    # better-sqlite3 及其运行时依赖
    "node_modules/better-sqlite3/",
    "node_modules/bindings/",
    "node_modules/file-uri-to-path/",
    "node_modules/prebuild-install/",
    "node_modules/rc/",
    "node_modules/tar-fs/",
    "node_modules/tar-stream/",
    "node_modules/bl/",
    "node_modules/end-of-stream/",
    "node_modules/once/",
    "node_modules/wrappy/",
    "node_modules/readable-stream/",
    "node_modules/string_decoder/",
    "node_modules/safe-buffer/",
    "node_modules/ieee754/",
    "node_modules/base64-js/",
    "node_modules/buffer/",
    "node_modules/util-deprecate/",
    "node_modules/inherits/",
    "node_modules/mkdirp-classic/",
    "node_modules/b4a/",
    "node_modules/queue-tick/",
    "node_modules/streamx/",
    "node_modules/fs-constants/",
    "node_modules/chownr/",
    "node_modules/minimist/",
    "node_modules/strip-json-comments/",
    "node_modules/deep-extend/",
    "node_modules/ini/",
    "node_modules/simple-concat/",
    "node_modules/simple-get/",
    "node_modules/decompress-response/",
    "node_modules/mimic-response/",
    "node_modules/expand-template/",
    "node_modules/github-from-package/",
    "node_modules/node-abi/",
    "node_modules/napi-build-utils/",
    "node_modules/tunnel-agent/",
    "node_modules/safe-buffer/",
    # @prisma/client 运行时
    "node_modules/@prisma/client/",
    "node_modules/@prisma/client-runtime-utils/",
    "node_modules/.prisma/",
    "node_modules/@prisma/adapter-better-sqlite3/",
    "node_modules/@prisma/adapter-libsql/",
    "node_modules/@prisma/better-sqlite3/",
    "node_modules/@prisma/driver-adapter-utils/",
    "node_modules/@prisma/prisma-schema-wasm/",
    # 顶层业务入口
    "app.js",
    "init-db.cjs",
    "bundle.cjs",
    "package.json",
    "schema.prisma",
    "prisma-schema.sqlite.prisma",
    "migrations.sqlite/",
)


def prune(src: str, dst: str) -> None:
    zin = zipfile.ZipFile(src)
    zout = zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, compresslevel=9)
    kept = 0
    dropped = 0
    for info in zin.infolist():
        if info.filename.startswith(KEEP_PREFIXES):
            zout.writestr(info, zin.read(info.filename))
            kept += 1
        else:
            dropped += 1
    zout.close()
    import os
    print(f"pruned: kept {kept}, dropped {dropped}")
    print(f"output: {os.path.getsize(dst) / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    prune(sys.argv[1], sys.argv[2])
