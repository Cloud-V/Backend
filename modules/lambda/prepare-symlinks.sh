#!/bin/bash
rm -rf db/controllers
rm -rf db/models
rm -rf db/config
rm -rf db/modules
mkdir db/modules
rm -rf db/modules
mkdir db/modules

ln -s ../../../models db/models
ln -s ../../../controllers db/controllers
ln -s ../../../config db/config

# Modules
ln -s ../../../utils.js db/modules
ln -s ../../../parser.js db/modules
ln -s ../../../vcd-to-json.js db/modules
ln -s ../../../stdcells db/modules
ln -s ../../../stdcells-constr db/modules
ln -s ../../../stdcells-models db/modules
ln -s ../../../boards db/modules

# Custom Modules
ln -s ../../../../modules/mongoose-auto-increment db/modules
ln -s ../../../../modules/gcc-output-parser db/modules

for func in *
do
    if [ "$func" != "db" ] && [ "$func" != "bin" ] && [ "$func" != "lib" ] && [ "$func" != "node_modules" ] && [ -d "$func" ]; then
        rm -rf "$func/function/db" "$func/function/bin"  "$func/function/lib" "$func/function/node_modules" "$func/function/package.json"
        ln -s "../../db" "$func/function/db"
        ln -s "../../bin" "$func/function/bin"
        ln -s "../../lib" "$func/function/lib"
        ln -s "../../package.json" "$func/function/package.json"
        ln -s "../../node_modules" "$func/function/node_modules"
    fi
done
