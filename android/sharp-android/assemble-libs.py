import os, zipfile

# DT_NEEDED from sharp.node (observed)
needed = [
 "libvips-cpp.so.42","libvips.so.42","libglib-2.0.so.0","libgio-2.0.so.0",
 "libgobject-2.0.so.0","libgmodule-2.0.so.0","libz.so.1","libexpat.so.1",
 "libfftw3.so","libcfitsio.so.10","libimagequant.so","libcgif.so","libexif.so",
 "libjpeg.so.8","libpng16.so","libwebp.so","libsharpyuv.so","libwebpmux.so",
 "libwebpdemux.so","libpangocairo-1.0.so.0","libpango-1.0.so.0","libfontconfig.so",
 "libcairo.so.2","libpangoft2-1.0.so.0","libtiff.so","librsvg-2.so","libcairo-gobject.so.2",
 "liblcms2.so","libOpenEXR-3_4.so","libOpenEXRUtil-3_4.so","libOpenEXRCore-3_4.so",
 "libIex-3_4.so","libIlmThread-3_4.so","libImath-3_2.so","libopenjph.so","libopenjp2.so",
 "libc++_shared.so",
]
LIBDIR="C:/Android/vips/termux/lib"
NDK="C:/Android/sdk/ndk/26.3.11579264/toolchains/llvm/prebuilt/windows-x86_64"
OUT="C:/Android/vips/jniLibs_arm64"
os.makedirs(OUT, exist_ok=True)

# Build a name->candidate map from LIBDIR (match by base name without version)
import re
def base(name):
    # strip version suffix like .42 or .0 or -3_4 etc -> match libX.so*
    m = re.match(r"^(lib[^.]+\.so)", name)
    return m.group(1) if m else name

avail = {}
for f in os.listdir(LIBDIR):
    if f.endswith('.so') or '.so.' in f:
        avail.setdefault(base(f), []).append(f)

missing=[]
copied=0
for n in needed:
    b=base(n)
    cands = avail.get(b, [])
    # prefer exact match, else first
    pick = n if n in cands else (cands[0] if cands else None)
    if not pick:
        missing.append(n); continue
    src=os.path.join(LIBDIR,pick)
    dst=os.path.join(OUT, pick)
    if not os.path.exists(dst):
        import shutil
        shutil.copy(src,dst)
    copied+=1
    # also copy the unversioned symlink name (libX.so) if exists, for linker
    unv = b  # libX.so
    if unv not in os.listdir(OUT):
        for c in cands:
            if c==unv:
                import shutil; shutil.copy(os.path.join(LIBDIR,c), os.path.join(OUT,unv))

# libc++_shared.so from NDK
ndk_lib=os.path.join(NDK,"sysroot","usr","lib","aarch64-linux-android","libc++_shared.so")
if os.path.exists(ndk_lib):
    import shutil
    shutil.copy(ndk_lib, os.path.join(OUT,"libc++_shared.so"))
    print("copied libc++_shared.so from NDK")
else:
    print("NDK libc++_shared.so NOT FOUND at", ndk_lib)

print(f"copied {copied} libs, missing {len(missing)}: {missing}")
print("OUT dir:", OUT)
