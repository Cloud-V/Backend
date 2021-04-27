const Parser = require("./parser");
const S3Manager = require("./s3_manager");
const JobManager = require("./job_manager");
const Environment = require("./environment");

const Config = require("../config");
const FileManager = require("../controllers/file_manager");
const CallbackToken = require("../controllers/callback_token");
const { EntryType } = require("../models/repo_entry");
const { CallbackType } = require("../models/callback_token");

const rmdir = require("rimraf");

const DockerConfig = Config.docker;

const createSimulationWorkspace = function(
    timeout,
    testbenchPath,
    testbenchRelativePath,
    dumpName,
    sourcePath,
    fullPath,
    filePaths,
    namesMap,
    cb
) {
    const Dockerode = require("dockerode");
    const docker = new Dockerode();
    return docker.createContainer(
        {
            Image: DockerConfig.workspaceImageName,
            Rm: true,
            Tty: true,
            StopTimeout: timeout,
            Cmd: ["/bin/bash"],
            Volumes: {
                "/ws": {}
            },
            Binds: [`${sourcePath}:/ws:ro`]
        },
        function(err, container) {
            if (err) {
                console.error(err);
                rmdir(fullPath, function(err) {
                    if (err) {
                        return console.error(err);
                    }
                });
                return cb({
                    error:
                        "Failed to prepare repository files for processing(0)."
                });
            }
            return container.start(function(err, data) {
                if (err) {
                    console.error(err);
                    rmdir(fullPath, function(err) {
                        if (err) {
                            return console.error(err);
                        }
                    });
                    return cb(
                        {
                            error:
                                "Failed to prepare repository files for processing(1)."
                        },
                        container
                    );
                }
                const environment = new Environment(
                    container,
                    timeout,
                    function(err) {
                        if (err) {
                            return cb(err);
                        } else {
                            return cb({
                                error: "Process timed-out."
                            });
                        }
                    }
                );
                return environment.copy(
                    "/ws/.",
                    DockerConfig.workspacePath,
                    true,
                    function(err, stdout, stderr) {
                        rmdir(fullPath, function(err) {
                            if (err) {
                                return console.error(err);
                            }
                        });
                        if (err) {
                            return cb(err);
                        } else if (stderr) {
                            environment.checkAndDestroy();
                            return cb({
                                error:
                                    "Failed to prepare repository files for processing."
                            });
                        } else {
                            return environment.cd(
                                DockerConfig.workspacePath,
                                true,
                                function(err, stdout, stderr) {
                                    if (err) {
                                        return cb(err);
                                    } else if (stderr) {
                                        environment.checkAndDestroy();
                                        return cb({
                                            error:
                                                "Failed to prepare repository files for processing."
                                        });
                                    } else {
                                        return cb(
                                            null,
                                            environment,
                                            dumpName,
                                            testbenchPath,
                                            testbenchRelativePath,
                                            filePaths,
                                            namesMap
                                        );
                                    }
                                }
                            );
                        }
                    }
                );
            });
        }
    );
};

const createTestbenchSimulationWorkspace = (
    repo,
    item,
    simulationTime,
    timeout,
    cb
) =>
    FileManager.writeTestbenchSimulationContainerFiles(
        repo,
        item,
        simulationTime,
        function(
            err,
            testbenchPath,
            testbenchRelativePath,
            dumpName,
            sourcePath,
            fullPath,
            filePaths,
            namesMap
        ) {
            if (err) {
                return cb(err);
            }
            return createSimulationWorkspace(
                timeout,
                testbenchPath,
                testbenchRelativePath,
                dumpName,
                sourcePath,
                fullPath,
                filePaths,
                namesMap,
                cb
            );
        }
    );

const createNetlistSimulationWorkspace = (
    repo,
    item,
    netlist,
    stdcell,
    simulationTime,
    timeout,
    cb
) =>
    FileManager.writeNetlistSimulationContainerFiles(
        repo,
        item,
        netlist,
        stdcell,
        simulationTime,
        function(
            err,
            testbenchPath,
            testbenchRelativePath,
            dumpName,
            sourcePath,
            fullPath,
            filePaths,
            namesMap
        ) {
            if (err) {
                return cb(err);
            }
            return createSimulationWorkspace(
                timeout,
                testbenchPath,
                testbenchRelativePath,
                dumpName,
                sourcePath,
                fullPath,
                filePaths,
                namesMap,
                cb
            );
        }
    );

const createSynthesisWorkspace = (repo, includeTestbenches, cb) =>
    FileManager.writeSynthesisContainerFiles(
        repo,
        includeTestbenches,
        false,
        "",
        function(err, result) {
            if (err) {
                return cb(err);
            }
            const {
                sourcePath,
                fullPath,
                filePaths,
                fullPaths,
                relativePaths,
                namesMap
            } = result;
            return cb(null, sourcePath, "", filePaths, namesMap, fullPath);
        }
    );
const createBitstreamGenerationWorkspace = (repo, pcfId, timeout, cb) =>
    FileManager.writeSynthesisContainerFiles(repo, false, false, "", function(
        err,
        sourcePath,
        fullPath,
        filePaths,
        parentPaths,
        relativeParentPaths,
        namesMap
    ) {
        if (err) {
            return cb(err);
        }
        const Dockerode = require("dockerode");
        const docker = new Dockerode();
        return docker.createContainer(
            {
                Image: DockerConfig.workspaceImageName,
                Rm: true,
                Tty: true,
                StopTimeout: timeout,
                Cmd: ["/bin/bash"],
                Volumes: {
                    "/ws": {}
                },
                Binds: [`${sourcePath}:/ws:ro`]
            },
            function(err, container) {
                if (err) {
                    console.error(err);
                    rmdir(fullPath, function(err) {
                        if (err) {
                            return console.error(err);
                        }
                    });
                    return cb({
                        error:
                            "Failed to prepare repository files for processing(0)."
                    });
                }
                return container.start(function(err, data) {
                    if (err) {
                        console.error(err);
                        rmdir(fullPath, function(err) {
                            if (err) {
                                return console.error(err);
                            }
                        });
                        return cb(
                            {
                                error:
                                    "Failed to prepare repository files for processing(1)."
                            },
                            container
                        );
                    }
                    const environment = new Environment(
                        container,
                        timeout,
                        function(err) {
                            if (err) {
                                return cb(err);
                            } else {
                                return cb({
                                    error: "Process timed-out."
                                });
                            }
                        }
                    );
                    return environment.copy(
                        "/ws/.",
                        DockerConfig.workspacePath,
                        true,
                        function(err, stdout, stderr) {
                            rmdir(fullPath, function(err) {
                                if (err) {
                                    return console.error(err);
                                }
                            });
                            if (err) {
                                return cb(err);
                            } else if (stderr) {
                                environment.checkAndDestroy();
                                return cb({
                                    error:
                                        "Failed to prepare repository files for processing."
                                });
                            } else {
                                return environment.cd(
                                    DockerConfig.workspacePath,
                                    true,
                                    function(err, stdout, stderr) {
                                        if (err) {
                                            return cb(err);
                                        } else if (stderr) {
                                            environment.checkAndDestroy();
                                            return cb({
                                                error:
                                                    "Failed to prepare repository files for processing."
                                            });
                                        } else {
                                            return cb(
                                                null,
                                                environment,
                                                filePaths,
                                                namesMap
                                            );
                                        }
                                    }
                                );
                            }
                        }
                    );
                });
            }
        );
    });
