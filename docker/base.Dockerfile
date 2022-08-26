ARG BASE_IMAGE="node:14-buster"

FROM ${BASE_IMAGE}

# Set environment variables
ENV NODE_ENV production
ENV CLOUDV_LOGGING_LEVEL notice

# Expose the port the app runs in
EXPOSE 80 443 3000 8080 8081 8082 8083 8084 8085 4040

# Package manager setup
RUN apt-get update
ENV INST apt-get install -y --no-install-recommends

# Binaries
## GCC
WORKDIR /tmp
RUN $INST gcc-arm-none-eabi
RUN mkdir -p /usr/local
RUN curl -L https://static.dev.sifive.com/dev-tools/riscv64-unknown-elf-gcc-8.3.0-2020.04.1-x86_64-linux-ubuntu14.tar.gz | tar -xz --strip-components 1 -C /usr/local

## Icestorm
RUN $INST libreadline-dev gawk tcl-dev libffi-dev \
    graphviz xdot pkg-config libboost-all-dev zlib1g-dev \
    libftdi-dev qt5-default libeigen3-dev xz-utils \
    python3 python3-pip python3-dev

RUN curl -L https://github.com/Cloud-V/icestorm-builder/releases/download/0.0.2/icestorm.tar.xz | tar -xJC /

## IcarusVerilog
RUN $INST iverilog

# Get SCLs
RUN mkdir -p /Stdcells
RUN curl -L https://github.com/Cloud-V/Stdcells/tarball/94625cbab33855014d6abed0a554ae4176b61991 | tar --strip-components=1 -xzC /Stdcells

# Env Vars
ENV ARM_GNU_PATH arm-none-eabi
ENV ICEPACK_PATH icepack
ENV NEXTPNR_ICE40_PATH nextpnr-ice40
ENV YOSYS_PATH yosys
ENV RISC_GNU_PATH riscv64-unknown-elf

WORKDIR /