/*
	Utilities based on parsing verilog

	I know this file looks bad. In my defense, it was even worse before I got this codebase.
*/
const {	wrapResolveCallback } = require("./utils");

const mathjs = require("mathjs");
const stripComments = require("strip-comments");

// 1: Module Name, 2: Module Header Parameters (Optional), 3: Ports
const ModuleHeaderRegex = /^\s*module\s+(.+?)\s*(#\s*\(([\s\S]+?)\)\s*)??\s*((\([\s\S]*?\))?\s*;)\s*$/gm;

// 0: Entire Module, 1: Module Name, 2: Module Header Parameters (Optional), 3: Ports, 4: Module Body
const FullModuleRegex = new RegExp(`
		module
	\\s+
		(\\w+)
	\\s*
		(?:
			#
			\\s*
				\\(
					(
						[\\s\\S]+?
					)
				\\)
			\\s*
		)??
	\\s*
		(?:
			\\(
				(
					[\\s\\S]*?
				)
			\\)?
		)
	\\s*
		;
	\\s*
		(
			[\\s\\S]*?
		)
	\\s*
		\\bendmodule\\b
`.split(/[\s\n]/).join(""), "gm");


// 1: Bit Width, 2: b|o|d|h, 3: bin/oct/dec/hex number
const Literal = /\s*(\d+)\s*\'([bodh])\s*([0-9A-Fa-f_]+)\s*/gm;

// 1: input|output|inout, 2: wire|reg (optional), 3: lhs (optional), 4: rhs (optional), 5: declaration list excluding last element (optional), 6: last element
const IORegex = new RegExp(`
		(input|output|inout)
	\\b 
	\\s*
		(?:
			(wire|reg)
			\\s+
		)?
		(?:
			\\[
				\\s*([^\\]\\:]+?)\\s*
				\\:
				\\s*([^\\]\\:]+?)\\s*
			\\]\\s*
		)?
	(
		(?!input|output|inout)
		(?:[_A-Za-z][_A-Za-z0-9]*\\s*,\\s*)+
	)?
	(
		(?!input|output|inout)
		(?:[_A-Za-z][_A-Za-z0-9]*)+
	)
`.split(/[\s\n]/).join(""), "gm");

// 1: localparam|parameter, 2: lhs (optional), 3: rhs (optional), 4: declaration list excluding last element (optional), 5: last element
// This is the only major Regex without a g because it's not used with findall/matchall/whatever javascript calls it, rather, it's called iteratively so parameters are continuously replaced.
const ParameterRegex = new RegExp(`
		(localparam|parameter)
	\\s+
		(?:
			\\[
				\\s*([^\\]\\:]+?)\\s*
				\\:
				\\s*([^\\]\\:]+?)\\s*
			\\]\\s*
		)?
	\\s+
		(
			(?!localparam|parameter)
			(?:[_A-Za-z][_A-Za-z0-9]*\\s*=\\s*[\\s\\S]+?,\\s*)+
		)?
		(
			(?!localparam|parameter)
			(?:[_A-Za-z][_A-Za-z0-9]*\\s*=\\s*[\\s\\S]+?)+
		)
		[\)\;]

`.split(/[\s\n]/).join(""), "m");

// 1: LHS, 2: RHS
const ParameterContentRegex = /([\s\S]*?)\s*=\s*([\s\S]+)/m;

const extractModules = function (content) {
	content = stripComments(content);

	let matches = [...content.matchAll(ModuleHeaderRegex)];

	let moduleNames = matches.map(match=> match[1]);

	return moduleNames;
};

const moduleExists = function (content, _module) { // I hate calling the second parameter _module, but module is kind of a special variable
	let moduleNames = extractModules(content);
	for (let moduleName of moduleNames) {
		if (moduleName === _module) {
			return true;
		}
	}
	return false;
};

const moduleExistsInFile = function (entryId, module, cb) {
	return new Promise(async (resolve, reject) => {
		const FileManager = require("../controllers/file_manager");
		const Repo = require("../controllers/repo");
		return Repo.getRepoEntry({
			_id: entryId
		}, function (err, entry) {
			if (err) {
				return reject(err);
			} else if (!entry) {
				return reject({
					error: 'Source file does not exist.'
				});
			} else {
				return FileManager.getFileContent(entry, function (err, content) {
					if (err) {
						return reject(err);
					} else {
						return resolve(moduleExists(content, module));
					}
				});
			}
		});
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const extractMetadata = function (source, enumerateBuses = false) {
	source = stripComments(source);

	const modules = {};

	const resolveParameters = function (body) {
		let match = ParameterRegex.exec(body);
		while (match) {
			body = body.replace(match[0], '');
			let parameterAssignments = [match[5]].concat((match[4] ?? "").split(/\s*,\s*/gm)).filter(a=> a.trim() !== "");
			for (let assignment of parameterAssignments) {
				let handSides = ParameterContentRegex.exec(assignment);
				if (!handSides) {
					throw new Error(`Invalid parameter ${match[0]}.`);
				}
				let lhs = handSides[1];
				let rhs = handSides[2];
				
				let literalMatches = rhs.matchAll(Literal);
				for (let literalMatch of literalMatches) {
					const numberOfBits = parseInt(literalMatch[1]);
					const base = literalMatch[2].toLowerCase();
					let value = literalMatch[3].toLowerCase();
					value = value.replace(/_/gm, '');
					const maxValue = Math.pow(2, numberOfBits + 1) - 1;
					let decimalValue = undefined;
					switch (base) {
						case 'b':
							decimalValue = parseInt(value, 2);
							break;
						case 'o':
							decimalValue = parseInt(value, 8);
							break;
						case 'd':
							decimalValue = parseInt(value, 10);
							break;
						case 'h':
							decimalValue = parseInt(value, 16);
							break;
					}
					if (decimalValue > maxValue) {
						throw new Error(`The value ${value} exceeds the available ${numberOfBits} bits (max: ${maxValue}).`);
					}
					rhs = rhs.replace(literalMatch[0], decimalValue);
				}

				const rhsEval = mathjs.eval(rhs);
				body = body.replace(new RegExp(`\\b${lhs}\\b`, 'gm'), rhsEval);
			}
			match = ParameterRegex.exec(body);
		}
		return body;
	};

	let matches = source.matchAll(FullModuleRegex);

	// Resolve all parameters
	for (let match of matches) {
		let moduleContent = match[0];
		let moduleName = match[1];
		let moduleHeaderParams = match[2];
		let modulePorts = match[3];
		let moduleBody = match[4];

		moduleBody = resolveParameters(`${modulePorts};${moduleHeaderParams ?? ""};\n${moduleBody}`);

		modules[moduleName] = {
			name: moduleName,
			content: moduleContent,
			body: moduleBody
		};
	}
	for (let moduleName in modules) {
		let targetModule = modules[moduleName];

		const body = targetModule.body;
	
		// Extracting inputs/outputs		
		let ports = [];
		let matches = body.matchAll(IORegex);
		for (let match of matches) {
			let prefix = '';
			let start = null, end = null;
			if ((match[3] != null) && (match[4] != null)) {
				try {
					start = mathjs.eval(match[3].trim());
					end = mathjs.eval(match[4].trim());
					prefix = `[${start}: ${end}] `;
				} catch (err) {
					console.error(err);
					throw new Error(`Evaluation failed for [${match[3].trim()}: ${match[4].trim()}]`);
				}
			}

			let declarationList = [match[6]].concat((match[5] ?? "").split(/\s*,\s*/m)).filter(d=> d.trim() !== "");

			for (let declaration of declarationList) {
				if (declaration.trim === '') {
					return;
				}
				if (enumerateBuses) {
					let pushPort = (index, instance) => {
						ports.push({
							name: declaration,
							type: match[1],
							index,
							instance
						})
					};
					if ((start != null) && (end != null)) {
						if (end < start) {
							const temp = start;
							start = end;
							end = temp;
						}
	
						for (let i = start; i <= end; i += 1) {
							pushPort(i, `${declaration}[${i}]`);
						}
					} else {
						pushPort(0, declaration);
					}
				} else {
					ports.push({
						name: declaration,
						type: match[1],
						start,
						end,
						instance: declaration
					});
				}

			};
		}

		targetModule.ports = ports;
	}

	let ports = {};
	for (let module in modules) {
		ports[module] = modules[module].ports;
	}


	return ports;

};

const generateTestbenchFromString = function (targetModule, content, testbenchName) {
	let modules = extractMetadata(content);
	
	let instance = "uut";
	let moduleCounter = 2;
	while (modules[instance] != null) {
		instance = `uut${moduleCounter}`;
		moduleCounter++;
	}

	let declaration = (port) => {
		let { name, type, start, end } = port;
		let bus = '';
		if ((start ?? "") !== "") {
			bus = `[${start}:${end}] `;
		}
		return `${type == 'output' ? 'wire' : 'reg'} ${bus} ${name};`;
	};
	
	let hook = (port) => {
		return `.${port.name}(${port.name})`;
	};

	let initializeInputs = (port) => {
		return ["input", "inout"].includes(port.type) ? `${port.name} = 0;` : ``;
	};
	let ports = modules[targetModule];
	moduleContent = `\
\`timescale 1ns/1ns

module ${testbenchName};
\t// Declarations
\t${ports.map(declaration).join("\n\t")}

\t// Instantiation of Unit Under Test
\t${targetModule} ${instance} (
\t\t${ports.map(hook).join(",\n\t\t")}
\t);

\tinitial begin
\t\t// Input Initialization
\t\t${ports.map(initializeInputs).filter(i=> i !== "").join("\n\t\t")}

\t\t// Reset
\t\t#100;
\tend

endmodule`;
	return moduleContent;
	
}

const generateTestbench = async function (targetModule, entry, testbenchName, cb) {
try {
	const FileManager = require('../controllers/file_manager');
	let content = await FileManager.getFileContent(entry).catch(err=> {
		throw err
	});
	return cb(null, generateTestbenchFromString(targetModule, content, testbenchName));
} catch (err) {
	return cb(err);
}
};



module.exports = {
	extractModules,
	moduleExists,
	moduleExistsInFile,
	extractMetadata,
	generateTestbenchFromString,
	generateTestbench
};