const Repo = require("../controllers/repo");
const Simulator = require("../modules/simulator");
const WorkspaceB = require("../modules/workspace-batch");
const LambdaManager = require("../modules/lambda/manager");
const requestTimeout = require("../config").docker.timeout * 1000;

const express = require("express");

const router = express.Router();

router.get("/heartbeat", (req, res, next) => res.status(200).end());

router.post("/validate", async (req, res, next) => {
    try {
        const result = await LambdaManager.validate(req.body);
        return res.status(200).json(result.logs);
    } catch (err) {
        return res.status(500).json(err);
    }
});

router.post("/synthesize", async (req, res, next) => {
    if (req.body.synthType !== "async") {
        try {
            const result = await LambdaManager.synthesis(req.body);
            let { reportErr, synthContent, synthLog } = result;
            return res.status(200).json({
                reportErr,
                synthContent,
                synthLog
            });
        } catch (err) {
            return res.status(500).json(err);
        }
    } else {
        return prepareRepo(req, res, next, function(repo) {
            if (
                repo.topModule == null ||
                repo.topModuleEntry == null ||
                repo.topModule.trim() === ""
            ) {
                return res.status(500).json({
                    error: "You must set a top module for your project."
                });
            }
            let name = (req.body.name || "netlist").trim();
            if (name === "") {
                name = "netlist";
            }
            if (name.indexOf(".v", name.length - 2) !== -1) {
                name = name.substring(0, name.length - 2);
            }
            const synthName = `${name}.v`;
            const overwrite =
                req.body.overwrite != null ? req.body.overwrite : false;
            const stdcell = req.body.stdcell != null ? req.body.stdcell : null;

            const synthOptions = {
                flatten: true,
                purge: true,
                proc: true,
                memorymap: true,
                clockPeriod: "1",
                drivingCell: "DFFPOSX1",
                load: "0.1"
            };

            const bodyOptions = req.body.options;
            if (bodyOptions != null) {
                if (bodyOptions.flatten != null && !bodyOptions.flatten) {
                    synthOptions.flatten = false;
                }
                if (bodyOptions.purge != null && !bodyOptions.purge) {
                    synthOptions.purge = false;
                }
                if (bodyOptions.proc != null && !bodyOptions.proc) {
                    synthOptions.proc = false;
                }
                if (bodyOptions.memorymap != null && !bodyOptions.memorymap) {
                    synthOptions.memorymap = false;
                }

                if (bodyOptions.clockPeriod != null) {
                    if (
                        !/^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/gim.test(
                            bodyOptions.clockPeriod
                        )
                    ) {
                        return res.status(500).json({
                            error: "Invalid value for clock period."
                        });
                    }
                    synthOptions.clockPeriod = bodyOptions.clockPeriod;
                }
                if (bodyOptions.load != null) {
                    if (
                        !/^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/gim.test(
                            bodyOptions.load
                        )
                    ) {
                        return res.status(500).json({
                            error: "Invalid value for cell load."
                        });
                    }
                    synthOptions.load = bodyOptions.load;
                }
                if (bodyOptions.drivingCell != null) {
                    if (!/^\w+$/gim.test(bodyOptions.drivingCell)) {
                        return res.status(500).json({
                            error: "Invalid value for driving cell type."
                        });
                    }
                    synthOptions.drivingCell = bodyOptions.drivingCell;
                }
            }
            return WorkspaceB.synthesize(
                repo,
                req.body.netlist,
                req.body.report,
                stdcell,
                synthOptions,
                synthName,
                function(err, reportErr, synthContent, synthLog) {
                    if (err) {
                        return res.status(500).json(err);
                    } else {
                        if (err) {
                            return res.status(500).json(err);
                        } else {
                            return res.status(200).json({
                                reportErr,
                                synthContent,
                                synthLog
                            });
                        }
                    }
                }
            );
        });
    }
});
router.post("/bitstream", async (req, res, next) => {
    try {
        const result = await LambdaManager.bitstream(req.body, true);
        let { bitstreamContent, synthLog } = result;
        return res.status(200).json({
            bitstreamContent,
            synthLog
        });
    } catch (err) {
        return res.status(500).json(err);
    }
});
router.post("/sw", async (req, res, next) => {
    try {
        const target = req.body.target || "arm";
        const result =
            target === "riscv"
                ? await LambdaManager.swRiscV(req.body, true)
                : await LambdaManager.swArm(req.body, true);
        const { hexContent, listContent, compilationLog } = result;
        return res.status(200).json({
            hexContent,
            listContent,
            compilationLog
        });
    } catch (err) {
        return res.status(500).json(err);
    }
});
router.post("/simulate-testbench", async (req, res, next) => {
    try {
        const result = await LambdaManager.simulateTestbench(req.body);
        let {
            simulationErrors,
            simulationWarnings,
            simulationLog,
            vcd
        } = result;
        if (vcd == null || vcd.trim() === "") {
            return res.json({
                errors: simulationErrors,
                warnings: simulationWarnings,
                log: simulationLog
            });
        } else {
            const wave = await Simulator.generateWave(vcd);
            return res.status(200).json({
                errors: simulationErrors,
                warnings: simulationWarnings,
                log: simulationLog,
                wave,
                vcd
            });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json(err);
    }
});
router.post("/simulate-netlist", async (req, res, next) => {
    try {
        const result = await LambdaManager.simulateNetlist(req.body);
        let {
            simulationErrors,
            simulationWarnings,
            simulationLog,
            vcd
        } = result;
        if (vcd == null || vcd.trim() === "") {
            return res.json({
                errors: simulationErrors,
                warnings: simulationWarnings,
                log: simulationLog
            });
        } else {
            const wave = await Simulator.generateWave(vcd);
            return res.status(200).json({
                errors: simulationErrors,
                warnings: simulationWarnings,
                log: simulationLog,
                wave,
                vcd
            });
        }
        return res.status(200).json(result.logs);
    } catch (err) {
        return res.status(500).json(err);
    }
});
router.post("/validate-topmodule", async (req, res, next) => {
    try {
        const result = await LambdaManager.validateTopModule(req.body);
        return res.status(200).json(result.logs);
    } catch (err) {
        return res.status(500).json(err);
    }
});

function prepareRepo(req, res, next, cb) {
    const ownerName = req.body.username;
    const repoName = req.body.reponame;
    delete req.body.username;
    delete req.body.reponame;

    res.socket.setTimeout(requestTimeout);

    return Repo.getRepo(
        {
            repoName,
            ownerName
        },
        function(err, repo) {
            if (err) {
                return res.status(500).json(err);
            } else if (!repo) {
                return next();
            } else {
                return cb(repo);
            }
        }
    );
}

module.exports = router;
