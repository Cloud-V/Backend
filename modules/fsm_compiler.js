const compile = function (content, moduleName, rawInports, outports, encoding, clk, clkEdge, rst, rstEdge, rstMode, rstLevel, cb) {
	let error;
	const getOutput = function (str) {
		if (str.indexOf('/') !== -1) {
			return str.substr(str.indexOf('/') + 1);
		} else {
			return '';
		}
	};
	const fixStateName = function (str) {
		if (str.indexOf('/') !== -1) {
			return str.substr(0, str.indexOf('/'));
		} else {
			return str;
		}
	};
	const transition = function (states, links, current) {
		let next = '';
		let result = '';
		let firstFlag = true;
		for (let link of Array.from(links)) {
			if (((link.type === 'SelfLink') && (link.node === current)) || ((link.type === 'Link') && (link.nodeA === current))) {
				const pieces = link.text.split('/');
				if (link.type === 'SelfLink') {
					next = link.node;
				} else {
					next = link.nodeB;
				}
				result = `${result}\n\t\t\t\t`;
				if (!firstFlag) {
					result = `${result}else `;
				} else {
					firstFlag = false;
				}
				result = `${result}if(${pieces[0]}) nextstate = \`${fixStateName(states[next])};`;
			}
		}
		result = `${result}\n`;
		return result;
	};
	const isValidVerilogExpression = str => true;
	const parseInports = function (inportsStr) {
		const inputsObj = {
			inputs: [{
				name: '',
				size: 0,
				from: 0,
				to: 0
			}]
		};

		const result = [];
		const flag = 0;

		const pieces = inportsStr.split(',');
		for (let inport of Array.from(pieces)) {
			var entry;
			inport = inport.trim();
			if (inport.indexOf('[' === -1)) {
				entry = {
					name: inport,
					size: 1,
					from: 0,
					to: 0
				};
				result.push(entry);
			} else {
				const ta0 = inport.split('[');
				const ta1 = ta0.substr(ta0.indexOf('[') + 1).split(':');
				const ta2 = ta0.substr(ta0.indexOf(':') + 1).split(']');
				entry = {
					name: ta0[0].trim(),
					size: (Math.ceil(ta1[0]) - ceil(ta2[0])) + 1,
					to: Math.ceil(ta1[0]),
					from: Math.ceil(ta2[0])
				};
				result.push(entry);
			}
		}
		return result;
	};

	const STR_PAD_LEFT = 1;
	const STR_PAD_RIGHT = 2;
	const STR_PAD_BOTH = 3;

	const pad = function (str, len, pad, dir) {
		if (len == null) {
			len = 0;
		}
		if (pad == null) {
			pad = ' ';
		}
		if (dir == null) {
			dir = STR_PAD_LEFT;
		}
		if ((len + 1) >= str.length) {
			let padlen;
			switch (dir) {
				case STR_PAD_LEFT:
					str = Array((len + 1) - (str.length)).join(pad) + str;
					break;
				case STR_PAD_BOTH:
					var right = Math.ceil((padlen = len - (str.length)) / 2);
					var left = padlen - right;
					str = Array(left + 1).join(pad) + str + Array(right + 1).join(pad);
					break;
				default:
					str = str + Array((len + 1) - (str.length)).join(pad);
					break;
			}
		}
		// switch
		return str;
	};

	try {

		let stateName;
		let compiled = '';


		const inports = parseInports(rawInports);

		let fsm = null;
		try {
			fsm = JSON.parse(content);
		} catch (error1) {
			error = error1;
			console.error(err);
			return cb({
				error: 'Invalid FSM file.'
			});
		}
		const {
			nodes
		} = fsm;
		const {
			links
		} = fsm;

		const states = [];
		let rstStateCount = 0;
		let rstState = '';

		for (let link of Array.from(links)) {
			if (link.text.indexOf('/') !== -1) {
				return cb({
					error: 'Only Moore Machine is currently supported, transitions should not have outputs.'
				});
			}
			if (!isValidVerilogExpression(link.text)) {
				return cb({
					error: 'Transition should be valid expressions.'
				});
			}
		}

		for (let node of Array.from(nodes)) {
			//node.text = node.text.replace /[^\w\$/=]/gm, '_'
			if (node.text.indexOf('/') === -1) {
				return cb({
					error: 'Only Moore Machine is currently supported, states should have output.'
				});
			}
			if (!/(.+)=(.+)/img.test(getOutput(node.text))) {
				return cb({
					error: 'Output variable should be specified per state.'
				});
			}
			if (node.isAcceptState) {
				rstStateCount++;
				rstState = node.text;
			}
			states.push(node.text);
		}

		if (rstStateCount === 0) {
			return cb({
				error: 'Reset state is undefined.'
			});
		}

		if (rstStateCount > 1) {
			return cb({
				error: 'More than one Reset state.'
			});
		}

		const stateCount = {};
		for (var state of Array.from(states)) {
			if ((stateCount[state] == null)) {
				stateCount[state] = 1;
			} else {
				return cb({
					error: `State ${state} is not unique.`
				});
			}
		}

		compiled = `\
/*
* CloudV FSM Generator
* Generated on ${new Date().toString()}.
*/\n\n\
`;

		let count = 0;

		const widthBinary = Math.ceil(Math.log2(states.length));
		const widthOne = states.length;

		let width = '';

		if (encoding === 'binary') {
			width = widthBinary;
		} else if (encoding === 'one') {
			width = widthOne;
		}

		for (state of Array.from(states)) {
			stateName = fixStateName(state);
			compiled = `${compiled}\`define\t${stateName}\t${width}'b`;
			if (encoding === 'binary') {
				compiled = `${compiled}${pad(count.toString(2), width, '0', STR_PAD_LEFT)}\n`;
			} else {
				compiled = `${compiled}${pad(Math.pow(2, count).toString(2), width, '0', STR_PAD_LEFT)}\n`;
			}
			count++;
		}

		compiled = `${compiled}\nmodule ${moduleName} (${clk}, ${rst}`;

		for (var inport of Array.from(inports)) {
			compiled = `${compiled}, ${inport.name}`;
		}

		compiled = `${compiled}, state);\n`;
		compiled = `${compiled} input ${clk}, ${rst};\n`;

		for (inport of Array.from(inports)) {
			compiled = `${compiled} input `;
			if (inport.size > 1) {
				compiled = `${compiled}[${inport.to}:${inport.from}] `;
			}
			compiled = `${compiled}${inport.name};\n`;
		}

		compiled = `${compiled} output[${width - 1}: 0] state;\n`;

		count = 0;

		stateName = fixStateName(rstState);
		compiled = `${compiled}\n// Declare state flip flops\n  reg [${width - 1} : 0] state, nextstate;\n\n`;

		compiled = `${compiled}  always @ ( ${clkEdge} ${clk} `;

		if (rstMode === 'sync') {
			compiled = `${compiled}) begin\n`;
		} else {
			compiled = `${compiled} or ${rstEdge} ${rst}) begin\n`;
		}

		compiled = `${compiled}\tif (${rst} == 1'b${rstLevel})\n`;
		compiled = `${compiled}\t\tstate <= \`${stateName};\n\telse\n\t\tstate <= nextstate;\n`;

		compiled = `${compiled}  end\n\n`;

		compiled = `${compiled}// next state logic\n`;
		compiled = `${compiled}  always @ (*) begin\n`;
		compiled = `${compiled}\tcase (state)\n`;

		count = 0;

		for (state of Array.from(states)) {
			stateName = fixStateName(state);
			compiled = `${compiled}\t\t\`${stateName}: `;
			compiled = `${compiled}${transition(states, links, count)}`;
			count++;
		}


		compiled = `${compiled}\tendcase\n`;
		compiled = `${compiled}  end\n`;

		compiled = `${compiled}\n // o/p generation logic\n`;
		compiled = `${compiled}always @(*) begin\n`;
		compiled = `${compiled}\tcase (state)\n`;

		for (state of Array.from(states)) {
			stateName = fixStateName(state);
			compiled = `${compiled}\t\t\`${stateName}: ${getOutput(state)}\n`;
		}

		compiled = `${compiled}\tendcase\n`;
		compiled = `${compiled}end\n\n`;
		compiled = `${compiled}endmodule\n`;

		return cb(null, compiled);

	} catch (fsmError) {
		console.error(fsmError);
		console.trace();
		return cb({
			error: 'FSM compilation failed.'
		});
	}
};

module.exports = {
	compile
};