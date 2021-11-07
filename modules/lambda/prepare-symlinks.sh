#!/bin/bash
rm -rf db/controllers
rm -rf db/models
rm -rf db/config
rm -rf db/modules
mkdir db/modules

ln -s ../../../models db/models
ln -s ../../../controllers db/controllers
ln -s ../../../config db/config

# Modules
ln -s ../../../utils.js db/modules
ln -s ../../../parser.js db/modules
ln -s ../../../vcd-to-json.js db/modules
ln -s ../../../boards db/modules

# Custom Modules
ln -s ../../../../modules/mongoose-auto-increment db/modules
ln -s ../../../../modules/gcc-output-parser db/modules