const createCompilationWorkspace = (repo, timeout, cb) =>
    FileManager.writeCompilationContainerFiles(repo, function(
        err,
        sourcePath,
        fullPath,
        filePaths,
        parentPaths,
        relativeParentPaths,
        namesMap
    ) {
        if (err) {
            return cb(err);
        }
        const Dockerode = require("dockerode");
        const docker = new Dockerode();
        return docker.createContainer(
            {
                Image: DockerConfig.workspaceImageName,
                Rm: true,
                Tty: true,
                StopTimeout: timeout,
                Cmd: ["/bin/bash"],
                Volumes: {
                    "/ws": {}
                },
                Binds: [`${sourcePath}:/ws:ro`]
            },
            function(err, container) {
                if (err) {
                    console.error(err);
                    rmdir(fullPath, function(err) {
                        if (err) {
                            return console.error(err);
                        }
                    });
                    return cb({
                        error:
                            "Failed to prepare repository files for processing(0)."
                    });
                }
                return container.start(function(err, data) {
                    if (err) {
                        console.error(err);
                        rmdir(fullPath, function(err) {
                            if (err) {
                                return console.error(err);
                            }
                        });
                        return cb(
                            {
                                error:
                                    "Failed to prepare repository files for processing(1)."
                            },
                            container
                        );
                    }
                    const environment = new Environment(
                        container,
                        timeout,
                        function(err) {
                            if (err) {
                                return cb(err);
                            } else {
                                return cb({
                                    error: "Process timed-out."
                                });
                            }
                        }
                    );
                    return environment.copy(
                        "/ws/.",
                        DockerConfig.workspacePath,
                        true,
                        function(err, stdout, stderr) {
                            rmdir(fullPath, function(err) {
                                if (err) {
                                    return console.error(err);
                                }
                            });
                            if (err) {
                                return cb(err);
                            } else if (stderr) {
                                environment.checkAndDestroy();
                                return cb({
                                    error:
                                        "Failed to prepare repository files for processing."
                                });
                            } else {
                                return environment.cd(
                                    DockerConfig.workspacePath,
                                    true,
                                    function(err, stdout, stderr) {
                                        if (err) {
                                            return cb(err);
                                        } else if (stderr) {
                                            environment.checkAndDestroy();
                                            return cb({
                                                error:
                                                    "Failed to prepare repository files for processing."
                                            });
                                        } else {
                                            return cb(
                                                null,
                                                environment,
                                                filePaths,
                                                namesMap
                                            );
                                        }
                                    }
                                );
                            }
                        }
                    );
                });
            }
        );
    });

const prepareSimulation = (
    item,
    environment,
    dumpName,
    testbenchPath,
    testbenchRelativePath,
    filePaths,
    namesMap,
    cb
) =>
    item.getContent(function(err, content) {
        if (err) {
            environment.checkAndDestroy();
            return cb(err);
        }
        const tbModules = Parser.extractModules(content);
        if (tbModules.length === 0) {
            environment.checkAndDestroy();
            return cb({
                error: "Cannot extract top module."
            });
        }
        if (tbModules.length > 1) {
            environment.checkAndDestroy();
            return cb({
                error: "Only one top module per testbench is supported."
            });
        }
        const topModule = tbModules[0];

        const data = {
            vvpName: `${Date.now()}.vvp`
        };

        let fileArgs = `${testbenchRelativePath.substr(
            testbenchRelativePath.indexOf("/") + 1
        )}`;
        const fileArgsArray = [fileArgs];
        for (let file of Array.from(filePaths.verilog)) {
            file = file.substr(file.indexOf("/") + 1);
            fileArgs = `${fileArgs} ${file}`;
            fileArgsArray.push(`${file}`);
        }
        data.vvpPath = path.join(DockerConfig.buildPath, data.vvpName);
        data.vvpCommand = ["vvp", data.vvpPath];
        data.simulationCommand = ["iverilog"].concat([
            "-s",
            topModule,
            "-Wall",
            "-Wno-timescale",
            "-o",
            data.vvpPath
        ]).concat(fileArgsArray);
        data.vcdPath = path.join(DockerConfig.workspacePath, dumpName);
        data.namesMap = namesMap;
        const cmd = `iverilog -s ${topModule} -Wall -Wno-timescale -o ${
            data.vvpPath
        } ${fileArgs}`;
        return cb(null, environment, data);
    });

const prepareNetlistSimulation = (
    repo,
    item,
    netlist,
    stdcell,
    simulationTime,
    cb
) =>
    createNetlistSimulationWorkspace(
        repo,
        item,
        netlist,
        stdcell,
        simulationTime,
        DockerConfig.timeout,
        function(
            err,
            environment,
            dumpName,
            testbenchPath,
            testbenchRelativePath,
            filePaths,
            namesMap
        ) {
            if (err) {
                return cb(err);
            }
            return prepareSimulation(
                item,
                environment,
                dumpName,
                testbenchPath,
                testbenchRelativePath,
                filePaths,
                namesMap,
                cb
            );
        }
    );

const prepareTestbenchSimulation = (repo, item, simulationTime, cb) =>
    createTestbenchSimulationWorkspace(
        repo,
        item,
        simulationTime,
        DockerConfig.timeout,
        function(
            err,
            environment,
            dumpName,
            testbenchPath,
            testbenchRelativePath,
            filePaths,
            namesMap
        ) {
            if (err) {
                return cb(err);
            }
            return prepareSimulation(
                item,
                environment,
                dumpName,
                testbenchPath,
                testbenchRelativePath,
                filePaths,
                namesMap,
                cb
            );
        }
    );

