const Checker = require("license-checker");

const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

Checker.initp = promisify(Checker.init);

async function main() {
    let prod = await Checker.initp({ start: ".", production: true });
    let dev = await Checker.initp({ start: ".", development: true });

    let compile = (packages) => {
        let final = ``;
        for (let name in packages) {
            let info = packages[name];
            let { licenseFile, publisher, licenses } = info;
            let licenseInfo = `© ${publisher} - ${licenses}`;
            if (licenseFile) {
                licenseInfo = fs.readFileSync(licenseFile, "utf8");
            }
            final += `
            ${name}
            
            ${licenseInfo}
            --
            `.replace(/^            /gm, "");
        }
        return final;
    };

    let customText = ``;

    let CUSTOM_MODULE_DIR = path.join(".", "modules");
    let customizedModules = fs.readdirSync(CUSTOM_MODULE_DIR);
    for (let name of customizedModules) {
        let modulePath = path.join(CUSTOM_MODULE_DIR, name);
        try {
            let licenseFile = fs
                .readdirSync(modulePath)
                .filter((f) => f.toLowerCase().includes("license"))[0];
            let licensePath = path.join(modulePath, licenseFile);

            customText += `
            ${name}
            
            ${fs.readFileSync(licensePath, "utf8")}
            ---
            `.replace(/^            /gm, "");
        } catch (error) {
            continue;
        }
    }

    let prodText = compile(prod);
    let devText = compile(dev);

    let custom = [customText, prodText, devText];
    fs.writeFileSync("./OSAcknowledgements.txt", custom.join("\n"));
}

main().catch((err) => {
    console.error(err);
    process.exit(-1);
});
