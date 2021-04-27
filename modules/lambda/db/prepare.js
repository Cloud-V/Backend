const Parser = require("./modules/parser");
const Board = require("./modules/boards");
const FileManager = require("./controllers/file_manager");
const config = require("./config");

const shortid = require("shortid");
const fs = require("fs-extra");

const path = require("path");

const defaultBinDir = path.join(__dirname, '..', 'bin');

// Verilator
const verilatorPath = config.appPaths.verilator ||  path.join(defaultBinDir, 'verilator', 'bin', 'verilator');

// Icarus Verilog
const iverilogPath = config.appPaths.iverilog ||  path.join(defaultBinDir, 'iverilog', 'bin', 'iverilog');
const iverilogVVPPath = config.appPaths.iverilogVVP ||  path.join(defaultBinDir, 'iverilog', 'bin', 'vvp');
const ivlPath = config.appPaths.ivl ||  path.join(defaultBinDir, 'iverilog', 'lib', 'ivl');

// Yosys
const yosysPath = config.appPaths.yosys ||  path.join(defaultBinDir, 'yosys', 'bin', 'yosys');

// Qflow
const vestaPath = config.appPaths.vesta ||  path.join(defaultBinDir, 'qflow', 'bin', 'vesta');

// Icestorm
const iceStormDefaultPath = path.join(defaultBinDir, 'icestorm', 'bin');

const iceYosysPath = config.appPaths.yosys || path.join(iceStormDefaultPath, 'yosys');

const icepackPath = config.appPaths.icepack ||  path.join(iceStormDefaultPath, 'icepack');
const nextpnrICE40Path = config.appPaths.nextpnr_ice40 || "nextpnr-ice40";

// Deprecated
const iceboxPath = config.appPaths.icebox ||  path.join(iceStormDefaultPath, 'icebox');
const icetimePath = config.appPaths.icetime ||  path.join(iceStormDefaultPath, 'icetime');
const arachnePath = config.appPaths.arachne ||  path.join(iceStormDefaultPath, 'arachne-pnr');
const iceboxSharePath = config.appPaths.icebox ?
	path.dirname(iceboxPath) :
	path.join(defaultBinDir, 'icestorm', 'share', 'icebox')
	;
	
// GNU Utils
const makePath = config.appPaths.make || 'make';
const armGnuPath = config.appPaths.armGnu ||  path.join(defaultBinDir, 'arm', 'bin', 'arm-none-eabi')
const riscGnuPath = config.appPaths.riscGnu ||  path.join(defaultBinDir, 'riscv64', 'bin', 'riscv64-unknown-elf')

