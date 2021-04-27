const Parser = require("./sta/parser");

const fs = require("fs");

const synthesisReport = function (netlistContent, stdcellPath, cb) {
	let cc;
	var arr;
	var rx;
	var arr;
	var rx;
	var l;
	var idx_start;
	var idx_end;
	var arr;
	var rx;
	var arr;
	var rx;
	var l;
	var idx_start;
	var idx_end;
	var arr;
	var rx;
	var arr;
	var rx;
	var arr;
	var rx;
	var arr;
	var rx;



	const stdLibContent = fs.readFileSync(stdcellPath, 'UTF-8');

	return Parser.parseLiberty(stdLibContent, function (err, sclib) {
		let ii, netlist;
		const array = netlistContent.split('\n');
		let inports = 0;
		let outports = 0;
		let cells = 0;
		let nets = 0;
		let iscomb = 0;
		let isff = 0;
		let islat = 0;
		let area = 0;
		const stats = [];
		const netsArr = [];
		const inArr = [];
		const outArr = [];
		let cellsJSON = '{';

		for (var i in sclib.cells) {
			stats[i] = 0;
		}
		let state = 0;
		let firstFlag = 1;
		let instance = '';
		for (i in array) {
			//if array[i].indexOf('$') isnt -1
			//return cb error: "The design has unmapped logic: \"#{array[i]}\"."
			if (state === 1) {
				instance = instance + array[i];
				if (array[i].indexOf(';') !== -1) {
					rx = /(\S+)\s+(\S+)\s+\(\s+([^;]+)/g;
					arr = rx.exec(instance);
					cc = arr[1];
					ii = arr[2];
					const aa = arr[3].split(',');
					let line = '';
					if (firstFlag === 1) {
						firstFlag = 0;
					} else {
						line = ',';
					}
					line = line + '"' + ii + '"' + ':{"cell":"' + cc + '"';
					for (i in aa) {
						i = i;
						rx = /\.([^\(]+)\(([^\)]+)/g;
						arr = rx.exec(aa[i].trim());
						line = line + ', "' + arr[2] + '":"' + arr[1] + '"';
					}
					line = line + '}';
					cellsJSON = cellsJSON + line.replace('\\', '\\\\');
					state = 0;
				}
			} else {
				if (array[i].indexOf('input') !== -1) {
					if (array[i].indexOf('[') !== -1) {
						rx = /\[(\d+)\:(\d+)\]\s+([^\;]+)/g;
						arr = rx.exec(array[i]);
						idx_end = parseInt(arr[1]);
						idx_start = parseInt(arr[2]);
						inports = ((inports + idx_end) - idx_start) + 1;
						l = undefined;
						l = idx_start;
						while (l <= idx_end) {
							inArr.push(arr[3] + '[' + l + ']');
							l++;
						}
					} else {
						inports = 1 + inports;
						rx = /input\s+([^\;]+)/g;
						arr = rx.exec(array[i]);
						inArr.push(arr[1]);
					}
				} else if (array[i].indexOf('output') !== -1) {
					if (array[i].indexOf('[') !== -1) {
						rx = /\[(\d+)\:(\d+)\]\s+([^\;]+)/g;
						arr = rx.exec(array[i]);
						idx_end = parseInt(arr[1]);
						idx_start = parseInt(arr[2]);
						outports = ((outports + idx_end) - idx_start) + 1;
						l = undefined;
						l = idx_start;
						while (l <= idx_end) {
							outArr.push(arr[3] + '[' + l + ']');
							l++;
						}
					} else {
						outports = 1 + outports;
						rx = /output\s+([^\;]+)/g;
						arr = rx.exec(array[i]);
						outArr.push(arr[1]);
					}
				} else if (array[i].indexOf('wire') !== -1) {
					if (array[i].indexOf('[') !== -1) {
						rx = /\[(\d+)\:(\d+)\]\s+([^\;]+)/g;
						arr = rx.exec(array[i]);
						idx_end = parseInt(arr[1]);
						idx_start = parseInt(arr[2]);
						nets = ((nets + idx_end) - idx_start) + 1;
						l = undefined;
						l = idx_start;
						while (l <= idx_end) {
							netsArr.push(arr[3] + '[' + l + ']');

							l++;
						}
					} else {
						nets++;
						rx = /wire\s+([^\;]+)/g;
						arr = rx.exec(array[i]);
						netsArr.push(arr[1]);
					}
				} else if (array[i].indexOf('module') !== -1) {} else if ((array[i].indexOf('(') !== -1) && (array[i].indexOf(')') === -1)) {
					rx = /(\S+)\s+\S+/g;
					arr = rx.exec(array[i]);

					stats[arr[1]]++;
					cells++;
					area = area + sclib.cells[arr[1]].area;
					if (sclib.cells[arr[1]].is_ff === true) {
						isff++;
					} else if (sclib.cells[arr[1]].is_latch === true) {
						islat++;
					} else {
						iscomb++;
					}
					state = 1;
					instance = array[i];
				}
			}
		}
		cellsJSON = cellsJSON + '}';

		try {
			netlist = JSON.parse(cellsJSON);
		} catch (e) {
			console.error(e);
			return cb(null, "Design Summary:\n Failed to generate design summary.");
		}


		let reportContent = `Design Summary:
Input ports:  ${inports}
Output ports: ${outports}
Nets: ${nets}
Cell Count: ${cells} (FF: ${isff})
Total area: ${area} (${Math.round(area / sclib.cells['NAND2X1'].area)} nand2x1 gates)

Used Cells in the design:
\
`;


		for (i in stats) {
			if (stats[i] > 0) {
				reportContent = `${reportContent}${i}: ${stats[i]}\n`;
			}
		}
		reportContent = `${reportContent}\nHigh Fan out cells (fanout > 5):\n`;
		let cntF = 0;
		for (ii in netsArr) {
			const ww = netsArr[ii].toString();
			let driver = '';
			let from = undefined;
			let fanout = 0;
			let maxCap = 0;
			let loadCap = 0;
			for (i in netlist) {
				if (netlist[i][ww]) {
					cc = sclib.cells[netlist[i].cell];
					const pp = netlist[i][ww];
					if (cc.pins[pp].direction === 'output') {
						driver = netlist[i].cell;

						from = i;
						maxCap = cc.pins[pp].max_capacitance;
					} else {
						fanout++;
						loadCap = loadCap + cc.pins[pp].capacitance;
					}
				}
			}


			if (fanout > 5) {
				reportContent = `${reportContent}${driver} has a fan-out of ${fanout} (load: ${Math.round(loadCap * 1000) / 1000}, max: ${Math.round(1000 * maxCap) / 1000}) -- net: ${ww}\n`;
				cntF = 1;
			}
		}
		if (cntF === 0) {
			reportContent = `${reportContent}None\n`;
		}



		if (islat > 0) {
			return cb({
				error: Design(has(latches))
			});
		}

		return cb(null, reportContent);
	});
};

module.exports = {
	synthesisReport
};