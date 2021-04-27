const gccParser = require("./modules/gcc-output-parser");

const wrapResolveCallback = (cb) => {
	if (typeof cb !== "function") {
		return null;
	}
	return function() {
		return cb(null, ...arguments);
	};
};

const errorParsingRegEx = () => new RegExp("(.+)\\s*\\:\\s*(\\d+)\\s*\\:\\s*(.+)", "gm");
const innerErrorRegEx = () => new RegExp("\\s*(\\w+)\\s*\\:\\s*(.+)", "igm");

const iverilogErrorsDefs = [
	"error",
	"Invalid timeunit",
	"Invalid timeprecision",
	"was already declared here",
	"UDP primitive already exists",
	"definition conflicts with",
	"Only real \\(not shortreal\\) supported here",
	"not supported here",
	"Unable to match name for setting attribute",
	"type name is not \\(yet\\) defined",
	"parameter declarations are not permitted in generate blocks",
	"Compound type is not PACKED in this context"
];
const _ = require("underscore");

const processCompilerOutput = (module.exports.processCompilerOutput = function(
	stdout,
	stderr,
	data,
	cb
) {
	return new Promise(async (resolve, reject) => {
		const errorLines = (stderr || "").trim().split("\n");
		const errors = [];
		const warnings = [];
		if (stderr) {
			let logEntry;
			const reverseMap = data.namesMap.files;
			const gccOutput =
				(/={16}src={16}([\s\S]+)={16}endsrc={16}/gm.exec(stderr) ||
					[])[1] || null;
			const asOutput =
				(/={16}as={16}([\s\S]+)={16}endas={16}/gm.exec(stderr) ||
					[])[1] || null;
			const linkerOutput =
				(/={16}linker={16}([\s\S]+)={16}endlinker={16}/gm.exec(
					stderr
				) || [])[1] || null;
			const parsedError = gccParser
				.parseString(gccOutput)
				.concat(gccParser.parseLinker(linkerOutput));
			for (let entry of Array.from(parsedError)) {
				logEntry = {
					line: entry.line,
					col: entry.column
				};
				if (reverseMap[entry.filename]) {
					logEntry.file = reverseMap[entry.filename];
				}
				if (entry.type === "error") {
					logEntry.message = `${entry.filename}${
						entry.line ? `:${entry.line}` : ""
					}${entry.column ? `:${entry.column}` : ""}: error: ${
						entry.text
					}`;
					errors.push(logEntry);
				} else if (entry.type === "note") {
					logEntry.message = `${entry.filename}:${entry.line}:${
						entry.column
					}: note: ${entry.text}`;
					warnings.push(logEntry);
				} else if (entry.type === "warning") {
					logEntry.message = `${entry.filename}:${entry.line}:${
						entry.column
					}: warning: ${entry.text}`;
					warnings.push(logEntry);
				} else {
					return reject({
						error: "Failed to parse compilation output."
					});
				}
			}
			if (asOutput && asOutput.length) {
				const asLines = asOutput
					.split(/[\r\n]/)
					.filter(line => line.trim() !== "");
				if (asLines.length) {
					asLines.forEach(function(line) {
						logEntry = {};
						let type = "e";
						logEntry.file = null;
						logEntry.message = line;
						logEntry.line = 0;
						logEntry.col = 0;
						const matches = /([\s\S]+\.s)(\:(\d+)(\:(\d+))?)?\:\s*(([\s\S]+)?\:)([\s\S]+)/gim.exec(
							line
						);
						if (matches) {
							const fileName = matches[1];
							const lineNo = matches[3];
							const colNo = matches[5];
							const errorText = matches[7] || "";
							let errorContent = matches[8];
							if (
								errorText.toLowerCase() === "warning" ||
								errorText.toLowerCase() === "warn"
							) {
								type = "w";
							} else {
								errorContent = errorText + errorContent;
							}

							if (lineNo) {
								logEntry.line = parseInt(lineNo);
							}

							if (colNo) {
								logEntry.col = parseInt(colNo);
							}

							if (fileName) {
								if (reverseMap[fileName]) {
									logEntry.file = reverseMap[fileName];
								}
							}
						}

						if (type === "w") {
							return warnings.push(logEntry);
						} else {
							return errors.push(logEntry);
						}
					});
				}
			}
		}
		return resolve({
			errors,
			warnings
		});
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
});
const processVerilatorValidation = (module.exports.processVerilatorValidation = function(
	stdout,
	stderr,
	data,
	cb
) {
	return new Promise(async (resolve, reject) => {
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
					if (
						warningDescribionRegexGenerator().test(logEntry.message)
					) {
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

		return resolve({
			errors: synthErrors,
			warnings: synthWarnings
		});
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
});
const processIVerilogValidation = (module.exports.processIVerilogValidation = function(
	stdout,
	stderr,
	data,
	cb
) {
	return new Promise(async (resolve, reject) => {
		let errorLines, file, line, logEntry, message, type;

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
				let originalLine = line;
				if (errorMatches !== null) {
					file = errorMatches[1];
					line = errorMatches[2];
					let lineErr = errorMatches[3];
					if (innerErrorRegEx().test(lineErr)) {
						const typeMatches = innerErrorRegEx().exec(lineErr);
						type = typeMatches[1].toLowerCase();
						lineErr = innerErrorRegEx().exec(lineErr)[2];
					}
					lineErr =
						lineErr.charAt(0).toUpperCase() + lineErr.slice(1);
					logEntry.file = data.namesMap.files[file];
					logEntry.fileName = file;
					logEntry.line = Number.parseInt(line);
					if (
						!_.any(iverilogErrorsDefs, def =>
							new RegExp(def, "i").test(originalLine)
						) &&
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

		resolve({
			errors: synthErrors,
			warnings: synthWarnings
		});
		return;
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
});

module.exports.processSimulation = async function processSimulation(
	stdout,
	stderr,
	data
) {
	return new Promise(async (resolve, reject) => {
		const synthErrors = [];
		const synthWarnings = [];
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
				let originalLine = line;
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
							!_.any(iverilogErrorsDefs, def =>
								new RegExp(def, "i").test(originalLine)
							) &&
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
			/*if (err && !synthErrors.length) {
				synthErrors.push('Fatal error has occurred during simulation.');
			}*/
		}
		return resolve({
			synthErrors,
			synthWarnings,
			synthLog: []
		});
	});
};
module.exports.processVVP = async function processVVP(stdout, stderr) {
	return new Promise(async (resolve, reject) => {
		const simErrors = [];
		const simWarnings = [];

		if (stderr) {
			errorLines = stderr.trim().split("\n");
			for (line of Array.from(errorLines)) {
				if (line.trim() === "" || /^i give up\.$/i.test(line.trim())) {
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
					logEntry.line = Number.parseInt(line);
					if (
						!/error/i.test(type) &&
						!/[\s\S]+\s*\:\s*syntax error/i.test(logEntry.message)
					) {
						simWarnings.push(logEntry);
					} else {
						simErrors.push(logEntry);
					}
				} else {
					simErrors.push(logEntry);
				}
			}
		}
		return resolve({
			simErrors,
			simWarnings,
			simLog: (stdout || "")
				.split(/[\r\n]+/)
				.filter(
					msg =>
						msg.trim().length &&
						!/^VCD info: dumpfile [\w+\.]+vcd opened for output\.$/.test(
							msg.trim()
						)
				)
				.map(message => ({ message: message.trim() }))
		});
	});
};

const processSynthesis = (module.exports.processSynthesis = function(
	stdout,
	stderr,
	cb
) {
	return new Promise(async (resolve, reject) => {
		const errors = [];
		const warnings = [];
		if (stderr.trim().length > 0) {
			const errorLines = stderr.split("\n");
			for (let line of Array.from(errorLines)) {
				if (line.trim() === "" || /^i give up\.$/i.test(line.trim())) {
					continue;
				}
				if (/warning *\: *([\s\S]*)/im.test(line)) {
					const warningEntry = {};
					warningEntry.file = null;
					warningEntry.message = line;
					warningEntry.line = 0;
					warnings.push(warningEntry);
				} else {
					const errorEntry = {};
					errorEntry.file = null;
					errorEntry.message = line;
					errorEntry.line = 0;
					errors.push(errorEntry);
				}
			}
		}
		return resolve({
			errors,
			warnings
		});
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
});