module.exports.sw = async (repository, opts) => {
	const {
		startupFile,
		linkerFile,
		target,
		hexName
	} = opts || {};
	const tempId = shortid.generate()
	const wsPath = `/tmp/ws/${tempId}`;
	const buildPath = `/tmp/build/${tempId}`;
	const {
		EntryType
	} = require("./models/repo_entry");

	return new Promise(async (resolve, reject) => {
		try {
			await fs.mkdirs(wsPath)
			await fs.mkdirs(buildPath)
		} catch (err) {
			console.error(err);
			return reject({
				error: 'Failed to package for synthesis.'
			})
		}
		FileManager.writeCompilationContainerFiles(repository, target, startupFile, linkerFile, wsPath, function (err, sourcePath, fullPath, filePaths, parentPaths, relativeParentPaths, namesMap) {
			if (err) {
				return reject(err);
			}
			if (!filePaths.linker.length && !filePaths.startup.length) {
				return reject({
					error: 'Missing startup or linker script'
				});
			}
			if (!['arm', 'riscv'].includes(target)) {
				return reject({
					error: 'Invalid target'
				});
			}
			const data = {
				wsPath,
				buildPath,
				repoPath: sourcePath,
				hexName
			};
			data.namesMap = namesMap;
			const args = [];
			const validationFileArgs = [];

			let sourceStr = '';
			let gccCmds = '';
			let outputStr = '';
			let gnuVar = '';
			if (target === 'arm') {
				gnuVar = 'ARMGNU';
			} else if (target === 'riscv') {
				gnuVar = 'RISCGNU';
			}

			filePaths.c.forEach(function (cFile) {
				const oFile = `${cFile.substr(0, cFile.length - 2)}.o`;
				if (!sourceStr.length) {
					sourceStr = cFile;
					gccCmds = `$(${gnuVar})-gcc $(GCCOPS) -O0 -c ${cFile} -o ${oFile}`;
					return outputStr = oFile;
				} else {
					sourceStr = sourceStr + ' ' + cFile;
					gccCmds = gccCmds + '\n' + `	$(${gnuVar})-gcc $(GCCOPS) -O0 -c ${cFile} -o ${oFile}`;
					return outputStr = outputStr + ' ' + oFile;
				}
			});

			const linkerPath = filePaths.linker[0];
			const startupPath = filePaths.startup[0];
			const outputFile = path.join(buildPath, hexName);
			const outputPath = outputFile;
			const listOutputPath = `${outputFile}.lst`;
			const cpuOpt = '-mcpu=cortex-m0';
			const makeScript = '';
			data.compilationOutputPath = outputPath;
			let makeFileContent = '';
			console.log(target)
			if (target === 'arm') {

				makeFileContent = `${gnuVar} ?= ${armGnuPath}

GCCOPS = -Wall  -nostdlib -nostartfiles -ffreestanding ${cpuOpt}
AOPS = --warn #--fatal-warnings

all : ${linkerPath} ${startupPath} ${sourceStr}
	echo ================src================ 1>&2;
	${gccCmds} \
|| (echo ================endsrc================ 1>&2 && exit 2);
	echo ================endsrc================ 1>&2;
	echo ================as================ 1>&2;
	$(${gnuVar})-as $(AOPS) ${cpuOpt} ${startupPath} -o start.o \
|| (echo ================endas================ 1>&2 && exit 2);
	echo ================endas================ 1>&2;
	echo ================linker================ 1>&2;
	$(${gnuVar})-ld $(LDOPS) -T ${linkerPath} start.o ${outputStr} -o main.elf \
|| (echo ================endlinker================ 1>&2 && exit 2);
	echo ================endlinker================ 1>&2;
	echo ================objdump================ 1>&2;
	$(${gnuVar})-objdump -D main.elf > ${listOutputPath} \
|| (echo ================endobjdump================ 1>&2 && exit 2);
	echo ================endobjdump================ 1>&2;
	echo ================objcopy================ 1>&2;
	$(${gnuVar})-objcopy main.elf -O verilog ${outputFile} \
|| (echo ================endobjcopy================ 1>&2 && exit 2);
	echo ================endobjcopy================ 1>&2;


clean :
	rm -f *.bin
	rm -f *.o
	rm -f *.elf
	rm -f *.list
	rm -f *.bc
	rm -f *.norm.s
	rm -f *.opt.s`;
			} else if (target === 'riscv') {
				makeFileContent = `${gnuVar} ?= ${riscGnuPath}

GCCOPS = -march=rv32i -mabi=ilp32 -Wall -Wextra  -ffreestanding -nostdlib
LDOPS = -march=rv32i -melf32lriscv -T${linkerPath} -nostartfile
AOPS = -march=rv32i -mabi=ilp32

all : ${linkerPath} ${startupPath} ${sourceStr}
	echo ================src================ 1>&2;
	${gccCmds} \
|| (echo ================endsrc================ 1>&2 && exit 2);
	echo ================endsrc================ 1>&2;
	echo ================as================ 1>&2;
	$(${gnuVar})-as $(AOPS) ${startupPath} -o start.o \
|| (echo ================endas================ 1>&2 && exit 2);
	echo ================endas================ 1>&2;
	echo ================linker================ 1>&2;
	$(${gnuVar})-ld $(LDOPS) start.o ${outputStr} -o main.elf \
|| (echo ================endlinker================ 1>&2 && exit 2);
	echo ================endlinker================ 1>&2;
	echo ================objdump================ 1>&2;
	$(${gnuVar})-objdump -D main.elf > ${listOutputPath} \
|| (echo ================endobjdump================ 1>&2 && exit 2);
	echo ================endobjdump================ 1>&2;
	echo ================objcopy================ 1>&2;
	$(${gnuVar})-objcopy main.elf -O verilog ${outputFile} \
|| (echo ================endobjcopy================ 1>&2 && exit 2);
	echo ================endobjcopy================ 1>&2;

clean :
	rm -f *.bin
	rm -f *.o
	rm -f *.elf
	rm -f *.list
	rm -f *.bc
	rm -f *.norm.s
	rm -f *.opt.s`;
			}
			data.compilationMakefile = makeFileContent;
			data.compilationMakefileName = `.${shortid.generate()}_${Date.now()}.mk`;
			data.compilationMakefileCommand = [makePath, "-f", data.compilationMakefileName];
			data.makefilePath = path.join(sourcePath, data.compilationMakefileName);
			data.listOutputPath = listOutputPath;
			return resolve(data)
		});
	});
}

