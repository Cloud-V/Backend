# ☁️ The Cloud V Backend
These are the source files for the Cloud V backend, designed for Amazon Web Services.

It supports simulation, synthesis, creating bitstreams for FPGAs, and much more.

# Before you begin
Install the following as they are needed by all components of Cloud V:
* Node 14 with npm. You may want to install it using [tj/n](https://github.com/tj/n)
* yarn
* MongoDB

Make sure you also have the Frontend ready. The frontend is served statically and is decoupled from the API. It can be found at https://github.com/Cloud-V/Frontend.

# Dependencies
Data Storage
* **mongodb**
* **redis** (Optional)

Image Processing
* **pkg-config**
* **cairo**
* **libffi**
* **glib**

EDA Software
* **IcarusVerilog**
* **Yosys**
* **Icestorm**
* **Arachne PNR**
* **Qflow**

Software Compilation Dependencies
* **The ARM GNU Toolchain**
* **The RISC-V GNU Toolchain**
* **GNU Make**

# Bypassing most dependencies (Using docker)
* Visit [mongodb.com](https://www.mongodb.com) for instructions on how to install mongodb.
    * MongoDB is not included in the Docker image as we rely on cloud providers: the docker containers are recommended to be stateless and ephemeral for the most part.
* Visit [docker.com](https://docs.docker.com/get-docker/) for instructions on how to install Docker Community Edition.

To build the container, simply invoke:
```sh
yarn run build-docker
```

Then you can run it using:
```sh
docker run --rm -ti \
    --net=host\
    -e CLOUDV_USERS_URI=mongodb://localhost:27017/cloudv\
    -e CLOUDV_FS_URI=mongodb://localhost:27017/cloudvfs\
    -p 3000:3000\
    cloudv/app:latest\
    yarn run cons
```

You can also run it using the code in your current working directory, albeit very, very slowly.
```sh
docker run --rm -ti \
    -e CLOUDV_USERS_URI=mongodb://host.docker.internal:27017/cloudv\
    -e CLOUDV_FS_URI=mongodb://host.docker.internal:27017/cloudvfs\
    -v $PWD:/var/www/CloudV/cloudv\
    -w /var/www/CloudV/cloudv\
    -p 3000:3000\
    cloudv/base:latest\
    yarn run cons
``` 

# Installing Dependencies (Native)
## macOS
Get [Homebrew](https://brew.sh) and then:

`brew tap riscv/riscv`
`brew tap ArmMbed/homebrew-formulae`
`brew install redis pkg-config cairo libffi glib make riscv-tools arm-none-eabi-gcc icarus-verilog yosys`

* You will need to build icestorm and nextpnr-ice40 from scratch.
* Visit [mongodb.com](https://www.mongodb.com) for instructions on how to install mongodb.

## Debian-based Linuces
`sudo apt-get install mongodb redis pkg-config libcairo2-dev libffi-dev iverilog yosys make gcc-arm-none-eabi`

* You will need to build icestorm and nextpnr-ice40 from scratch.
* Visit [mongodb.com](https://www.mongodb.com) for instructions on how to install mongodb.
* Visit [sifive.com/software](https://www.sifive.com/software) for downloadable pre-built riscv binaries. 

Then get the RISCV GNU Toolchain from https://www.sifive.com/boards.

## All
AFTER you do ALL OF THAT:

`yarn install`

# Usage
Just one little note: You may need to find the IcarusVerilog ivl directory. If you installed iverilog using apt or brew, CloudV will be able to find it automatically when running with `npm run dev` and `npm run dev-proc`, but otherwise, you will have to export the `IVL_PATH` variable.

Make sure MongoDB is up and running.

Invoke `yarn run cons-dev` to start the API.

* You can also run the basic API and the long-running job manager separately: `npm run dev` and `yarn run dev-proc` in separate terminals.

# ⚖️ License
All rights reserved, the American University in Cairo and the Cloud V Project.

You may distribute the software or any of its constituent source files; in part or in whole; under the terms of the GNU Affero General Public License v3, or at your option, any later version. See 'License' for more information.