const prepareSynthesis = function(
    repo,
    stdcell,
    synthOptions,
    synthName,
    includeTestbenches,
    cb
) {
    if (
        repo.topModule == null ||
        repo.topModuleEntry == null ||
        repo.topModule.trim() === ""
    ) {
        return cb({
            error: "You must set a top module for your project"
        });
    }
    const { topModule } = repo;
    const topModuleEntryId = repo.topModuleEntry;
    return repo.getEntry(
        {
            _id: topModuleEntryId
        },
        function(err, topModuleEntry) {
            if (err) {
                return cb(err);
            } else if (!topModuleEntry) {
                return cb({
                    error:
                        "Cannot find the source file containing the top module."
                });
            } else {
                return Parser.moduleExistsInFile(
                    topModuleEntry._id,
                    topModule,
                    function(err, exists) {
                        if (err) {
                            return cb(err);
                        } else if (!exists) {
                            return cb({
                                error: `Module '${topModule}' does not exist in '${
                                    topModuleEntry.title
                                }'.`
                            });
                        } else {
                            return createSynthesisWorkspace(
                                repo,
                                includeTestbenches,
                                function(
                                    err,
                                    sourcePath,
                                    relativePath,
                                    filePaths,
                                    namesMap,
                                    tempPath
                                ) {
                                    if (err) {
                                        return cb(err);
                                    } else {
                                        const wsPath =
                                            DockerConfig.workspacePath;
                                        const { buildPath } = DockerConfig;
                                        let stdcellOpt = [];
                                        let flattenOpt = [];
                                        let purgeOpt = [];
                                        let procOpt = [];
                                        let memorymapOpt = [];
                                        const stdcellPath = path.join(
                                            DockerConfig.stdcellsPath,
                                            `${stdcell}`
                                        );
                                        const abcPath = stdcellPath;
                                        //-------------- New Script ----
                                        // synthScript = "hierarchy -check -top #{repo.topModule}"
                                        let synthScript = "";
                                        synthScript =
                                            "write_file constraints_file.constr <<EOF";
                                        if (
                                            synthOptions.drivingCell != null &&
                                            synthOptions.load != null
                                        ) {
                                            synthScript = `${synthScript}\nset_driving_cell ${
                                                synthOptions.drivingCell
                                            }`;
                                            synthScript = `${synthScript}\nset_load ${
                                                synthOptions.load
                                            }`;
                                        }
                                        synthScript = `${synthScript}\nEOF`;
                                        if (synthOptions.flatten) {
                                            flattenOpt = ["-p", "flatten"];
                                            synthScript = `${synthScript}\nsynth -flatten -top ${
                                                repo.topModule
                                            }`;
                                            synthScript = `${synthScript}\nflatten`;
                                        } else {
                                            synthScript = `${synthScript}\nsynth -top ${
                                                repo.topModule
                                            }`;
                                        }

                                        synthScript = `${synthScript}\ndfflibmap -liberty ${stdcellPath}`;
                                        synthScript = `${synthScript}\nabc -D ${
                                            synthOptions.clockPeriod != null
                                                ? synthOptions.clockPeriod
                                                : 1
                                        } -constr constraints_file.constr -liberty ${abcPath}`;

                                        if (synthOptions.purge) {
                                            purgeOpt = [
                                                "-p",
                                                "opt_clean -purge"
                                            ];
                                            synthScript = `${synthScript}\nopt_clean -purge`;
                                        }

                                        synthScript = `${synthScript}\nclean`;

                                        const synthScriptFileName = `.${shortid.generate()}_${Date.now()}.synth`;
                                        const synthScriptPath = path.join(
                                            sourcePath,
                                            synthScriptFileName
                                        );

                                        if (synthOptions.proc) {
                                            procOpt = ["-p", "proc"];
                                        }

                                        memorymapOpt = [
                                            "-p",
                                            "memory_collect",
                                            "-p",
                                            "memory_map"
                                        ];
                                        synthScript = `${synthScript}\nmemory_collect\nmemory_map`;

                                        const reportName = `${synthName}_rpt.txt`;
                                        const reportFullPath = path.join(
                                            sourcePath,
                                            reportName
                                        );
                                        const synthFullPath = path.join(
                                            sourcePath,
                                            synthName
                                        );
                                        const reportPath = path.join(
                                            relativePath,
                                            reportName
                                        );
                                        const synthPath = path.join(
                                            relativePath,
                                            synthName
                                        );

                                        synthScript = `${synthScript}\ntee -o ${reportPath} stat -top ${
                                            repo.topModule
                                        } -liberty ${stdcellPath}`;
                                        synthScript = `${synthScript}\nwrite_verilog -noattr -noexpr ${synthPath}`;

                                        if (
                                            stdcell != null &&
                                            stdcell.trim() !== ""
                                        ) {
                                            try {
                                                const stat = fs.lstatSync(
                                                    path.join(
                                                        process.cwd(),
                                                        `modules/stdcells/${stdcell}`
                                                    )
                                                );
                                                stdcellOpt = [
                                                    "-p",
                                                    `dfflibmap -liberty ${stdcellPath}`,
                                                    "-p",
                                                    `abc -liberty ${abcPath}`
                                                ];
                                            } catch (e) {
                                                console.error(e);
                                                return cb({
                                                    error: `Cannot find the standard cell library ${stdcell}`
                                                });
                                            }
                                        } else {
                                            return cb({
                                                error:
                                                    "Missing standard cell library file."
                                            });
                                        }

                                        const vestaCommand = [
                                            "vesta",
                                            `${synthPath}`,
                                            `${stdcellPath}`
                                        ];
                                        const data = {
                                            reportName,
                                            reportPath,
                                            reportFullPath,
                                            wsPath,
                                            synthName,
                                            synthPath,
                                            synthFullPath,
                                            vestaCommand,
                                            relativePath,
                                            synthScriptFileName,
                                            synthScriptPath,
                                            tempPath
                                        };

                                        data.sourcePath = sourcePath;
                                        data.filePaths = filePaths;
                                        data.namesMap = namesMap;
                                        const args = [];
                                        const validationFileArgs = [];
                                        for (let file of Array.from(
                                            filePaths.verilog
                                        )) {
                                            args.push("-p");
                                            args.push("read_verilog");
                                            args.push(
                                                `\"${file.substr(
                                                    file.indexOf("/") + 1
                                                )}\"`
                                            );
                                            validationFileArgs.push(
                                                `${file.substr(
                                                    file.indexOf("/") + 1
                                                )}`
                                            );
                                            synthScript = `read_verilog \"${file.substr(
                                                file.indexOf("/") + 1
                                            )}\"\n${synthScript}`;
                                        }

                                        const hierarchyCommand = [
                                            "-p",
                                            `hierarchy -check -top ${
                                                repo.topModule
                                            }`
                                        ];
                                        const techmapCommand = [
                                            "-p",
                                            "opt",
                                            "-p",
                                            "techmap",
                                            "-p",
                                            "opt"
                                        ];
                                        const cleanCommand = ["-p", "clean"];
                                        const teeCommand = [
                                            "-p",
                                            `tee -o \"${reportPath}\" stat -top ${
                                                repo.topModule
                                            } -liberty ${stdcellPath}`
                                        ];
                                        const writeVerilogCommand = [
                                            "-p",
                                            `write_verilog -noattr -noexpr \"${synthPath}\"`
                                        ];
                                        const synthCommandArray = [
                                            require("../config").yosysCommand,
                                            "-q"
                                        ]
                                            .concat(args)
                                            .concat(hierarchyCommand)
                                            // .concat(procOpt)
                                            // .concat(techmapCommand)
                                            .concat(stdcellOpt)
                                            .concat(cleanCommand)
                                            .concat(memorymapOpt)
                                            .concat(flattenOpt)
                                            .concat(purgeOpt)
                                            .concat(teeCommand)
                                            .concat(writeVerilogCommand);
                                        const validationTopModule = [];
                                        data.synthCommand = synthCommandArray;
                                        data.synthScript = synthScript;

                                        // data.synthScriptCommand = [require("../config").yosysCommand, "-q", "-s", data.synthScriptFileName]
                                        data.synthScriptCommand = [
                                            require("../config").yosysCommand,
                                            "-s",
                                            data.synthScriptFileName
                                        ];
                                        data.iverilogValidationCommand = [
                                            require("../config")
                                                .iverilogCommand,
                                            "-g2005",
                                            "-t",
                                            "null",
                                            "-Wall",
                                            "-Wno-timescale"
                                        ].concat(validationFileArgs);
                                        data.verilatorValidationCommand = [
                                            "bash",
                                            require("../config")
                                                .verilatorCommand,
                                            "--bbox-unsup",
                                            "--top-module",
                                            filePaths.topModule,
                                            "--default-language",
                                            "1364-2005",
                                            "--error-limit",
                                            "100",
                                            "-Wno-STMTDLY",
                                            "--lint-only"
                                        ].concat(validationFileArgs);
                                        return cb(null, data);
                                    }
                                }
                            );
                        }
                    }
                );
            }
        }
    );
};