module.exports.bitstream = async (repository, opts) => {
	const {
		pcfId,
		bitstreamName
	} = opts || {};
	const tempId = shortid.generate()
	const wsPath = `/tmp/ws/${tempId}`;
	const buildPath = `/tmp/build/${tempId}`;
	const {
		EntryType
	} = require("./models/repo_entry");

	return new Promise(async (resolve, reject) => {
		if (repository.topModule == null || repository.topModuleEntry == null || repository.topModule.trim() === '') {
			return reject({
				error: 'A top module is required for bitstream generation.'
			});
		}
		try {
			await fs.mkdirs(wsPath)
			await fs.mkdirs(buildPath)
		} catch (err) {
			console.error(err);
			return reject({
				error: 'Failed to package for bitstream generation.'
			})
		}
		const topModule = opts.topModule || repository.topModule;
		const topModuleEntryId = opts.topModuleEntryId || repository.topModuleEntry;
		try {
			const topModuleEntry = await repository.getEntry({
				_id: topModuleEntryId
			});
			if (!topModuleEntry) {
				return reject({
					error: 'Cannot find the source file containing the top module.'
				})
			}
			const exists = await Parser.moduleExistsInFile(topModuleEntry._id, topModule);
			if (!exists) {
				return reject({
					error: `Module '${topModule}' does not exist in '${topModuleEntry.title}'.`
				});
			}
			const pcfEntry = await repository.getEntry({
				_id: pcfId,
				handler: EntryType.PCFFile
			});
			if (!pcfEntry) {
				return reject({
					error: 'Cannot find the pin constraints file.'
				})
			}
			let pcfContent = await pcfEntry.getContent();
			let boardId = null;
			try {	
				boardId = JSON.parse(pcfEntry.attributes).board;
			} catch (err) {
				console.error(`PCF Entry ${pcfId} is out of date: No JSON attributes.`);
			}
			let board = Board[boardId];
			if (!board) {
				return reject({
					error: "The PCF file in use is out of date. Please recreate it."
				});
			}

			const makefilePath = path.join(buildPath, bitstreamName);
			const data = {
				wsPath,
				synthName: bitstreamName,
				makefilePath,
				buildPath,
				pcfContent
			};

			return FileManager.writeSynthesisContainerFiles(repository, false, false, wsPath, function (err, result) {
				if (err) {
					return reject(err);
				}
				const {
					sourcePath,
					fullPath,
					filePaths,
					parentPaths,
					relativeParentPaths,
					namesMap
				} = result;
				data.repoPath = sourcePath;
				data.namesMap = namesMap;
				const args = [];
				const validationFileArgs = [];
				let makefileVerilogPaths = "";
				for (let file of Array.from(filePaths.verilog)) {
					makefileVerilogPaths = `${makefileVerilogPaths} ${file.substr(file.indexOf('/') + 1)}`;
					args.push('-p');
					args.push("read_verilog");
					args.push(`\"${file.substr(file.indexOf('/') + 1)}\"`);
					validationFileArgs.push(`${file.substr(file.indexOf('/') + 1)}`);
					var synthScript = `read_verilog \"${file.substr(file.indexOf('/') + 1)}\"\n${synthScript}`;
				}

				let projectName = bitstreamName;
				if (projectName.indexOf('.bin', projectName.length - 4) !== -1) {
					projectName = projectName.substring(0, projectName.length - 4);
				}
				projectName = path.join(buildPath, projectName);
				data.bitstreamOutputPath = `${projectName}.bin`;
				const makeFileContent = `\
					PROJ = ${projectName}
					PIN_DEF = ${pcfEntry.title}

					all: $(PROJ).rpt $(PROJ).bin

					${projectName}.json:
						${iceYosysPath} -p 'synth_ice40 -top ${topModule} -json $@' ${makefileVerilogPaths}

					${projectName}.asc ${projectName}.rpt: $(PIN_DEF) ${projectName}.json	
						${nextpnrICE40Path} --${board.fpga} --package ${board.package} --pcf $\{PIN_DEF\} --json ${projectName}.json --asc ${projectName}.asc > ${projectName}.rpt

					${projectName}.bin: ${projectName}.asc
						${icepackPath} $< $@

					clean:
						rm -f $(PROJ).blif $(PROJ).asc $(PROJ).rpt $(PROJ).bin

					.PHONY: all prog clean\
				`.replace(/^\t{5}/gm, "");

				const hierarchyCommand = [
					'-p',
					`hierarchy -check -top ${repository.topModule}`
				];
				const techmapCommand = [
					'-p',
					'opt',
					'-p',
					'techmap',
					'-p',
					'opt'
				];
				const cleanCommand = [
					'-p',
					'clean'
				];
				const synthCommandArray = [
					iceYosysPath,
					'-q'
				].concat(args).concat(hierarchyCommand);
				const validationTopModule = [];
				data.pcfFileName = path.join(sourcePath, pcfEntry.title);
				data.synthCommandArray = synthCommandArray;
				data.bitstreamMakefile = makeFileContent;
				data.projectBin = projectName + '.bin';
				data.bitstreamMakefileName = path.join(sourcePath, `.${shortid.generate()}_${Date.now()}.mk`);
				data.bitstreamMakefileCommand = [makePath, "-f", data.bitstreamMakefileName];
				data.verilatorValidationCommand = [verilatorPath, "--bbox-unsup", "--top-module", filePaths.topModule, "--default-language", "1364-2005", "--error-limit", "100", "-Wno-STMTDLY", "--lint-only"].concat(validationFileArgs);

				return resolve(data);
			});
		} catch (err) {
			return reject(err);
		}
	});
}

