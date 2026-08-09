#!/usr/bin/env python3
import sys, os, re

PC_DIRS = [
    os.environ.get("PKG_CONFIG_PATH", "").split(os.pathsep)[0],
    r"C:\Android\vips\termux\lib\pkgconfig",
    r"C:/Android/vips/termux/lib/pkgconfig",
    r"C:\Android\vips\usr\lib\pkgconfig",
]
PC_DIRS = [d for d in PC_DIRS if d]
SYSROOT = r"C:\Android\sdk\ndk\26.3.11579264\toolchains\llvm\prebuilt\windows-x86_64\sysroot"

def find_pc(name):
    # name may be pkg or pkg.pc
    candidates = [name, name + ".pc"]
    for d in PC_DIRS:
        for c in candidates:
            p = os.path.join(d, c)
            if os.path.exists(p):
                return p
    return None

def parse(pc):
    data = {}
    with open(pc, encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.split("#")[0].strip()
            if not line:
                continue
            # .pc files mix `key=value` (prefix/includedir) and `key: value` (Name/Cflags/Libs)
            if ":" in line and not line.startswith(":"):
                k, v = line.split(":", 1)
            elif "=" in line:
                k, v = line.split("=", 1)
            else:
                continue
            k = k.strip()
            v = v.strip()
            if k and not k.startswith((" ", "\t")):
                data[k] = v
    return data

def subst(val, data):
    # simple ${var} substitution
    for _ in range(5):
        val = re.sub(r"\$\{([\w]+)\}", lambda mm: data.get(mm.group(1), ""), val)
    return val

def resolve(name):
    pc = find_pc(name)
    if not pc:
        return "", "", ""
    data = parse(pc)
    libs = subst(data.get("Libs", ""), data)
    cflags = subst(data.get("Cflags", ""), data)
    # inline requires (strip version constraints like "glib-2.0 >= 2.52")
    req = data.get("Requires", "") + " " + data.get("Requires.private", "")
    req = re.sub(r">\s*=\s*[\d.]+", "", req)  # drop >= version
    req = re.sub(r"<\s*=\s*[\d.]+", "", req)
    req = re.sub(r"[,\s]+", " ", req).strip()
    return libs, cflags, req

def main():
    args = sys.argv[1:]
    if "--version" in args:
        print("0.29.2-fake")
        return
    if "--exists" in args:
        name = args[-1]
        sys.exit(0 if find_pc(name) else 1)
    if "--modversion" in args:
        name = args[-1]
        pc = find_pc(name)
        if pc:
            d = parse(pc)
            print(d.get("Version", ""))
        return
    if "--cflags" in args:
        name = args[-1]
        _, cflags, req = resolve(name)
        out = cflags
        for r in req.split():
            if r:
                _, rc, _ = resolve(r)
                out += " " + rc
        print(out)
        return
    if "--libs" in args:
        name = args[-1]
        libs, _, req = resolve(name)
        out = libs
        for r in req.split():
            if r:
                rl, _, _ = resolve(r)
                out += " " + rl
        print(out)
        return
    if "--static" in args:
        # crude: return libs + cflags
        name = args[-1]
        libs, cflags, req = resolve(name)
        out = cflags + " " + libs
        for r in req.split():
            if r:
                rl, rc, _ = resolve(r)
                out += " " + rc + " " + rl
        print(out)
        return
    # default: print both
    name = args[-1]
    libs, cflags, req = resolve(name)
    out = cflags + " " + libs
    for r in req.split():
        if r:
            rl, rc, _ = resolve(r)
            out += " " + rc + " " + rl
    print(out)

if __name__ == "__main__":
    main()