const prepareBitstreamGeneration = function(repo, pcfId, bitstreamName, cb) {
    if (
        repo.topModule == null ||
        repo.topModuleEntry == null ||
        repo.topModule.trim() === ""
    ) {
        return cb({
            error: "You must set a top module for your project"
        });
    }
    const { topModule } = repo;
    const topModuleEntryId = repo.topModuleEntry;
    return repo.getEntry(
        {
            _id: topModuleEntryId
        },
        function(err, topModuleEntry) {
            if (err) {
                return cb(err);
            } else if (!topModuleEntry) {
                return cb({
                    error:
                        "Cannot find the source file containing the top module."
                });
            } else {
                return Parser.moduleExistsInFile(
                    topModuleEntry._id,
                    topModule,
                    function(err, exists) {
                        if (err) {
                            return cb(err);
                        } else if (!exists) {
                            return cb({
                                error: `Module '${topModule}' does not exist in '${
                                    topModuleEntry.title
                                }'.`
                            });
                        } else {
                            return repo.getEntry(
                                {
                                    _id: pcfId,
                                    handler: EntryType.PCFFile
                                },
                                function(err, pcfEntry) {
                                    if (err) {
                                        return cb(err);
                                    } else if (!pcfEntry) {
                                        return cb({
                                            error:
                                                "Cannot find the pin constraints file."
                                        });
                                    } else {
                                        return pcfEntry.getContent(function(
                                            err,
                                            pcfContent
                                        ) {
                                            if (err) {
                                                return cb(err);
                                            } else {
                                                try {
                                                    pcfContent = JSON.parse(
                                                        pcfContent
                                                    );
                                                } catch (e) {
                                                    console.error(e);
                                                    return cb({
                                                        error:
                                                            "Failed to read pin constraints file."
                                                    });
                                                }
                                                let pcfGeneratedContent = "";
                                                for (let port in pcfContent.assignedPins) {
                                                    const pin =
                                                        pcfContent.assignedPins[
                                                            port
                                                        ];
                                                    pcfGeneratedContent = `${pcfGeneratedContent}set_io ${port} ${pin}\n`;
                                                }

                                                const pcfBoardOpt =
                                                    pcfContent.boardOpt ||
                                                    "hx1k";
                                                const pcfPnrOpt =
                                                    pcfContent.pnrOpt ||
                                                    "vq100";
                                                const wsPath =
                                                    DockerConfig.workspacePath;
                                                const {
                                                    buildPath
                                                } = DockerConfig;

                                                const makefilePath = path.join(
                                                    buildPath,
                                                    bitstreamName
                                                );

                                                const data = {
                                                    wsPath,
                                                    synthName: bitstreamName,
                                                    makefilePath,
                                                    pcfContent: pcfGeneratedContent,
                                                    pcfFileName: pcfEntry.title
                                                };

                                                return createBitstreamGenerationWorkspace(
                                                    repo,
                                                    pcfId,
                                                    DockerConfig.timeout,
                                                    function(
                                                        err,
                                                        environment,
                                                        filePaths,
                                                        namesMap
                                                    ) {
                                                        if (err) {
                                                            return cb(err);
                                                        } else {
                                                            data.namesMap = namesMap;
                                                            const args = [];
                                                            const validationFileArgs = [];
                                                            let makefileVerilogPaths =
                                                                "";
                                                            for (let file of Array.from(
                                                                filePaths.verilog
                                                            )) {
                                                                makefileVerilogPaths = `${makefileVerilogPaths} ${file.substr(
                                                                    file.indexOf(
                                                                        "/"
                                                                    ) + 1
                                                                )}`;
                                                                args.push("-p");
                                                                args.push(
                                                                    "read_verilog"
                                                                );
                                                                args.push(
                                                                    `\"${file.substr(
                                                                        file.indexOf(
                                                                            "/"
                                                                        ) + 1
                                                                    )}\"`
                                                                );
                                                                validationFileArgs.push(
                                                                    `${file.substr(
                                                                        file.indexOf(
                                                                            "/"
                                                                        ) + 1
                                                                    )}`
                                                                );
                                                                var synthScript = `read_verilog \"${file.substr(
                                                                    file.indexOf(
                                                                        "/"
                                                                    ) + 1
                                                                )}\"\n${synthScript}`;
                                                            }

                                                            let projectName = bitstreamName;
                                                            if (
                                                                projectName.indexOf(
                                                                    ".bin",
                                                                    projectName.length -
                                                                        4
                                                                ) !== -1
                                                            ) {
                                                                projectName = projectName.substring(
                                                                    0,
                                                                    projectName.length -
                                                                        4
                                                                );
                                                            }
                                                            data.bitstreamOutputPath = `${projectName}.bin`;
                                                            const makeFileContent = `\
PROJ = ${projectName}
PIN_DEF = ${pcfEntry.title}
DEVICE = ${pcfBoardOpt}

all: $(PROJ).rpt $(PROJ).bin


${projectName}.blif:
	yosys -p 'synth_ice40 -top ${topModule} -blif $@'${makefileVerilogPaths}

${projectName}.asc: $(PIN_DEF) ${projectName}.blif
	arachne-pnr -d $(subst up,,$(subst hx,,$(subst lp,,$(DEVICE)))) -o $@ -p $^ -P ${pcfPnrOpt}

${projectName}.bin: ${projectName}.asc
	icepack $< $@

${projectName}.rpt: ${projectName}.asc
	icetime -d $(DEVICE) -mtr $@ $<

prog: $(PROJ).bin
	iCEburn.py  -e -v -w  $<

sudo-prog: $(PROJ).bin
	@echo 'Executing prog as root!!!'
	iCEburn.py  -e -v -w  $<

clean:
	rm -f $(PROJ).blif $(PROJ).asc $(PROJ).rpt $(PROJ).bin

.PHONY: all prog clean\
`;

                                                            const hierarchyCommand = [
                                                                "-p",
                                                                `hierarchy -check -top ${
                                                                    repo.topModule
                                                                }`
                                                            ];
                                                            const techmapCommand = [
                                                                "-p",
                                                                "opt",
                                                                "-p",
                                                                "techmap",
                                                                "-p",
                                                                "opt"
                                                            ];
                                                            const cleanCommand = [
                                                                "-p",
                                                                "clean"
                                                            ];
                                                            const synthCommandArray = [
                                                                require("../config")
                                                                    .yosysCommand,
                                                                "-q"
                                                            ]
                                                                .concat(args)
                                                                .concat(
                                                                    hierarchyCommand
                                                                );
                                                            const validationTopModule = [];
                                                            data.synthCommandArray = synthCommandArray;
                                                            data.bitstreamMakefile = makeFileContent;
                                                            data.bitstreamMakefileName = `.${shortid.generate()}_${Date.now()}.mk`;
                                                            data.bitstreamMakefileCommand = [
                                                                "make",
                                                                "-f",
                                                                data.bitstreamMakefileName
                                                            ];
                                                            data.verilatorValidationCommand = [
                                                                "bash",
                                                                require("../config")
                                                                    .verilatorCommand,
                                                                "--bbox-unsup",
                                                                "--top-module",
                                                                filePaths.topModule,
                                                                "--default-language",
                                                                "1364-2005",
                                                                "--error-limit",
                                                                "100",
                                                                "-Wno-STMTDLY",
                                                                "--lint-only"
                                                            ].concat(
                                                                validationFileArgs
                                                            );
                                                            return cb(
                                                                null,
                                                                environment,
                                                                data
                                                            );
                                                        }
                                                    }
                                                );
                                            }
                                        });
                                    }
                                }
                            );
                        }
                    }
                );
            }
        }
    );
};
const prepareSWCompilation = function(repo, compilationName, cb) {
    const wsPath = DockerConfig.workspacePath;
    const { buildPath } = DockerConfig;

    const makefilePath = path.join(buildPath, compilationName);

    const data = {
        wsPath,
        compilationName,
        makefilePath
    };

    return createCompilationWorkspace(repo, DockerConfig.timeout, function(
        err,
        environment,
        filePaths,
        namesMap
    ) {
        if (err) {
            return cb(err);
        } else {
            data.namesMap = namesMap;
            const args = [];
            const validationFileArgs = [];
            // makefileVerilogPaths = ""
            // for file in filePaths.verilog
            // 	makefileVerilogPaths = "#{makefileVerilogPaths} #{file.substr(file.indexOf('/') + 1)}"
            // 	args.push '-p'
            // 	args.push "read_verilog"
            // 	args.push "\"#{file.substr(file.indexOf('/') + 1)}\""
            // 	validationFileArgs.push "#{file.substr(file.indexOf('/') + 1)}"
            // 	synthScript = "read_verilog \"#{file.substr(file.indexOf('/') + 1)}\"\n#{synthScript}"

            let projectName = compilationName;
            if (projectName.indexOf(".obj", projectName.length - 4) !== -1) {
                projectName = projectName.substring(0, projectName.length - 4);
            }
            data.compilationOutputPath = `${projectName}.obj`;
            const makeFileContent = `\
PROJ = ${projectName}
PIN_DEF = ${pcfEntry.title}
DEVICE = ${pcfBoardOpt}

all: $(PROJ).o


${projectName}.o:
yosys -p 'synth_ice40 -top ${topModule} -blif $@'${makefileVerilogPaths}

${projectName}.asc: $(PIN_DEF) ${projectName}.blif
arachne-pnr -d $(subst hx,,$(subst lp,,$(DEVICE))) -o $@ -p $^ -P ${pcfPnrOpt}

${projectName}.bin: ${projectName}.asc
icepack $< $@

${projectName}.rpt: ${projectName}.asc
icetime -d $(DEVICE) -mtr $@ $<

prog: $(PROJ).bin
iCEburn.py  -e -v -w  $<

sudo-prog: $(PROJ).bin
@echo 'Executing prog as root!!!'
iCEburn.py  -e -v -w  $<

clean:
rm -f $(PROJ).blif $(PROJ).asc $(PROJ).rpt $(PROJ).bin

.PHONY: all prog clean\
`;

            data.compilationMakefile = makeFileContent;
            data.compilationMakefileName = `.${shortid.generate()}_${Date.now()}.mk`;
            data.compilationMakefileCommand = [
                "make",
                "-f",
                data.compilationMakefileName
            ];
            return cb(makeFileContent);
            return cb(null, environment, data);
        }
    });
};