module.exports.testbenchSimulation = async (repository, opts) => {
	const {
		item,
		simulationTime,
		level
	} = opts || {};

	const tempId = shortid.generate();
	const wsPath = `/tmp/ws/${tempId}`;
	const buildPath = `/tmp/build/${tempId}`;


	return new Promise(async (resolve, reject) => {
		try {
			await fs.mkdirs(wsPath)
			await fs.mkdirs(buildPath)
		} catch (err) {
			console.error(err);
			return reject({
				error: 'Failed to package for simulation.'
			})
		}
		FileManager.writeTestbenchSimulationContainerFiles(repository, item, simulationTime, level, wsPath, async function (err, testbenchPath, testbenchRelativePath, dumpName, sourcePath, fullPath, filePaths, namesMap) {
			if (err) {
				return reject(err);
			}
			try {
				const content = await item.getContent();
				const tbModules = Parser.extractModules(content);
				if (tbModules.length === 0) {
					return reject({
						error: 'Cannot extract top module.'
					});
				}
				if (tbModules.length > 1) {
					return reject({
						error: 'Only one top module per testbench is supported.'
					});
				}
				const topModule = tbModules[0];

				const data = {
					vvpName: `${Date.now()}.vvp`,
					wsPath,
					buildPath,
					repoPath: sourcePath
				};

				let fileArgs = `${testbenchRelativePath.substr(testbenchRelativePath.indexOf('/') + 1)}`;
				const fileArgsArray = [fileArgs];
				for (let file of Array.from(filePaths.verilog)) {
					file = file.substr(file.indexOf('/') + 1);
					fileArgs = `${fileArgs} ${file}`;
					fileArgsArray.push(`${file}`);
				}
				data.vvpPath = path.join(buildPath, data.vvpName);

				data.vvpCommand = [iverilogVVPPath, "-M", ivlPath, data.vvpPath];
				data.simulationCommand = [iverilogPath, '-B', ivlPath].concat(["-s", topModule, "-Wall", "-Wno-timescale", "-o", data.vvpPath]).concat(fileArgsArray);
				data.vcdPath = path.join(wsPath, dumpName);
				data.namesMap = namesMap;

				return resolve(data);
			} catch (err) {
				return reject(err);
			}
		});
	});
}

