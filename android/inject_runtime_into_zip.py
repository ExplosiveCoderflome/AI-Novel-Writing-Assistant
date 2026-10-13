#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""向 node-project.zip 注入最新运行时产物。

NodeService 运行时只解压 node-project.zip 到 files/nodejs：
app.js 的 require('./bundle.cjs')、init-db 读的迁移、prisma client
全部来自 zip 内；assets 目录里的同名文件只是打包源，运行时不可见。
故每次构建 APK 前必须把最新产物外科手术式写进 zip：
  bundle.cjs / init-db.cjs / migrations.sqlite/** /
  schema.prisma / prisma-schema.sqlite.prisma /
  node_modules/.prisma/client/** / node_modules/@prisma/{4个包}/**

用法: python3 android/inject_runtime_into_zip.py
前置: node-project.zip 存在；已跑 esbuild bundle 与 prisma generate。
"""
import glob, json, os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "android-app", "app", "src", "main", "assets", "nodejs")
ZIP_PATH = os.path.join(ASSETS, "node-project.zip")
PRISMA_DIR = os.path.join(ROOT, "server", "src", "prisma")
PRISMA_PKGS = ["client", "client-runtime-utils", "driver-adapter-utils", "adapter-better-sqlite3"]

def fail(msg):
    print("[inject] ERROR: " + msg, file=sys.stderr)
    return 1

def main():
    if not os.path.exists(ZIP_PATH):
        return fail(ZIP_PATH + " 不存在（固定资产缺失，见 README）")

    replace = {}
    for name in ("bundle.cjs", "init-db.cjs"):
        p = os.path.join(ASSETS, name)
        if not os.path.exists(p):
            return fail("缺少 " + p + "（先跑 build-android-assets.sh 的 esbuild 步骤）")
        replace[name] = p
    replace["schema.prisma"] = os.path.join(PRISMA_DIR, "schema.prisma")
    replace["prisma-schema.sqlite.prisma"] = os.path.join(PRISMA_DIR, "schema.sqlite.prisma")

    dirs = [(os.path.join(ASSETS, "migrations.sqlite"), "migrations.sqlite/")]
    gen = glob.glob(os.path.join(ROOT, "node_modules", ".pnpm", "@prisma+client@*", "node_modules", ".prisma", "client"))
    if not gen:
        return fail("未找到 .prisma/client 生成物，先跑：cd server && pnpm run prisma:generate")
    dirs.append((gen[0], "node_modules/.prisma/client/"))
    client_hits = []
    for pkg in PRISMA_PKGS:
        hits = glob.glob(os.path.join(ROOT, "node_modules", ".pnpm", "@prisma+" + pkg + "@*", "node_modules", "@prisma", pkg))
        if not hits:
            return fail("未找到 @prisma/" + pkg + " 安装目录（pnpm install 之后再试）")
        dirs.append((hits[0], "node_modules/@prisma/" + pkg + "/"))
        if pkg == "client":
            client_hits = hits

    dir_map = {}
    prefixes = []
    for local_dir, prefix in dirs:
        prefixes.append(prefix)
        if not os.path.isdir(local_dir):
            return fail("目录不存在: " + local_dir)
        for dp, _dns, fns in os.walk(local_dir):
            for f in fns:
                full = os.path.join(dp, f)
                rel = os.path.relpath(full, local_dir).replace(os.sep, "/")
                dir_map[prefix + rel] = full

    try:
        client_pkg = json.load(open(os.path.join(client_hits[0], "package.json")))
    except Exception as e:
        return fail("读取 @prisma/client/package.json 失败: " + str(e))

    tmp = ZIP_PATH + ".tmp"
    kept = replaced = deleted = added = 0
    zin_f = zipfile.ZipFile(ZIP_PATH)
    zout_f = zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED)
    try:
        written = set()
        for item in zin_f.infolist():
            fn = item.filename
            if any(fn.startswith(p) for p in prefixes):
                if fn in dir_map:
                    with open(dir_map[fn], "rb") as fh:
                        zout_f.writestr(fn, fh.read())
                    written.add(fn)
                    replaced += 1
                else:
                    deleted += 1
                continue
            if fn in replace:
                with open(replace[fn], "rb") as fh:
                    zout_f.writestr(fn, fh.read())
                written.add(fn)
                replaced += 1
                continue
            zout_f.writestr(item, zin_f.read(fn))
            kept += 1
        for fn in sorted(dir_map):
            if fn not in written:
                with open(dir_map[fn], "rb") as fh:
                    zout_f.writestr(fn, fh.read())
                added += 1
        for fn, src in replace.items():
            if fn not in written:
                with open(src, "rb") as fh:
                    zout_f.writestr(fn, fh.read())
                added += 1
    finally:
        zout_f.close()
        zin_f.close()
    os.replace(tmp, ZIP_PATH)

    z = zipfile.ZipFile(ZIP_PATH)
    try:
        names = z.namelist()
        if not any("20260916090200_drama_character_portrait_data" in n for n in names):
            return fail("自检失败：portrait_data 迁移未注入")
        if b"duplicate column" not in z.read("init-db.cjs"):
            return fail("自检失败：init-db.cjs 非容错版")
        if any("20260803120000_comic_panel_sceneref" in n for n in names):
            return fail("自检失败：旧手工补丁仍在 zip 内")
        ver = json.loads(z.read("node_modules/@prisma/client/package.json")).get("version", "")
        if not ver.startswith("7.4"):
            return fail("自检失败：@prisma/client 版本 " + ver + " 与 lock 不符")
        bundle_size = len(z.read("bundle.cjs"))
        mig_count = len({n.split("/")[1] for n in names if n.startswith("migrations.sqlite/") and n.count("/") >= 2})
    finally:
        z.close()

    mb = os.path.getsize(ZIP_PATH) / (1024.0 * 1024.0)
    print("[inject] 完成: 替换=%d 新增=%d 删除旧条目=%d 保留=%d" % (replaced, added, deleted, kept))
    print("[inject] zip=%.1fMB bundle=%.1fMB 迁移=%d条 prisma=%s" % (mb, bundle_size / 1024.0 / 1024.0, mig_count, ver))
    return 0

if __name__ == "__main__":
    sys.exit(main())