const prepareValidationThroughSynthesis = (
    repo,
    topModule,
    topModuleEntryId,
    stdcell,
    synthOptions,
    synthName,
    includeTestbenches,
    cb
) =>
    repo.getEntry(
        {
            _id: topModuleEntryId
        },
        function(err, topModuleEntry) {
            if (err) {
                return cb(err);
            } else if (!topModuleEntry) {
                return cb({
                    error:
                        "Cannot find the source file containing the top module."
                });
            } else {
                return Parser.moduleExistsInFile(
                    topModuleEntry._id,
                    topModule,
                    function(err, exists) {
                        if (err) {
                            return cb(err);
                        } else if (!exists) {
                            return cb({
                                error: `Module '${topModule}' does not exist in '${
                                    topModuleEntry.title
                                }'.`
                            });
                        } else {
                            const wsPath = DockerConfig.workspacePath;
                            const { buildPath } = DockerConfig;
                            let stdcellOpt = [];
                            let flattenOpt = [];
                            let purgeOpt = [];
                            let procOpt = [];
                            let memorymapOpt = [];
                            const stdcellPath = path.join(
                                DockerConfig.stdcellsPath,
                                `${stdcell}`
                            );
                            const abcPath = stdcellPath;
                            //-------------- New Script ----
                            // synthScript = "hierarchy -check -top #{repo.topModule}"
                            let synthScript = "";
                            synthScript =
                                "write_file constraints_file.constr <<EOF";
                            if (
                                synthOptions.drivingCell != null &&
                                synthOptions.load != null
                            ) {
                                synthScript = `${synthScript}\nset_driving_cell ${
                                    synthOptions.drivingCell
                                }`;
                                synthScript = `${synthScript}\nset_load ${
                                    synthOptions.load
                                }`;
                            }
                            synthScript = `${synthScript}\nEOF`;

                            if (synthOptions.flatten) {
                                flattenOpt = ["-p", "flatten"];
                                synthScript = `${synthScript}\nsynth -flatten -top ${topModule}`;
                                synthScript = `${synthScript}\nflatten`;
                            } else {
                                synthScript = `${synthScript}\nsynth -top ${topModule}`;
                            }

                            synthScript = `${synthScript}\ndfflibmap -liberty ${stdcellPath}`;
                            synthScript = `${synthScript}\nabc -D ${
                                synthOptions.clockPeriod != null
                                    ? synthOptions.clockPeriod
                                    : 1
                            } -constr constraints_file.constr -liberty ${abcPath}`;

                            if (synthOptions.purge) {
                                purgeOpt = ["-p", "opt_clean -purge"];
                                synthScript = `${synthScript}\nopt_clean -purge`;
                            }

                            synthScript = `${synthScript}\nclean`;

                            if (synthOptions.proc) {
                                procOpt = ["-p", "proc"];
                            }
                            // synthScript = "#{synthScript}\nproc"

                            // synthScript = "#{synthScript}\nopt\ntechmap\nopt"
                            // synthScript = "#{synthScript}\ndfflibmap -liberty #{stdcellPath}"
                            // synthScript = "#{synthScript}\nabc -liberty #{abcPath}"
                            // synthScript = "#{synthScript}\nclean"

                            // if synthOptions.memorymap
                            memorymapOpt = [
                                "-p",
                                "memory_collect",
                                "-p",
                                "memory_map"
                            ];
                            synthScript = `${synthScript}\nmemory_collect\nmemory_map`;

                            const reportName = `${synthName}_rpt.txt`;
                            const reportPath = path.join(buildPath, reportName);
                            const synthPath = path.join(buildPath, synthName);

                            synthScript = `${synthScript}\ntee -o ${reportPath} stat -top ${topModule} -liberty ${stdcellPath}`;
                            synthScript = `${synthScript}\nwrite_verilog -noattr -noexpr ${synthPath}`;

                            if (stdcell != null && stdcell.trim() !== "") {
                                try {
                                    const stat = fs.lstatSync(
                                        path.join(
                                            process.cwd(),
                                            `modules/stdcells/${stdcell}`
                                        )
                                    );
                                    stdcellOpt = [
                                        "-p",
                                        `dfflibmap -liberty ${stdcellPath}`,
                                        "-p",
                                        `abc -liberty ${abcPath}`
                                    ];
                                } catch (e) {
                                    console.error(e);
                                    return cb({
                                        error: `Cannot find the standard cell library ${stdcell}`
                                    });
                                }
                            } else {
                                return cb({
                                    error: "Missing standard cell library file."
                                });
                            }

                            const vestaCommand = [
                                "vesta",
                                `${synthPath}`,
                                `${stdcellPath}`
                            ];
                            const data = {
                                reportName,
                                reportPath,
                                wsPath,
                                synthName,
                                synthPath,
                                vestaCommand
                            };

                            return createSynthesisWorkspace(
                                repo,
                                includeTestbenches,
                                function(err, filePaths, namesMap) {
                                    if (err) {
                                        return cb(err);
                                    } else {
                                        data.namesMap = namesMap;
                                        const args = [];
                                        const validationFileArgs = [];
                                        for (let file of Array.from(
                                            filePaths.verilog
                                        )) {
                                            args.push("-p");
                                            args.push("read_verilog");
                                            args.push(
                                                `\"${file.substr(
                                                    file.indexOf("/") + 1
                                                )}\"`
                                            );
                                            validationFileArgs.push(
                                                `${file.substr(
                                                    file.indexOf("/") + 1
                                                )}`
                                            );
                                            synthScript = `read_verilog \"${file.substr(
                                                file.indexOf("/") + 1
                                            )}\"\n${synthScript}`;
                                        }

                                        const hierarchyCommand = [
                                            "-p",
                                            `hierarchy -check -top ${topModule}`
                                        ];
                                        const techmapCommand = [
                                            "-p",
                                            "opt",
                                            "-p",
                                            "techmap",
                                            "-p",
                                            "opt"
                                        ];
                                        const cleanCommand = ["-p", "clean"];
                                        const teeCommand = [
                                            "-p",
                                            `tee -o \"${reportPath}\" stat -top ${topModule} -liberty ${stdcellPath}`
                                        ];
                                        const writeVerilogCommand = [
                                            "-p",
                                            `write_verilog -noattr -noexpr \"${synthPath}\"`
                                        ];
                                        const synthCommandArray = [
                                            require("../config").yosysCommand,
                                            "-q"
                                        ]
                                            .concat(args)
                                            .concat(hierarchyCommand)
                                            .concat(procOpt)
                                            .concat(techmapCommand)
                                            .concat(stdcellOpt)
                                            .concat(cleanCommand)
                                            .concat(memorymapOpt)
                                            .concat(flattenOpt)
                                            .concat(purgeOpt)
                                            .concat(teeCommand)
                                            .concat(writeVerilogCommand);
                                        const validationTopModule = [];
                                        data.synthCommand = synthCommandArray;
                                        data.synthScript = synthScript;
                                        data.synthScriptFileName = `.${shortid.generate()}_${Date.now()}.synth`;
                                        data.synthScriptCommand = [
                                            require("../config").yosysCommand,
                                            "-q",
                                            "-s",
                                            data.synthScriptFileName
                                        ];
                                        data.iverilogValidationCommand = [
                                            require("../config")
                                                .iverilogCommand,
                                            "-g2005",
                                            "-t",
                                            "null",
                                            "-Wall",
                                            "-Wno-timescale"
                                        ].concat(validationFileArgs);
                                        data.verilatorValidationCommand = [
                                            "bash",
                                            require("../config")
                                                .verilatorCommand,
                                            "--bbox-unsup",
                                            "--top-module",
                                            topModule,
                                            "--default-language",
                                            "1364-2005",
                                            "--error-limit",
                                            "100",
                                            "-Wno-STMTDLY",
                                            "--lint-only"
                                        ].concat(validationFileArgs);
                                        return cb(null, environment, data);
                                    }
                                }
                            );
                        }
                    }
                );
            }
        }
    );