module.exports.netlistSimulation = async (repository, opts) => {
	const {
		item,
		simulationTime,
		level,
		netlist,
		stdcell
	} = opts || {};

	const tempId = shortid.generate();
	const wsPath = `/tmp/ws/${tempId}`;
	const buildPath = `/tmp/build/${tempId}`;


	return new Promise(async (resolve, reject) => {
		try {
			await fs.mkdirs(wsPath)
			await fs.mkdirs(buildPath)
		} catch (err) {
			console.error(err);
			return reject({
				error: 'Failed to package for simulation.'
			})
		}
		FileManager.writeNetlistSimulationContainerFiles(repository, item, netlist, stdcell, simulationTime, level, wsPath, async function (err, testbenchPath, testbenchRelativePath, dumpName, sourcePath, fullPath, filePaths, namesMap) {
			if (err) {
				return reject(err);
			}
			try {
				const content = await item.getContent();
				const tbModules = Parser.extractModules(content);
				if (tbModules.length === 0) {
					return reject({
						error: 'Cannot extract top module.'
					});
				}
				if (tbModules.length > 1) {
					return reject({
						error: 'Only one top module per testbench is supported.'
					});
				}
				const topModule = tbModules[0];

				const data = {
					vvpName: `${Date.now()}.vvp`,
					wsPath,
					buildPath,
					repoPath: sourcePath
				};

				let fileArgs = `${testbenchRelativePath.substr(testbenchRelativePath.indexOf('/') + 1)}`;
				const fileArgsArray = [fileArgs];
				for (let file of Array.from(filePaths.verilog)) {
					file = file.substr(file.indexOf('/') + 1);
					fileArgs = `${fileArgs} ${file}`;
					fileArgsArray.push(`${file}`);
				}
				data.vvpPath = path.join(buildPath, data.vvpName);

				data.vvpCommand = [iverilogVVPPath, "-M", ivlPath, data.vvpPath];
				data.simulationCommand = [iverilogPath, '-B', ivlPath].concat(["-s", topModule, "-Wall", "-Wno-timescale", "-o", data.vvpPath]).concat(fileArgsArray);
				data.vcdPath = path.join(wsPath, dumpName);
				data.namesMap = namesMap;

				return resolve(data);
			} catch (err) {
				return reject(err);
			}
		});
	});
}

