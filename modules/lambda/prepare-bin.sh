#!/bin/bash
mkdir -p bin
mkdir -p lib

unpack() {
    echo "Unpacking $1…"
    rm -rf bin/$1
    mkdir -p bin/$1
    curl -L $2 > bin/$1.tar.gz
    tar -xf bin/$1.tar.gz -C bin/$1
}

unpack_toolchain() {
    echo "Unpacking $1…"
    rm -rf bin/$1
    mkdir -p bin/$1_tc
    curl -L $2 > bin/$1.tar.gz
    tar -xf bin/$1.tar.gz -C bin/$1_tc
    mv bin/$1_tc/* bin/$1
    rm -rf bin/$1_tc
}

unpack_bz2_lib() {
    echo "Unpacking bz2 lib…"
    TMP=$TMPDIR/unpack_bz2_lib
    mkdir -p $TMP
    curl -L http://http.us.debian.org/debian/pool/main/b/bzip2/libbz2-1.0_1.0.6-9.2~deb10u1_amd64.deb > $TMP/bz2.deb
    ( cd $TMP ; ar -x $TMP/bz2.deb )
    tar -xf $TMP/data.tar.xz -C $TMP
    cp $TMP/lib/x86_64-linux-gnu/libbz2.so.1.0 ./lib
    rm -rf $TMP
}

# BZ2 Lib 
BZ2_LIB_URL=http://http.us.debian.org/debian/pool/main/b/bzip2/libbz2-1.0_1.0.6-9.2~deb10u1_amd64.deb

unpack_bz2_lib $BZ2_LIB_URL

# Icarus Verilog
IVERILOG_URL=https://github.com/FPGAwars/toolchain-iverilog/releases/download/v1.1.1/toolchain-iverilog-linux_x86_64-1.1.1.tar.gz

unpack iverilog $IVERILOG_URL

# Yosys
YOSYS_URL=https://github.com/FPGAwars/toolchain-yosys/releases/download/v2019.12.11/toolchain-yosys-linux_x86_64-2019.12.11.tar.gz

unpack yosys $YOSYS_URL

# Icestorm
ICESTORM_URL=https://github.com/FPGAwars/toolchain-icestorm/releases/download/v1.11.1/toolchain-icestorm-linux_x86_64-1.11.1.tar.gz

unpack icestorm $ICESTORM_URL

# GNU/RISC V
GNU_RV64_URL=https://static.dev.sifive.com/dev-tools/riscv64-unknown-elf-gcc-8.3.0-2020.04.0-x86_64-linux-centos6.tar.gz

unpack_toolchain riscv64 $GNU_RV64_URL

# GNU/ARM
GNU_ARM_URL=https://developer.arm.com/-/media/Files/downloads/gnu-rm/9-2020q2/gcc-arm-none-eabi-9-2020-q2-update-x86_64-linux.tar.bz2

unpack_toolchain arm $GNU_ARM_URL

# Cleanup
rm -f bin/*.tar.gz