const processVerilatorValidation = function(err, stdout, stderr, data, cb) {
    let message;
    const warningRegexGenerator = () =>
        new RegExp("^%(Warning)-(\\w+):([\\s\\S]+)$", "igm");
    const errorRegexGenerator = () =>
        new RegExp("^%(Error)-(\\w+):([\\s\\S]+)$", "igm");
    const warningOnlyRegexGenerator = () =>
        new RegExp("^%(Warning):([\\s\\S]+)$", "igm");
    const errorOnlyRegexGenerator = () =>
        new RegExp("^%(Error):([\\s\\S]+)$", "igm");
    const warningDescribionRegexGenerator = () =>
        new RegExp(
            "^(Warning)-(\\w+): *Use[\\s\\S]+and lint_on around source to disable this message\\.$",
            "igm"
        );
    const fileExtractionRegexGenerator = () =>
        new RegExp("([\\s\\S]+) *: *(\\d+):([\\s\\S]+)", "igm");
    const synthErrors = [];
    const synthWarnings = [];

    if (stderr) {
        const errorLines = stderr.trim().split("\n");
        for (let index = 0; index < errorLines.length; index++) {
            var matches;
            const line = errorLines[index];
            if (line.trim() === "" || /^i give up\.$/i.test(line.trim())) {
                continue;
            }
            const logEntry = {
                message: line.substr(1),
                type: "error"
            };
            const errorRegex = errorRegexGenerator();
            const errorOnlyRegex = errorOnlyRegexGenerator();
            const fileName = undefined;
            const lineNumber = undefined;
            message = undefined;
            let isError = true;
            if (errorRegex.test(line)) {
                errorRegex.lastIndex = 0;
                matches = errorRegex.exec(line);
                if (matches != null) {
                    message = matches[3];
                }
            } else if (errorOnlyRegex.test(line)) {
                errorOnlyRegex.lastIndex = 0;
                matches = errorOnlyRegex.exec(line);
                if (matches != null) {
                    message = matches[2];
                }
            } else {
                const warningRegex = warningRegexGenerator();
                const warningOnlyRegex = warningOnlyRegexGenerator();
                if (warningRegex.test(line)) {
                    isError = false;
                    warningRegex.lastIndex = 0;
                    matches = warningRegex.exec(line);
                    if (matches != null) {
                        message = matches[3];
                    }
                } else if (warningOnlyRegex.test(line)) {
                    isError = false;
                    warningOnlyRegex.lastIndex = 0;
                    matches = warningOnlyRegex.exec(line);
                    if (matches != null) {
                        message = matches[2];
                    }
                }
            }
            const fileRegex = fileExtractionRegexGenerator();
            matches = fileRegex.exec(message);
            if (matches != null) {
                logEntry.fileName = matches[1].trim();
                logEntry.line = parseInt(matches[2]);
                if (data.namesMap.files[logEntry.fileName] != null) {
                    logEntry.file = data.namesMap.files[logEntry.fileName];
                }
            }
            if (!isError) {
                if (warningDescribionRegexGenerator().test(logEntry.message)) {
                    continue;
                }
                logEntry.type = "warning";
                synthWarnings.push(logEntry);
            } else {
                synthErrors.push(logEntry);
            }
        }
    }
    if (synthErrors.length > 1) {
        if (
            /Error: Command Failed/gim.test(
                synthErrors[synthErrors.length - 1].message
            )
        ) {
            synthErrors.splice(synthErrors.length - 1, 1);
            if (synthErrors.length) {
                if (
                    /Error: Exiting due to /gim.test(
                        synthErrors[synthErrors.length - 1].message
                    )
                ) {
                    synthErrors.splice(synthErrors.length - 1, 1);
                }
            }
        }
    }
    if (err && !synthErrors.length) {
        synthErrors.push({
            message: "Fatal error has occurred during validation."
        });
    }
    return cb(null, {
        errors: synthErrors,
        warnings: synthWarnings
    });
};
const processIVerilogValidation = function(err, stdout, stderr, data, cb) {
    let errorLines, file, line, logEntry, message, type;
    const errorParsingRegEx = () =>
        new RegExp("(.+)\\s*\\:\\s*(\\d+)\\s*\\:\\s*(.+)", "gm");
    const innerErrorRegEx = () =>
        new RegExp("\\s*(\\w+)\\s*\\:\\s*(.+)", "igm");
    if (err) {
        if (!stderr) {
            console.error(err);
            return cb({
                error: "An error occurred while validating."
            });
        }
    }
    let synthErrors = [];
    let synthWarnings = [];

    if (stderr) {
        errorLines = stderr.trim().split("\n");
        for (line of Array.from(errorLines)) {
            if (line.trim() === "" || /^i give up\.$/i.test(line.trim())) {
                continue;
            }
            logEntry = {
                message: line.trim()
            };
            const extractionRegEx = errorParsingRegEx();
            const errorMatches = extractionRegEx.exec(line);
            logEntry.file = null;
            logEntry.line = 0;
            logEntry.type = "error";
            if (errorMatches !== null) {
                file = errorMatches[1];
                line = errorMatches[2];
                let lineErr = errorMatches[3];
                if (innerErrorRegEx().test(lineErr)) {
                    const typeMatches = innerErrorRegEx().exec(lineErr);
                    type = typeMatches[1].toLowerCase();
                    lineErr = innerErrorRegEx().exec(lineErr)[2];
                }
                lineErr = lineErr.charAt(0).toUpperCase() + lineErr.slice(1);
                logEntry.file = data.namesMap.files[file];
                logEntry.fileName = file;
                logEntry.line = Number.parseInt(line);
                if (
                    !/error/i.test(type) &&
                    !/[\s\S]+\s*\:\s*syntax error/i.test(logEntry.message)
                ) {
                    logEntry.type = "warning";
                    synthWarnings.push(logEntry);
                } else {
                    synthErrors.push(logEntry);
                }
            } else {
                synthErrors.push(logEntry);
            }
        }
    }
    if (err && !synthErrors.length) {
        synthErrors.push("Fatal error has occurred during simulation.");
    }
    cb(null, {
        errors: synthErrors,
        warnings: synthWarnings
    });
    return;
    const warningRegexGenerator = () =>
        new RegExp("^%(Warning)-(\\w+):([\\s\\S]+)$", "igm");
    const errorRegexGenerator = () =>
        new RegExp("^%(Error)-(\\w+):([\\s\\S]+)$", "igm");
    const warningOnlyRegexGenerator = () =>
        new RegExp("^%(Warning):([\\s\\S]+)$", "igm");
    const errorOnlyRegexGenerator = () =>
        new RegExp("^%(Error):([\\s\\S]+)$", "igm");
    const warningDescribionRegexGenerator = () =>
        new RegExp(
            "^(Warning)-(\\w+): *Use[\\s\\S]+and lint_on around source to disable this message\\.$",
            "igm"
        );
    const fileExtractionRegexGenerator = () =>
        new RegExp("([\\s\\S]+) *: *(\\d+):([\\s\\S]+)", "igm");
    synthErrors = [];
    synthWarnings = [];

    if (stderr) {
        errorLines = stderr.trim().split("\n");
        for (let index = 0; index < errorLines.length; index++) {
            var matches;
            line = errorLines[index];
            if (line.trim() === "" || /^i give up\.$/i.test(line.trim())) {
                continue;
            }
            logEntry = {
                message: line.substr(1),
                type: "error"
            };
            const errorRegex = errorRegexGenerator();
            const errorOnlyRegex = errorOnlyRegexGenerator();
            const fileName = undefined;
            const lineNumber = undefined;
            message = undefined;
            let isError = true;
            if (errorRegex.test(line)) {
                errorRegex.lastIndex = 0;
                matches = errorRegex.exec(line);
                if (matches != null) {
                    message = matches[3];
                }
            } else if (errorOnlyRegex.test(line)) {
                errorOnlyRegex.lastIndex = 0;
                matches = errorOnlyRegex.exec(line);
                if (matches != null) {
                    message = matches[2];
                }
            } else {
                const warningRegex = warningRegexGenerator();
                const warningOnlyRegex = warningOnlyRegexGenerator();
                if (warningRegex.test(line)) {
                    isError = false;
                    warningRegex.lastIndex = 0;
                    matches = warningRegex.exec(line);
                    if (matches != null) {
                        message = matches[3];
                    }
                } else if (warningOnlyRegex.test(line)) {
                    isError = false;
                    warningOnlyRegex.lastIndex = 0;
                    matches = warningOnlyRegex.exec(line);
                    if (matches != null) {
                        message = matches[2];
                    }
                }
            }
            const fileRegex = fileExtractionRegexGenerator();
            matches = fileRegex.exec(message);
            if (matches != null) {
                logEntry.fileName = matches[1].trim();
                logEntry.line = parseInt(matches[2]);
                if (data.namesMap.files[logEntry.fileName] != null) {
                    logEntry.file = data.namesMap.files[logEntry.fileName];
                }
            }
            if (!isError) {
                if (warningDescribionRegexGenerator().test(logEntry.message)) {
                    continue;
                }
                logEntry.type = "warning";
                synthWarnings.push(logEntry);
            } else {
                synthErrors.push(logEntry);
            }
        }
    }
    if (synthErrors.length > 1) {
        if (
            /Error: Command Failed/gim.test(
                synthErrors[synthErrors.length - 1].message
            )
        ) {
            synthErrors.splice(synthErrors.length - 1, 1);
            if (synthErrors.length) {
                if (
                    /Error: Exiting due to /gim.test(
                        synthErrors[synthErrors.length - 1].message
                    )
                ) {
                    synthErrors.splice(synthErrors.length - 1, 1);
                }
            }
        }
    }
    if (err && !synthErrors.length) {
        synthErrors.push({
            message: "Fatal error has occurred during validation."
        });
    }
    return cb(null, {
        errors: synthErrors,
        warnings: synthWarnings
    });
};

const validateTopModule = (repo, topModuleEntry, topModuleEntryId, cb) =>
    prepareValidationThroughSynthesis(
        repo,
        topModuleEntry,
        topModuleEntryId,
        "osu018_stdcells.lib",
        {},
        "synth.v",
        false,
        function(err, environment, data) {
            if (err) {
                return cb(err);
            }
            return environment.run(
                data.iverilogValidationCommand,
                true,
                function(err, stdout, stderr) {
                    if (err) {
                        environment.checkAndDestroy();
                        return cb(err);
                    } else {
                        return processIVerilogValidation(
                            err,
                            stdout,
                            stderr,
                            data,
                            function(err, logs) {
                                if (err) {
                                    environment.checkAndDestroy();
                                    return cb(err);
                                } else {
                                    environment.destroy();
                                    return cb(null, logs);
                                }
                            }
                        );
                    }
                }
            );
        }
    );
