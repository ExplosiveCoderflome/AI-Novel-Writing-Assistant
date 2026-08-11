cmake_minimum_required(VERSION 3.4.1)

add_library(nodejs-mobile-native-lib
             SHARED
             src/main/cpp/native-lib.cpp
             src/main/cpp/rn-bridge.cpp)

include_directories(src/main/cpp/libnode/include/node/)
include_directories(src/main/cpp/)

# nodejs-mobile 预编译运行时
add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION
                      ${CMAKE_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libnode.so)

find_library(log-lib log)

target_link_libraries(nodejs-mobile-native-lib
                      libnode
                      ${log-lib})
