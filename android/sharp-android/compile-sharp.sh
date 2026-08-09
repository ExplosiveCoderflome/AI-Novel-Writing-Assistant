#!/bin/bash
# 编译 sharp 的 .node（bionic，链接 Termux libvips），输出到 C:/Android/vips/sharp.node
set -e
NDK=C:/Android/sdk/ndk/26.3.11579264
TOOLCHAIN=$NDK/toolchains/llvm/prebuilt/windows-x86_64
API=24
CC=$TOOLCHAIN/bin/aarch64-linux-android$API-clang.cmd
CXX=$TOOLCHAIN/bin/aarch64-linux-android$API-clang++.cmd

SRC=C:/Android/vips/sharp-src/package/src
OUT=C:/Android/vips/sharp.node
INCLUDE_DIRS="-IC:/Android/vips/shdev/package/include -IC:/Android/vips/termux/include -IC:/Android/vips/termux/include/glib-2.0 -IC:/Android/vips/termux/lib/glib-2.0/include"
NODE_INC="-IC:/Android/vips/node-v22.22.3/include/node"
NAA_INC="-IC:/Android/vips/node-addon-api/package"
LIBDIR=C:/Android/vips/termux/lib

LIBS="-lvips-cpp -lvips -lglib-2.0 -lgio-2.0 -lgobject-2.0 -lgmodule-2.0 -lz -lexpat -lfftw3 -lcfitsio -limagequant -lcgif -lexif -ljpeg -lpng16 -lwebp -lsharpyuv -lwebpmux -lwebpdemux -lpangocairo-1.0 -lpango-1.0 -lfontconfig -lcairo -lpangoft2-1.0 -ltiff -lrsvg-2 -lcairo-gobject -llcms2 -lOpenEXR-3_4 -lOpenEXRUtil-3_4 -lOpenEXRCore-3_4 -lIex-3_4 -lIlmThread-3_4 -lImath-3_2 -lopenjph -lopenjp2"

DEFINES="-DNAPI_VERSION=9 -DNODE_API_SWALLOW_UNTHROWABLE_EXCEPTIONS -DSHARP_USE_GLOBAL_LIBVIPS -DG_DISABLE_ASSERT -DG_DISABLE_CAST_CHECKS -DG_DISABLE_CHECKS -DNODE_ADDON_API_DISABLE_DEPRECATED -DVIPS_CPLUSPLUS_API="

echo "=== 编译 .o ==="
OBJS=""
for f in common metadata stats operations pipeline utilities sharp; do
  echo "  compiling $f.cc"
  $CXX $INCLUDE_DIRS $NODE_INC $NAA_INC $DEFINES \
    -std=c++17 -fexceptions -fPIC -O2 -Wall \
    -c $SRC/$f.cc -o C:/Android/vips/$f.o
  OBJS="$OBJS C:/Android/vips/$f.o"
done

echo "=== 链接 sharp.node ==="
$CXX -shared -o $OUT $OBJS \
  -L$LIBDIR -Wl,--no-as-needed $LIBS \
  -Wl,--disable-new-dtags -Wl,-z,nodelete \
  -fPIC -std=c++17 -fexceptions
echo "=== 完成: $OUT ==="
ls -la $OUT