const validate = (repo, cb) =>
    prepareSynthesis(
        repo,
        "osu018_stdcells.lib",
        {},
        "synth.v",
        false,
        function(err, environment, data) {
            if (err) {
                return cb(err);
            }
            return environment.run(
                data.iverilogValidationCommand,
                true,
                function(err, stdout, stderr) {
                    if (err) {
                        environment.checkAndDestroy();
                        return cb(err);
                    } else {
                        processIVerilogValidation(
                            err,
                            stdout,
                            stderr,
                            data,
                            function(err, logs) {
                                if (err) {
                                    environment.checkAndDestroy();
                                    return cb(err);
                                } else {
                                    environment.destroy();
                                    return cb(null, logs);
                                }
                            }
                        );
                        return;
                        return processVerilatorValidation(
                            err,
                            stdout,
                            stderr,
                            data,
                            function(err, logs) {
                                if (err) {
                                    environment.checkAndDestroy();
                                    return cb(err);
                                } else {
                                    environment.destroy();
                                    return cb(null, logs);
                                }
                            }
                        );
                    }
                }
            );
        }
    );

const synthesize = function(
    repo,
    netlistEntry,
    reportEntry,
    stdcell,
    synthOptions,
    synthName,
    cb
) {
    if (synthName == null) {
        synthName = "synth.v";
    }
    const clearS3File = (bucket, key, cb) => S3Manager.remove(bucket, key, cb);
    return prepareSynthesis(
        repo,
        stdcell,
        synthOptions,
        synthName,
        false,
        function(err, data) {
            if (err) {
                return cb(err);
            }

            return fs.writeFile(
                data.synthScriptPath,
                data.synthScript,
                function(err) {
                    if (err) {
                        console.error(err);
                        return cb({
                            error: "Failed to package the files."
                        });
                    } else {
                        const s3BaseName = `repo_${Date.now()}_${shortid.generate()}_${
                            repo.owner
                        }_${repo._id}`;
                        const s3FileName = `${s3BaseName}.zip`;
                        const s3OutDir = `${s3BaseName}.out`;
                        const s3OutLogName = "output-log.json";
                        const s3OutLogPath = path.join(s3OutDir, s3OutLogName);
                        return CallbackToken.createToken(
                            {
                                user: repo.owner, // To-Do: chanes to user
                                repo: repo._id,
                                entry: netlistEntry,
                                jobType: CallbackType.Synthesis,
                                resultPath: s3OutLogPath,
                                resultBucket: require("../config").s3.bucket,
                                reportEntry
                            },
                            function(err, token) {
                                if (err) {
                                    console.error(err);
                                    return cb({
                                        error: "Failed to package the files."
                                    });
                                } else {
                                    const invokationBody = {
                                        synthScriptCommand:
                                            data.synthScriptCommand,
                                        vestaCommand: data.vestaCommand,
                                        reportPath: data.reportPath,
                                        synthPath: data.synthPath,
                                        verilatorValidationCommand:
                                            data.verilatorValidationCommand,
                                        iverilogValidationCommand:
                                            data.iverilogValidationCommand,
                                        outputDir: s3OutDir,
                                        outputPath: s3OutLogPath,
                                        outputName: s3OutLogName,
                                        namesMap: data.namesMap,
                                        s3bucket: require("../config").s3
                                            .bucket,
                                        owner: repo.owner,
                                        repo: repo._id,
                                        operation: "synthesis",
                                        webhook:
                                            Config.webhook +
                                            "?token=" +
                                            encodeURIComponent(token.value) +
                                            "&repo=" +
                                            encodeURIComponent(repo._id)
                                    };

                                    return S3Manager.compressAndUpload(
                                        data.sourcePath,
                                        require("../config").s3.bucket,
                                        s3FileName,
                                        function(err, resp, s3Path) {
                                            if (err) {
                                                return cb(err);
                                            } else {
                                                rmdir(data.tempPath, function(
                                                    err
                                                ) {
                                                    if (err) {
                                                        return console.error(
                                                            err
                                                        );
                                                    }
                                                });
                                                return JobManager.submitSynthesisJob(
                                                    `${shortid.generate()}_${Date.now()}_job_synthesis_${
                                                        repo._id
                                                    }`,
                                                    `s3://${s3Path.bucket}/${
                                                        s3Path.key
                                                    }`,
                                                    invokationBody,
                                                    function(err, job) {
                                                        if (err) {
                                                            return cb(err);
                                                        }
                                                        return CallbackToken.updateToken(
                                                            token._id,
                                                            {
                                                                jobName:
                                                                    job.jobName,
                                                                jobId:
                                                                    job.jobId,
                                                                callbackUrl:
                                                                    invokationBody.webhook
                                                            },
                                                            function(
                                                                err,
                                                                updatedToken
                                                            ) {
                                                                if (err) {
                                                                    console.error(
                                                                        err
                                                                    );
                                                                }
                                                                return cb(
                                                                    null,
                                                                    job
                                                                );
                                                            }
                                                        );
                                                    }
                                                );
                                            }
                                        }
                                    );
                                }
                            }
                        );
                    }
                }
            );
        }
    );
};

