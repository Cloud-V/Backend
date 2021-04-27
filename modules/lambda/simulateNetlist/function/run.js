const { spawn } = require("child_process");
const path = require("path");

const prepareNetlistSimulation = require("./db/prepare").netlistSimulation;
const wrapRun = require("./db/wrap-run");
const { processSimulation, processVVP } = require("./db/output_parser");

const rmdir = require("rimraf");
const fs = require("fs-extra");

module.exports = async ({
    repository,
    item,
    level,
    simulationTime,
    netlist,
    stdcell
}) => {
    return new Promise(async (resolve, reject) => {
        let stderr = "";
        let stdout = "";
        try {
            const commandData = await prepareNetlistSimulation(repository, {
                item,
                level,
                simulationTime,
                netlist,
                stdcell
            });
            const {
                stdout: iverilogStdout,
                stderr: iverilogStderr
            } = await wrapRun(commandData.simulationCommand, {
                cwd: commandData.repoPath
            });

            const {
                synthErrors,
                synthWarnings,
                synthLog
            } = await processSimulation(
                iverilogStdout,
                iverilogStderr,
                commandData
            );
            if (synthErrors.length > 0) {
                rmdir(commandData.wsPath, err => err && console.error(err));
                rmdir(commandData.buildPath, err => err && console.error(err));
                return resolve({
                    simulationErrors: synthErrors,
                    simulationWarnings: synthWarnings,
                    simulationLog: synthLog
                });
            }

            const { stdout: vvpStdout, stderr: vvpStderr } = await wrapRun(
                commandData.vvpCommand,
                {
                    cwd: commandData.wsPath
                }
            );

            const { simErrors, simWarnings, simLog } = await processVVP(
                vvpStdout,
                vvpStderr
            );

            if (simErrors.length > 0) {
                rmdir(commandData.wsPath, err => err && console.error(err));
                rmdir(commandData.buildPath, err => err && console.error(err));
                return resolve({
                    simulationErrors: synthErrors.concat(simErrors),
                    simulationWarnings: synthWarnings.concat(simWarnings),
                    simulationLog: synthLog.concat(simLog)
                });
            }

            const vcd = await fs.readFile(commandData.vcdPath, "utf8");
            rmdir(commandData.wsPath, err => err && console.error(err));
            rmdir(commandData.buildPath, err => err && console.error(err));

            return resolve({
                simulationErrors: synthErrors.concat(simErrors),
                simulationWarnings: synthWarnings.concat(simWarnings),
                simulationLog: synthLog.concat(simLog),
                vcd
            });
        } catch (err) {
            console.error(err);
            return reject(err);
        }
    });
};