module.exports.synthesis = async (repository, opts) => {
	const {
		stdcell,
		synthOptions,
		synthName,
		includeTestbenches
	} = opts || {};
	const tempId = shortid.generate()
	const wsPath = `/tmp/ws/${tempId}`;
	const buildPath = `/tmp/build/${tempId}`

	return new Promise(async (resolve, reject) => {
		if (repository.topModule == null || repository.topModuleEntry == null || repository.topModule.trim() === '') {
			return reject({
				error: 'A top module is required for synthesis.'
			});
		}
		try {
			await fs.mkdirs(wsPath)
			await fs.mkdirs(buildPath)
		} catch (err) {
			console.error(err);
			return reject({
				error: 'Failed to package for synthesis.'
			})
		}
		const topModule = opts.topModule || repository.topModule;
		const topModuleEntryId = opts.topModuleEntryId || repository.topModuleEntry;
		try {
			const topModuleEntry = await repository.getEntry({
				_id: topModuleEntryId
			});
			if (!topModuleEntry) {
				return reject({
					error: 'Cannot find the source file containing the top module.'
				})
			}
			const exists = await Parser.moduleExistsInFile(topModuleEntry._id, topModule);
			if (!exists) {
				return reject({
					error: `Module '${topModule}' does not exist in '${topModuleEntry.title}'.`
				});
			}
			let stdcellOpt = [];
			let flattenOpt = [];
			let purgeOpt = [];
			let procOpt = [];
			let memorymapOpt = [];
			const stdcellPath = path.join(__dirname, 'modules/stdcells', `${stdcell}`);
			const abcPath = stdcellPath;

			let synthScript = "";
			synthScript = "write_file constraints_file.constr <<EOF";
			if (synthOptions.drivingCell != null && synthOptions.load != null) {
				synthScript = `${synthScript}\nset_driving_cell ${synthOptions.drivingCell}`;
				synthScript = `${synthScript}\nset_load ${synthOptions.load}`;
			}
			synthScript = `${synthScript}\nEOF`;
			if (synthOptions.flatten) {
				flattenOpt = ['-p', 'flatten'];
				synthScript = `${synthScript}\nsynth -flatten -top ${repository.topModule}`;
				synthScript = `${synthScript}\nflatten`;
			} else {
				synthScript = `${synthScript}\nsynth -top ${repository.topModule}`;
			}

			synthScript = `${synthScript}\ndfflibmap -liberty ${stdcellPath}`;
			synthScript = `${synthScript}\nabc -D ${synthOptions.clockPeriod != null ? synthOptions.clockPeriod : 1} -constr constraints_file.constr -liberty ${abcPath}`;

			if (synthOptions.purge) {
				purgeOpt = ["-p", "opt_clean -purge"];
				synthScript = `${synthScript}\nopt_clean -purge`;
			}

			synthScript = `${synthScript}\nclean`;



			if (synthOptions.proc) {
				procOpt = ["-p", "proc"];
			}

			memorymapOpt = ["-p", "memory_collect", "-p", "memory_map"];
			synthScript = `${synthScript}\nmemory_collect\nmemory_map`;

			const reportName = `${synthName}_rpt.txt`;
			const reportPath = path.join(buildPath, reportName);
			const synthPath = path.join(buildPath, synthName);

			synthScript = `${synthScript}\ntee -o ${reportPath} stat -top ${repository.topModule} -liberty ${stdcellPath}`;
			synthScript = `${synthScript}\nwrite_verilog -noattr -noexpr ${synthPath}`;

			if (stdcell != null && stdcell.trim() !== '') {
				try {
					const stat = fs.lstatSync(path.join(__dirname, `modules/stdcells/${stdcell}`));
					stdcellOpt = ["-p", `dfflibmap -liberty ${stdcellPath}`, "-p", `abc -liberty ${abcPath}`];
				} catch (e) {
					console.error(e);
					return reject({
						error: `Cannot find the standard cell library ${stdcell}`
					});
				}
			} else {
				return reject({
					error: 'Missing standard cell library file.'
				});
			}


			const vestaCommand = [vestaPath, `${synthPath}`, `${stdcellPath}`];
			const data = {
				buildPath,
				reportName,
				reportPath,
				wsPath,
				synthName,
				synthPath,
				vestaCommand
			};
			FileManager.writeSynthesisContainerFiles(repository, includeTestbenches, false, wsPath, function (err, result) {
				if (err) {
					return reject(err);
				}
				const {
					sourcePath,
					fullPath,
					filePaths,
					parentPaths,
					relativeParentPaths,
					namesMap
				} = result;
				data.namesMap = namesMap;
				const args = [];
				const validationFileArgs = [];
				for (let file of Array.from(filePaths.verilog)) {
					args.push('-p');
					args.push("read_verilog");
					args.push(`\"${file.substr(file.indexOf('/') + 1)}\"`);
					validationFileArgs.push(`${file.substr(file.indexOf('/') + 1)}`);
					synthScript = `read_verilog \"${file.substr(file.indexOf('/') + 1)}\"\n${synthScript}`;
				}

				const hierarchyCommand = [
					'-p',
					`hierarchy -check -top ${repository.topModule}`
				];
				const techmapCommand = [
					'-p',
					'opt',
					'-p',
					'techmap',
					'-p',
					'opt'
				];
				const cleanCommand = [
					'-p',
					'clean'
				];
				const teeCommand = [
					'-p',
					`tee -o \"${reportPath}\" stat -top ${repository.topModule} -liberty ${stdcellPath}`
				];
				const writeVerilogCommand = [
					'-p',
					`write_verilog -noattr -noexpr \"${synthPath}\"`
				];
				const synthCommandArray = [
						yosysPath,
						'-q'
					].concat(args).concat(hierarchyCommand)
					.concat(stdcellOpt)
					.concat(cleanCommand)
					.concat(memorymapOpt)
					.concat(flattenOpt)
					.concat(purgeOpt)
					.concat(teeCommand)
					.concat(writeVerilogCommand);
				const validationTopModule = [];
				data.repoPath = sourcePath;
				data.synthCommand = synthCommandArray;
				data.synthScript = synthScript;
				data.synthScriptFileName = path.join(sourcePath, `.${shortid.generate()}_${Date.now()}.synth`);
				data.synthScriptCommand = [yosysPath, "-s", data.synthScriptFileName];
				data.iverilogValidationCommand = [iverilogPath, '-B', ivlPath, "-g2005", "-t", "null", "-Wall", "-Wno-timescale"].concat(validationFileArgs);
				data.verilatorValidationCommand = [verilatorPath, "--bbox-unsup", "--top-module", filePaths.topModule, "--default-language", "1364-2005", "--error-limit", "100", "-Wno-STMTDLY", "--lint-only"].concat(validationFileArgs);
				return resolve(data);
			});
		} catch (err) {
			return reject(err);
		}
	});
}