const generateBitstream = function(repo, pcfId, bitstreamName, cb) {
    if (bitstreamName == null) {
        bitstreamName = "bitstream.bin";
    }
    return prepareBitstreamGeneration(repo, pcfId, bitstreamName, function(
        err,
        environment,
        data
    ) {
        if (err) {
            return cb(err);
        }
        return environment.run(data.verilatorValidationCommand, true, function(
            err,
            stdout,
            stderr
        ) {
            if (err) {
                environment.checkAndDestroy();
                return cb(err);
            } else {
                return processVerilatorValidation(
                    err,
                    stdout,
                    stderr,
                    data,
                    function(err, logs) {
                        if (err) {
                            environment.checkAndDestroy();
                            return cb(err);
                        } else {
                            if (logs.errors.length > 0) {
                                environment.destroy();
                                return cb(null, "", {
                                    errors: logs.errors,
                                    warnings: logs.warnings,
                                    report: ""
                                });
                            } else {
                                return environment.write(
                                    data.pcfFileName,
                                    data.pcfContent,
                                    true,
                                    function(err, stdout, stderr) {
                                        if (err) {
                                            environment.checkAndDestroy();
                                            return cb(err);
                                        }
                                        return environment.write(
                                            data.bitstreamMakefileName,
                                            data.bitstreamMakefile,
                                            true,
                                            function(err, stdout, stderr) {
                                                if (err) {
                                                    environment.checkAndDestroy();
                                                    return cb(err);
                                                }
                                                return environment.run(
                                                    data.bitstreamMakefileCommand,
                                                    true,
                                                    function(
                                                        err,
                                                        stdout,
                                                        stderr
                                                    ) {
                                                        if (err) {
                                                            environment.checkAndDestroy();
                                                            return cb(err);
                                                        } else {
                                                            let report = "";
                                                            const errorLines = (
                                                                stderr || ""
                                                            )
                                                                .trim()
                                                                .split("\n");
                                                            if (stderr) {
                                                                if (
                                                                    /make[\s\S]+Error/gim.test(
                                                                        errorLines[
                                                                            errorLines.length -
                                                                                1
                                                                        ]
                                                                    )
                                                                ) {
                                                                    console.error(
                                                                        stderr
                                                                    );
                                                                    environment.checkAndDestroy();
                                                                    return cb(
                                                                        null,
                                                                        null,
                                                                        {
                                                                            errors: [
                                                                                "Failed to generate the bitsream."
                                                                            ]
                                                                                .concat(
                                                                                    errorLines
                                                                                )
                                                                                .concat(
                                                                                    logs.errors ||
                                                                                        []
                                                                                ),
                                                                            warnings:
                                                                                logs.warnings ||
                                                                                [],
                                                                            report
                                                                        }
                                                                    );
                                                                } else {
                                                                    report = stderr;
                                                                }
                                                            }
                                                            return environment.readBinary(
                                                                data.bitstreamOutputPath,
                                                                function(
                                                                    err,
                                                                    bitstreamContent,
                                                                    stderr
                                                                ) {
                                                                    if (err) {
                                                                        environment.checkAndDestroy();
                                                                        return cb(
                                                                            err
                                                                        );
                                                                    } else {
                                                                        cb(
                                                                            null,
                                                                            bitstreamContent,
                                                                            {
                                                                                errors:
                                                                                    logs.errors ||
                                                                                    [],
                                                                                warnings:
                                                                                    logs.warnings ||
                                                                                    [],
                                                                                report
                                                                            }
                                                                        );
                                                                        return environment.checkAndDestroy();
                                                                    }
                                                                }
                                                            );
                                                        }
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        }
                    }
                );
            }
        });
    });
};

const compileSW = function(repo, objName, cb) {
    if (objName == null) {
        objName = "sw.obj";
    }
    return prepareSWCompilation(repo, objName, function(
        err,
        environment,
        data
    ) {
        if (err) {
            return cb(err);
        }
        return environment.write(
            data.compilationMakefileName,
            data.compilationMakefile,
            true,
            function(err, stdout, stderr) {
                if (err) {
                    environment.checkAndDestroy();
                    return cb(err);
                }
                return environment.run(
                    data.compilationMakefileCommand,
                    true,
                    function(err, stdout, stderr) {
                        if (err) {
                            environment.checkAndDestroy();
                            return cb(err);
                        } else {
                            let report = "";
                            const errorLines = (stderr || "")
                                .trim()
                                .split("\n");
                            if (stderr) {
                                if (
                                    /make[\s\S]+Error/gim.test(
                                        errorLines[errorLines.length - 1]
                                    )
                                ) {
                                    console.error(stderr);
                                    environment.checkAndDestroy();
                                    return cb(null, null, {
                                        errors: [
                                            "Failed to compile software files."
                                        ]
                                            .concat(errorLines)
                                            .concat(logs.errors || []),
                                        warnings: logs.warnings || [],
                                        report
                                    });
                                } else {
                                    report = stderr;
                                }
                            }
                            return environment.readBinary(
                                data.compilationOutputPath,
                                function(err, compilationContent, stderr) {
                                    if (err) {
                                        environment.checkAndDestroy();
                                        return cb(err);
                                    } else {
                                        cb(null, compilationContent, {
                                            errors: logs.errors || [],
                                            warnings: logs.warnings || [],
                                            report
                                        });
                                        return environment.checkAndDestroy();
                                    }
                                }
                            );
                        }
                    }
                );
            }
        );
    });
};

const processSimulation = (err, environment, data, cb) =>
    environment.run(data.simulationCommand, function(err, stdout, stderr) {
        let errorLines,
            errorMatches,
            extractionRegEx,
            file,
            line,
            lineErr,
            logEntry,
            type,
            typeMatches;
        if (err) {
            environment.checkAndDestroy();
            return cb(err);
        }
        const synthErrors = [];
        const synthWarnings = [];

        const errorParsingRegEx = () =>
            new RegExp("(.+)\\s*\\:\\s*(\\d+)\\s*\\:\\s*(.+)", "gm");
        const innerErrorRegEx = () =>
            new RegExp("\\s*(\\w+)\\s*\\:\\s*(.+)", "igm");

        if (stderr) {
            errorLines = stderr.trim().split("\n");
            for (line of Array.from(errorLines)) {
                if (line.trim() === "" || /^i give up\.$/i.test(line.trim())) {
                    continue;
                }
                if (/\.lib\.v/gm.test(line) && /warning/gm.test(line)) {
                    continue;
                }
                logEntry = {
                    message: line.trim()
                };
                extractionRegEx = errorParsingRegEx();
                errorMatches = extractionRegEx.exec(line);
                logEntry.file = null;
                logEntry.line = 0;
                if (errorMatches !== null) {
                    file = errorMatches[1];
                    line = errorMatches[2];
                    lineErr = errorMatches[3];
                    if (innerErrorRegEx().test(lineErr)) {
                        typeMatches = innerErrorRegEx().exec(lineErr);
                        type = typeMatches[1].toLowerCase();
                        lineErr = innerErrorRegEx().exec(lineErr)[2];
                    }
                    lineErr =
                        lineErr.charAt(0).toUpperCase() + lineErr.slice(1);

                    if (data.namesMap.files[file] != null) {
                        logEntry.file = data.namesMap.files[file];
                        logEntry.line = Number.parseInt(line);
                        if (
                            !/error/i.test(type) &&
                            !/[\s\S]+\s*\:\s*syntax error/i.test(
                                logEntry.message
                            )
                        ) {
                            synthWarnings.push(logEntry);
                        } else {
                            synthErrors.push(logEntry);
                        }
                    } else {
                        synthErrors.push(logEntry);
                    }
                } else {
                    synthErrors.push(logEntry);
                }
            }
            if (err && !synthErrors.length) {
                synthErrors.push("Fatal error has occurred during simulation.");
            }
            if (synthErrors.length > 0) {
                environment.checkAndDestroy();
                return cb(null, synthErrors, synthWarnings, []);
            }
        }
        return environment.run(data.vvpCommand, function(err, stdout, stderr) {
            if (err) {
                environment.checkAndDestroy();
                return cb(err);
            } else {
                const simErrors = [];
                const simWarnings = [];

                if (stderr) {
                    errorLines = stderr.trim().split("\n");
                    for (line of Array.from(errorLines)) {
                        if (
                            line.trim() === "" ||
                            /^i give up\.$/i.test(line.trim())
                        ) {
                            continue;
                        }
                        logEntry = {
                            message: line.trim()
                        };
                        extractionRegEx = errorParsingRegEx();
                        errorMatches = extractionRegEx.exec(line);
                        logEntry.file = null;
                        logEntry.line = 0;
                        if (errorMatches !== null) {
                            file = errorMatches[1];
                            line = errorMatches[2];
                            lineErr = errorMatches[3];
                            if (innerErrorRegEx().test(lineErr)) {
                                typeMatches = innerErrorRegEx().exec(lineErr);
                                type = typeMatches[1].toLowerCase();
                                lineErr = innerErrorRegEx().exec(lineErr)[2];
                            }
                            lineErr =
                                lineErr.charAt(0).toUpperCase() +
                                lineErr.slice(1);
                            if (data.namesMap.files[file] != null) {
                                logEntry.file = data.namesMap.files[file];
                            }
                            logEntry.line = Number.parseInt(line);
                            if (
                                !/error/i.test(type) &&
                                !/[\s\S]+\s*\:\s*syntax error/i.test(
                                    logEntry.message
                                )
                            ) {
                                simWarnings.push(logEntry);
                            } else {
                                simErrors.push(logEntry);
                            }
                        } else {
                            simErrors.push(logEntry);
                        }
                    }
                    if (simErrors.length > 0) {
                        environment.checkAndDestroy();
                        return cb(
                            null,
                            synthErrors.concat(simErrors),
                            synthWarnings.concat(simWarnings),
                            []
                        );
                    }
                }
                return environment.read(data.vcdPath, function(
                    err,
                    vcdContent,
                    stderr
                ) {
                    environment.checkAndDestroy();
                    if (err) {
                        return cb(err);
                    } else if (stderr) {
                        return cb({
                            error: "Failed to read simulated file."
                        });
                    } else {
                        return cb(
                            null,
                            synthErrors.concat(simErrors),
                            synthWarnings.concat(simWarnings),
                            stdout
                                .split("\n")
                                .filter(line => line.trim() !== ""),
                            vcdContent
                        );
                    }
                });
            }
        });
    });

const simulateTestbench = (repo, item, simulationTime, cb) =>
    prepareTestbenchSimulation(repo, item, simulationTime, function(
        err,
        environment,
        data
    ) {
        if (err) {
            return cb(err);
        }
        return processSimulation(err, environment, data, cb);
    });

const simulateNetlist = (repo, item, netlist, stdcell, simulationTime, cb) =>
    prepareNetlistSimulation(
        repo,
        item,
        netlist,
        stdcell,
        simulationTime,
        function(err, environment, data) {
            if (err) {
                return cb(err);
            }
            return processSimulation(err, environment, data, cb);
        }
    );
module.exports = {
    createSimulationWorkspace,
    createTestbenchSimulationWorkspace,
    createNetlistSimulationWorkspace,
    createSynthesisWorkspace,
    prepareSynthesis,
    prepareSimulation,
    prepareNetlistSimulation,
    prepareTestbenchSimulation,
    prepareSWCompilation,
    validateTopModule,
    validate,
    synthesize,
    generateBitstream,
    compileSW,
    processSimulation,
    simulateTestbench,
    simulateNetlist
};
