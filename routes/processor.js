const Repo = require("../controllers/repo");
const VCD = require("../modules/vcd");
const LambdaManager = require("../modules/lambda_manager");
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
    try {
        const result = await LambdaManager.synthesis(req.body);
        let { reportErr, synthContent, synthLog } = result;
        return res.status(200).json({
            reportErr,
            synthContent,
            synthLog,
        });
    } catch (err) {
        return res.status(500).json(err);
    }
});
router.post("/bitstream", async (req, res, next) => {
    try {
        const result = await LambdaManager.bitstream(req.body);
        let { bitstreamContent, synthLog } = result;
        return res.status(200).json({
            bitstreamContent,
            synthLog,
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
                ? await LambdaManager.swRiscV(req.body)
                : await LambdaManager.swArm(req.body);
        const { hexContent, listContent, compilationLog } = result;
        return res.status(200).json({
            hexContent,
            listContent,
            compilationLog,
        });
    } catch (err) {
        return res.status(500).json(err);
    }
});
router.post("/simulate-testbench", async (req, res, next) => {
    try {
        const result = await LambdaManager.simulateTestbench(req.body);
        let { simulationErrors, simulationWarnings, simulationLog, vcd } =
            result;
        if (vcd == null || vcd.trim() === "") {
            return res.json({
                errors: simulationErrors,
                warnings: simulationWarnings,
                log: simulationLog,
            });
        } else {
            const wave = await VCD.toJSON(vcd);
            return res.status(200).json({
                errors: simulationErrors,
                warnings: simulationWarnings,
                log: simulationLog,
                wave,
                vcd,
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
        let { simulationErrors, simulationWarnings, simulationLog, vcd } =
            result;
        if (vcd == null || vcd.trim() === "") {
            return res.json({
                errors: simulationErrors,
                warnings: simulationWarnings,
                log: simulationLog,
            });
        } else {
            const wave = await VCD.toJSON(vcd);
            return res.status(200).json({
                errors: simulationErrors,
                warnings: simulationWarnings,
                log: simulationLog,
                wave,
                vcd,
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
            ownerName,
        },
        function (err, repo) {
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
