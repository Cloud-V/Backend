const fs = require("fs");
const { promisify } = require("util");
const { exec } = require("child_process");
const path_module = require("path");

async function main() {
    if (process.env.IVL_PATH) {
        process.stdout.write(process.env.IVL_PATH);
        return;
    }
    let { stdout } = await promisify(exec)("which iverilog");
    let path = stdout.trim();
    let isSymlink = await new Promise((resolve, reject) => {
        fs.lstat(path, (err, stats) => {
            if (err) {
                reject(err);
            }
            resolve(stats.isSymbolicLink());
        });
    });

    let dpkgResult = null;
    try {
        dpkgResult = await promisify(exec)("which dpkg");
        dpkgResult = dpkgResult.stdout.trim();
    } catch (error) {
        // Not Debian-based
    }
    if (isSymlink) {
        path = fs.realpathSync(path);
        let installPath = path_module.dirname(path_module.dirname(path));
        process.stdout.write(path_module.join(installPath, "lib", "ivl"));
    } else if (dpkgResult) {
        let files = await promisify(exec)("dpkg -L iverilog");
        let fileList = files.stdout.split("\n");
        let file = fileList.filter((file) => file.endsWith("/ivl"))[0];
        process.stdout.write(file);
    } else {
        throw "[FATAL WARNING] Could not find the IcarusVerilog IVL directory- Set it manually using the environment variable IVL_PATH.";
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(78);
});
