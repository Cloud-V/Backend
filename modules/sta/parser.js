'use strict';

module.exports = {
	parseLiberty: function (content, cb) {
		var TPS = require("./thinplate/thinplate");

		/****Regular Expressions Generators****/
		function getAttributeRegex(attr) {
			return new RegExp('\\s*' + attr + '\\s*:\\s*([\\w\\"\\. ,\\(\\)\\+\\-\\*\\/!~\\d]+)\\s*;\\s*', 'm');
		}

		function getAllAttributesRegex() {
			return new RegExp('\\s*(([\\"\\.\\w]+)\\s*:\\s*([\\w\\"\\. ,\\(\\)\\+\\-\\*\\/!~]+);)+\\s*', 'gm');
		}

		function getLibraryRegex() {
			return new RegExp('library\\s*\\(\\s*(.*)\\s*\\)\\s*{([^]+)}', 'm')
		}

		function getBracketRegex() {
			return new RegExp('{([^]+)}');
		}

		function getNumberRegex() {
			return new RegExp('^\\s*(\\-?\\d+(\\.\\d+)?\\s*)$');
		}

		function getQuotedRegex() {
			return new RegExp('\\s*\\"([\\w\\"\\. ,\\(\\)\\+\\-\\*\\/!~\\d]+)\\"\\s*', 'm');
		}

		function getQuotationsRegex() {
			return new RegExp('\\s*\\"\\s*([\\w\\. ,\\(\\)\\+\\-\\*\\/!~]+)\\s*\\"\\s*', 'mg');
		}

		function getFunctionRegex(functionName) {
			return new RegExp('\\s*' + functionName + '\\s*\\((\\-?\\d+.?[\\d+]?)\\s*,\\s*(\\w+)\\)\\s*;\\s*', 'm')
		}

		function getOpeartionRegex(operationName) {
			return new RegExp('\\s*' + operationName + '\\s*\\(\\s*([\\\\ ,\\w\\"\\.\n\\-]+)\\s*\\)\\s*;\\s*', 'm');
		}

		function getSimpleScopeRegex(scopeName) {
			return new RegExp('\\s*' + scopeName + '\\s*\\(\\s*(\\w+)\\s*\\)\\s*{([\\s\\S]+?)}')
		}

		function getFirstBracketRegex(scopeType, openBracket) {
			return new RegExp('\\s*' + scopeType + '\\s*\\(\\s*([\\w ,\\-]*)\\s*\\)\\s*' + openBracket + '\\s*', 'm');
		}

		function getFirstBracketRegexAnyScope(openBracket) {
			return new RegExp('\\s*([\\w\\.]+)\\s*\\(\\s*(\\w*)\\s*\\)\\s*' + openBracket + '\\s*', 'm');
		}

		function get1DTableRegex() {
			return new RegExp('\\s*variable_1\\s*:\\s*([\\w\\.]+)\\s*;\\s*index_1\\s*\\(\\s*\\"([\\w\\"\\. ,\\(\\)\\+\\-\\*\\/!~\\d]+)\\s*\\"\\s*\\)\\s*;\\s*', 'm');
		}

		function get2DTableRegex() {
			return new RegExp('\\s*variable_1\\s*:\\s*([\\w\\.]+)\\s*;\\s*variable_2\\s*:\\s*([\\w\\.]+)\\s*;\\s*index_1\\s*\\(\\s*\\"([\\w\\"\\. ,\\(\\)\\+\\-\\*\\/!~\\d]+)\\s*\\"\\s*\\)\\s*;\\s*index_2\\s*\\(\\s*\\"([\\w\\"\\. ,\\(\\)\\+\\-\\*\\/!~\\d]+)\\s*\\"\\s*\\)\\s*;\\s*', 'm')
		}

		function getGateSizeRegex() {
			return new RegExp('^\\s*(\\w+\\d+)(\\w)(\\d+)\\s*$');
		}

		function getGateSizeRegexNoX() {
			return new RegExp('^\\s*(\\w+)(\\d+)\\s*$');
		}

		/****End Regular Expressions Generators****/

		var Table = function (var1, var1Data, var2, var2Data) { //Data table constructor.
			var extractAxisValues = function (varData) {
				if (getQuotedRegex().test(varData))
					varData = getQuotedRegex().exec(varData)[1];
				var stringData = varData.trim().split(',');
				var floatData = [];
				for (var i = 0; i < stringData.length; i++) {
					var floatValue = parseFloat(stringData[i]);
					if (floatValue == NaN)
						console.error('Cannot parse ' + stringData[i]);
					else
						floatData.push(floatValue);
				}
				return floatData;
			}

			var getMinimum = function (arr) {
				if (arr.length > 0) {
					var min = arr[0];
					for (var i = 1; i < arr.length; i++)
						if (arr[i] < min)
							min = arr[i];
					return min;
				}
				return null;
			}

			var getMaximum = function (arr) {
				if (arr.length > 0) {
					var max = arr[0];
					for (var i = 1; i < arr.length; i++)
						if (arr[i] > max)
							max = arr[i];
					return max;
				}
				return null;
			}

			this.y_axis = var1;
			this.y_values = extractAxisValues(var1Data);
			this.min_y = getMinimum(this.y_values);
			this.max_y = getMaximum(this.y_values);

			this.table = {};
			this.points = [];
			this.targets = [];

			for (var i = 0; i < this.y_values.length; i++) {
				this.table[this.y_values[i]] = 0;
			}



			if (typeof var2 !== 'undefined' && typeof var2Data !== 'undefined') {
				this.dim = 2;
				this.x_axis = var2;
				this.x_values = extractAxisValues(var2Data);
				this.min_x = getMinimum(this.x_values);
				this.max_x = getMaximum(this.x_values);

				for (var i = 0; i < this.y_values.length; i++) {
					this.table[this.y_values[i]] = {};
					for (var j = 0; j < this.x_values.length; j++)
						this.table[this.y_values[i]][this.x_values[j]] = 0;
				}

				this.setData = function (row, column, value) {

					if (typeof row === 'string')
						row = parseFloat(row);
					if (typeof column === 'string')
						column = parseFloat(column);
					if (typeof value === 'string')
						value = parseFloat(value);

					if (!(row in this.table) || !(column in this.table[row])) {
						console.error('No axis value!');
					} else {
						this.table[row][column] = value;
						var point = [row, column];
						if (this.points.indexOf(point) === -1) {
							this.points.push(point);
							this.targets.push(value);
						}
					}
				}
				this.getData = function (row, column) {

					if (typeof (row) === 'string')
						row = parseFloat(row);

					if (typeof (column) === 'string')
						column = parseFloat(column);

					var tps = new TPS();

					tps.compile(this.points, this.targets);

					var targetPoint = [row, column];
					return tps.getValues([targetPoint]).ys[0];
				};

			} else {
				this.dim = 1;
				this.setData = function (column, value) {
					if (typeof column === 'string')
						column = parseFloat(column);
					if (typeof value === 'string')
						value = parseFloat(value);

					if (!(column in this.table)) {
						console.error('No axis value!');
					} else {
						this.table[column] = value;

						var point = [column];
						if (this.points.indexOf(point) === -1) {
							this.points.push(point);
							this.targets.push(value);
						}

					}
				}

				this.getData = function (column) {

					if (typeof (column) === 'string')
						column = parseFloat(column);

					var tps = new TPS();

					tps.compile(this.points, this.targets);

					var targetPoint = [column];

					return tps.getValues([targetPoint]).ys[0];
				}

			}

		};


		function extractAttributes(data) { //Extracting simple object attributes.
			var result = {};
			var attrRegex = getAllAttributesRegex();
			var matchGroups = attrRegex.exec(data);
			while (matchGroups != null) {
				var value = matchGroups[3];
				if (getNumberRegex().test(value))
					result[matchGroups[2]] = parseFloat(value);
				else if (getQuotedRegex().test(value))
					result[matchGroups[2]] = getQuotedRegex().exec(value)[1];
				else
					result[matchGroups[2]] = value
				matchGroups = attrRegex.exec(data);
			}

			return result;
		}

		function extractScope(data, scopeName, openBracket, closeBracket) { //Extracting scope content.

			if (typeof openBracket === 'undefined')
				openBracket = '{';
			if (typeof closeBracket === 'undefined')
				closeBracket = '}';

			var bracketRegex = getFirstBracketRegex(scopeName, openBracket);
			var result = {
				found: false,
				slicedData: data,
				scopeParams: null,
				content: null
			}

			if (bracketRegex.test(data)) {
				var matchGroups = bracketRegex.exec(data);
				var expressionLength = matchGroups[0].length;

				result.found = true;
				result.scopeParams = matchGroups[1];

				var startPos = data.search(bracketRegex) + expressionLength;
				var searchPos = startPos;
				var bracketsCount = 1;

				while (bracketsCount > 0 && searchPos < data.length) {
					if (data.charAt(searchPos) == openBracket)
						bracketsCount++;
					else if (data.charAt(searchPos) == closeBracket)
						bracketsCount--;
					searchPos++;
				}
				if (bracketsCount != 0) {
					console.error('Unmatched bracket.');
					result.found = false;
					return result;
				} else {
					var extracted = data.substr(startPos, searchPos - startPos - 1).trim();
					result.content = extracted;
					result.slicedData = (data.slice(0, startPos - expressionLength) + data.slice(searchPos)).trim();
					return result;
				}
			}

			return result;
		}

		function extractAnyScope(data, openBracket, closeBracket) { //Extracting scope content.

			if (typeof openBracket === 'undefined')
				openBracket = '{';
			if (typeof closeBracket === 'undefined')
				closeBracket = '}';

			var bracketRegex = getFirstBracketRegexAnyScope(openBracket);
			var result = {
				found: false,
				slicedData: data,
				scopeName: null,
				scopeParams: null,
				content: null
			}

			if (bracketRegex.test(data)) {
				var matchGroups = bracketRegex.exec(data);
				var expressionLength = matchGroups[0].length;

				result.found = true;
				result.scopeName = matchGroups[1];
				result.scopeParams = matchGroups[2];

				var startPos = data.search(bracketRegex) + expressionLength;
				var searchPos = startPos;
				var bracketsCount = 1;

				while (bracketsCount > 0 && searchPos < data.length) {
					if (data.charAt(searchPos) == openBracket)
						bracketsCount++;
					else if (data.charAt(searchPos) == closeBracket)
						bracketsCount--;
					searchPos++;
				}
				if (bracketsCount != 0) {
					console.error('Unmatched bracket.');
					result.found = false;
					return result;
				} else {
					var extracted = data.substr(startPos, searchPos - startPos - 1).trim();
					result.content = extracted;
					result.slicedData = (data.slice(0, startPos - expressionLength) + data.slice(searchPos)).trim();
					return result;
				}
			}

			return result;
		}

		function extractTemplates(data) { //Extracting table templates.
			var result = {
				templates: {}
			};
			var luTableTemplateScope = {};
			var powerLutTemplateScope = {};
			while ((luTableTemplateScope = extractScope(data, 'lu_table_template')).found) {
				var scopeContent = luTableTemplateScope.content;
				var tableRegex1D = get1DTableRegex();
				var tableRegex2D = get2DTableRegex();
				if (tableRegex1D.test(scopeContent)) {
					var matchGroups = tableRegex1D.exec(scopeContent);
					var table1D = new Table(matchGroups[1].trim(), matchGroups[2].trim());
					table1D.type = 'lu_table_template';
					result.templates[luTableTemplateScope.scopeParams] = table1D;
				} else if (tableRegex2D.test(scopeContent)) {
					var matchGroups = tableRegex2D.exec(scopeContent);
					var table2D = new Table(matchGroups[1].trim(), matchGroups[3].trim(), matchGroups[2].trim(), matchGroups[4].trim());
					table2D.type = 'lu_table_template';
					result.templates[luTableTemplateScope.scopeParams] = table2D;
				} else
					console.error('Invalid table ' + scopeContent);

				data = luTableTemplateScope.slicedData;
			}

			while ((powerLutTemplateScope = extractScope(data, 'power_lut_template')).found) {
				var scopeContent = powerLutTemplateScope.content;
				var tableRegex1D = get1DTableRegex();
				var tableRegex2D = get2DTableRegex();
				if (tableRegex1D.test(scopeContent)) {
					var matchGroups = tableRegex1D.exec(scopeContent);
					var table1D = new Table(matchGroups[1].trim(), matchGroups[2].trim());
					table1D.type = 'power_lut_template';
					result.templates[powerLutTemplateScope.scopeParams] = table1D;
				} else if (tableRegex2D.test(scopeContent)) {
					var matchGroups = tableRegex2D.exec(scopeContent);
					var table2D = new Table(matchGroups[1].trim(), matchGroups[3].trim(), matchGroups[2].trim(), matchGroups[4].trim());
					table2D.type = 'power_lut_template';
					result.templates[powerLutTemplateScope.scopeParams] = table2D;
				} else
					console.error('Invalid table ' + scopeContent);

				data = powerLutTemplateScope.slicedData;
			}

			result.slicedData = data.trim();
			return result;
		}

		function parseTableObject(data, templates) {
			var result = {};

			var newScope = {};
			while ((newScope = extractAnyScope(data)).found) {
				var templateName = newScope.scopeParams
				var template = templates[templateName];
				var tableDef = newScope.content;
				var timingTable;
				var index1Data = getOpeartionRegex('index_1').exec(tableDef)[1];
				var values = getOpeartionRegex('values').exec(tableDef)[1];
				values = values.replace(/[\\\s]+/gm, '');
				if (template.dim == 2) {
					var index2Data = getOpeartionRegex('index_2').exec(tableDef)[1];
					timingTable = new Table(template.y_axis, index1Data, template.x_axis, index2Data);

					var rowKeys = timingTable.y_values;

					var valuesRowsString = [];
					var quoteRegex = getQuotationsRegex();
					var matchedQuote = quoteRegex.exec(values);
					while (matchedQuote != null) {
						valuesRowsString.push(matchedQuote[1]);
						matchedQuote = quoteRegex.exec(values);
					}

					if (rowKeys.length != valuesRowsString.length)
						console.error('Parsing (rows) error!');

					for (var i = 0; i < rowKeys.length; i++) {
						var columnKeys = timingTable.x_values;
						var stringValues = valuesRowsString[i].trim().split(',');

						if (stringValues.length != columnKeys.length)
							console.error('Parsing (columns) error!');

						for (var j = 0; j < columnKeys.length; j++) {
							var floatValue = parseFloat(stringValues[j].trim());
							if (floatValue === NaN) {
								console.error('Cannot parse ' + stringValues[j].trim());
							} else
								timingTable.setData(rowKeys[i], columnKeys[j], floatValue);
						}

					}

				} else {
					timingTable = new Table(template.y_axis, index1Data);

					var valuesRowsString = [];
					var quoteRegex = getQuotationsRegex();
					var matchedQuote = quoteRegex.exec(values);
					while (matchedQuote != null) {
						valuesRowsString.push(matchedQuote[1]);
						matchedQuote = quoteRegex.exec(values);
					}

					if (valuesRowsString.length != 1)
						console.error('Parsing (row) error!');

					var rowKeys = timingTable.y_values;

					var stringValues = valuesRowsString[0].trim().split(',');

					if (stringValues.length != rowKeys.length)
						console.error('Parsing (columns) error!');

					for (var i = 0; i < rowKeys.length; i++) {
						var floatValue = parseFloat(stringValues[i].trim());
						if (floatValue === NaN) {
							console.error('Cannot parse ' + stringValues[i].trim());
						} else
							timingTable.setData(rowKeys[i], floatValue);
					}

				}
				timingTable.template_name = templateName;
				result[newScope.scopeName] = timingTable;
				data = newScope.slicedData.trim();
			}

			var timingAttrs = extractAttributes(data);
			for (var key in timingAttrs)
				result[key] = timingAttrs[key];


			return result;
		}


		function parseCell(cellDefinition, templates) {
			var newCell = {};


			var ffScope = {};
			if ((ffScope = extractScope(cellDefinition, 'ff')).found) {
				var ffDefintion = ffScope.content;
				newCell.is_ff = true;
				newCell.ff = {};
				var funcs = ffScope.scopeParams.trim().split(',');
				for (var i = 0; i < funcs.length; i++)
					newCell.ff['function_' + i] = funcs[i].trim();
				var ffAttrs = extractAttributes(ffDefintion);
				for (var key in ffAttrs)
					newCell.ff[key] = ffAttrs[key];
				cellDefinition = ffScope.slicedData.trim();
			} else
				newCell.is_ff = false;

			var latchScope = {};
			if ((latchScope = extractScope(cellDefinition, 'latch')).found) {
				var latchDefintion = latchScope.content;
				newCell.is_latch = true;
				newCell.latch = {};
				var funcs = latchScope.scopeParams.trim().split(',');
				for (var i = 0; i < funcs.length; i++)
					newCell.latch['function_' + i] = funcs[i].trim();
				var latchAttrs = extractAttributes(latchDefintion);
				for (var key in latchAttrs)
					newCell.latch[key] = latchAttrs[key];
				cellDefinition = latchScope.slicedData.trim();
			} else
				newCell.is_latch = false;

			var pinScope = {};
			while ((pinScope = extractScope(cellDefinition, 'pin')).found) {

				newCell['pins'] = newCell['pins'] || {};
				var pinDef = pinScope.content;
				var pinName = pinScope.scopeParams;
				newCell.pins[pinName] = {
					name: pinName
				};



				var timingScope = {};

				while ((timingScope = extractScope(pinDef, 'timing')).found) {
					newCell.pins[pinName].timing = newCell.pins[pinName].timing || {};
					var timingContent = timingScope.content;
					var relatedPinRegex = getAttributeRegex('related_pin');
					var relatedPin = 'any';
					if (relatedPinRegex.test(timingContent)) {
						relatedPin = relatedPinRegex.exec(timingContent)[1];
						if (getQuotedRegex().test(relatedPin))
							relatedPin = getQuotedRegex().exec(relatedPin)[1];
						timingContent = timingContent.replace(relatedPinRegex, '');
					}

					var table = parseTableObject(timingContent, templates);
					if (newCell.is_ff && pinName == newCell.ff['next_state']) {

						if ('timing_type' in table) {
							newCell[table.timing_type] = table;
							newCell.pins[pinName].timing[relatedPin] = newCell.pins[pinName].timing[relatedPin] || {};
							newCell.pins[pinName].timing[relatedPin][table.timing_type] = table;
						} else {
							console.error('Undefined timing type: ' + table);
							newCell.pins[pinName].timing[relatedPin] = table[key];
						}
					} else
						newCell.pins[pinName].timing[relatedPin] = table;

					pinDef = timingScope.slicedData;
				}

				var powerScope = {};
				while ((powerScope = extractScope(pinDef, 'internal_power')).found) {
					newCell.pins[pinName].internal_power = newCell.pins[pinName].internal_power || {};
					var powerContent = powerScope.content;
					var relatedPinRegex = getAttributeRegex('related_pin');
					var relatedPin = 'any';
					if (relatedPinRegex.test(powerContent)) {
						relatedPin = relatedPinRegex.exec(powerContent)[1];
						if (getQuotedRegex().test(relatedPin))
							relatedPin = getQuotedRegex().exec(relatedPin)[1];
						powerContent = powerContent.replace(relatedPinRegex, '');
					}
					newCell.pins[pinName].internal_power[relatedPin] = parseTableObject(powerContent, templates);
					pinDef = powerScope.slicedData;

				}
				var pinAttrs = extractAttributes(pinDef);
				for (var key in pinAttrs)
					newCell.pins[pinName][key] = pinAttrs[key];

				cellDefinition = pinScope.slicedData;
			}

			var generalAttrs = extractAttributes(cellDefinition);

			for (var key in generalAttrs)
				newCell[key] = generalAttrs[key];

			return newCell;
		}

		function extractCells(data, templates) {
			var result = {
				cells: {}
			};
			var cellScope = {};
			while ((cellScope = extractScope(data, 'cell')).found) {
				var cellDefinition = cellScope.content;
				var cellName = cellScope.scopeParams;
				result.cells[cellName] = parseCell(cellDefinition, templates);
				result.cells[cellName].name = cellName;
				var gateSizeRegex = getGateSizeRegex();
				var gateSizeRegexNoX = getGateSizeRegexNoX();

				if (gateSizeRegex.test(cellName)) {
					var matchGroups = gateSizeRegex.exec(cellName);
					var cellSize = parseInt(matchGroups[3]);
					result.cells[cellName].basename = matchGroups[1];
					result.cells[cellName].basenameX = matchGroups[1] + matchGroups[2];
					result.cells[cellName].size = cellSize;
				} else if (gateSizeRegexNoX.test(cellName)) {
					var matchGroups = gateSizeRegexNoX.exec(cellName);
					var cellSize = parseInt(matchGroups[2]);
					result.cells[cellName].basename = matchGroups[1];
					result.cells[cellName].basenameX = matchGroups[1];
					result.cells[cellName].size = cellSize;
				} else {
					result.cells[cellName].basename = cellName;
					var cellSize = 1;
					result.cells[cellName].size = cellSize;
				}

				data = cellScope.slicedData;
			}

			result.slicedData = data.trim();
			return result;
		}


		var commentRegex = /\/\/.*$/gm; //RegEx: Capturing comments RegEx.
		var mCommentRegex = /\/\*(.|[\r\n])*?\*\//gm; //RegEx: Capturing multi-line comments RegEx.
		content = content.replace(mCommentRegex, ''); //Removing multi-line comments.
		content = content.replace(commentRegex, ''); //Removing single line comments.

		if (!getLibraryRegex().test(content))
			return cb('Invalid liberty file', null);
		var nameAndData = getLibraryRegex().exec(content);

		var library = {}; //Final Standard Cell Library Object.
		library.name = nameAndData[1];
		content = nameAndData[2];


		/*****Parsing capacitive load unit*****/
		var capacitiveLoadUnitRegex = getFunctionRegex('capacitive_load_unit');

		if (capacitiveLoadUnitRegex.test(content)) {
			var extracted = capacitiveLoadUnitRegex.exec(content);
			library.capacitive_load_unit = {};
			library['capacitive_load_unit'].value = parseFloat(extracted[1]);
			library['capacitive_load_unit'].unit = extracted[2];
			content = content.replace(getFunctionRegex('capacitive_load_unit'), '');
		}

		/*****Parsing operating conditions*****/
		library.operating_conditions = {};
		var operatingConditionsScope;
		while ((operatingConditionsScope = extractScope(content, 'operating_conditions')).found) {
			library.operating_conditions[operatingConditionsScope.scopeParams] = extractAttributes(operatingConditionsScope.content);
			content = operatingConditionsScope.slicedData;
		}

		/****Parsing tables templates****/
		var extractedTemplates = extractTemplates(content);
		content = extractedTemplates.slicedData;
		library.templates = extractedTemplates.templates;

		/****Parsing cells****/
		var extractedCells = extractCells(content, library.templates);
		content = extractedCells.slicedData;
		library.cells = extractedCells.cells;
		library.cells['input'] = {
			pins: {
				'A': {
					name: 'A',
					direction: 'input'
				},
				'Y': {
					name: 'Y',
					direction: 'output'
				}
			},
			is_ff: false,
			is_latch: false,
			is_dummy: false,
			is_input: true,
			is_output: false,
			is_vdd: false,
			is_gnd: false
		};
		library.cells['output'] = {
			pins: {
				'A': {
					name: 'A',
					direction: 'input'
				},
				'Y': {
					name: 'Y',
					direction: 'output'
				}
			},
			is_ff: false,
			is_latch: false,
			is_dummy: false,
			is_input: false,
			is_output: true,
			is_vdd: false,
			is_gnd: false
		};
		library.cells['vdd'] = {
			pins: {
				'A': {
					name: 'A',
					direction: 'input'
				},
				'Y': {
					name: 'Y',
					direction: 'output'
				}
			},
			is_ff: false,
			is_latch: false,
			is_dummy: true,
			is_input: true,
			is_output: false,
			is_vdd: true,
			is_gnd: false
		};
		library.cells['gnd'] = {
			pins: {
				'A': {
					name: 'A',
					direction: 'input'
				},
				'Y': {
					name: 'Y',
					direction: 'output'
				}
			},
			is_ff: false,
			is_latch: false,
			is_dummy: true,
			is_input: true,
			is_output: false,
			is_vdd: false,
			is_gnd: true
		};


		/*****Parsing general attributes*****/
		var libraryAttrs = extractAttributes(content);
		for (var key in libraryAttrs)
			library[key] = libraryAttrs[key];


		/*****Handling sizing*****/
		library.sizing = {};

		for (var key in library.cells) {
			var cellBaseName = library.cells[key].basenameX;
			var cellSize = library.cells[key].size;
			library.sizing[cellBaseName] = library.sizing[cellBaseName] || {};
			library.sizing[cellBaseName][cellSize] = library.cells[key];
		}

		for (var key in library.cells) {
			var cellBaseName = library.cells[key].basenameX;
			library.cells[key].available_sizes = library.cells[key].available_sizes || [];
			for (var sizeKey in library.sizing[cellBaseName])
				if (library.cells[key].available_sizes.indexOf(sizeKey) == -1)
					library.cells[key].available_sizes.push(parseInt(sizeKey));
		}



		cb(null, library);
	},

	parseNetlist: function (content, stdcells, caps, skews, cb) {
		var Cell = require("./cell").cell;
		var Connect = require("./cell").connect;

		function getModuleKeywordRegexRegex(identifier) {
			return new RegExp('\\s*' + identifier + ' (\\w+)\\s*\\(?.*\\)?\\s*;\\s*', 'gm');
		};

		function getModuleRegex(stdcells) {
			var cellNames = '(';
			var cellsArray = Object.keys(stdcells.cells);
			for (var i = 0; i < cellsArray.length; i++)
				if (i != cellsArray.length - 1)
					cellNames = cellNames + cellsArray[i] + '|';
				else
					cellNames = cellNames + cellsArray[i] + ')';
			return new RegExp('^\\s*' + cellNames + '\\s*(.+)\\s*\\(\\s*([\\s\\S]+)\\s*\\)\\s*$', 'm');
		};

		function getYosysCommentRegex() {
			return new RegExp('\\(\\*[\\s\\S]*?\\*\\)', 'gm');
		};

		function getWireRegex() {
			return new RegExp('^\\s*(input|wire|output)\\s*((\\w|\\\\.)+)\\s*$', 'm');
		};

		function getBusRegex() {
			return new RegExp('^\\s*(input|wire|output)\\s*\\[\\s*(\\d+)\\s*:\\s*(\\d+)\\s*\\]\\s*((\\w|\\\\.)+)\\s*$', 'm');
		};

		function getConstantRegex() {
			return new RegExp('(\\d+)\'([bBhHdD])(\\d+)', 'm');
		};

		function getParamRegex() {
			return new RegExp('\\s*\\.(\\w+)\\s*\\(\\s*(([\\w\\[\\]]|\\\\.|\\d+\'[bdhBDH]\\d+)+)\\s*\\)\\s*', 'm');
		};

		function getAssignRegex() {
			return new RegExp('\\s*assign\\s+(([\\w\\[\\]]|\\\\.)+)\\s*=\\s*(([\\w\\[\\]]|\\\\.)+)\\s*', 'm');
		}

		function getKeyRegex(key) {
			key = key.replace(new RegExp('\\\\', 'm'), '\\\\');
			key = key.replace(new RegExp('\\.', 'm'), '\\.');
			key = key.replace(new RegExp('\\+', 'm'), '\\+');
			key = key.replace(new RegExp('\\*', 'm'), '\\*');
			key = key.replace(new RegExp('\\[', 'm'), '\\[');
			key = key.replace(new RegExp('\\(', 'm'), '\\(');
			key = key.replace(new RegExp('\\]', 'm'), '\\]');
			key = key.replace(new RegExp('\\)', 'm'), '\\)');
			return new RegExp('([\\s\\(\\[\\]\\)])\\s*' + key + '\\s*([\\s\\(\\[\\]\\))])', 'gm');
		}


		caps = caps || {};
		skews = skews || {};
		var endmoduleKeywordRegex = /endmodule/g; //RegEx: Capturing 'endmodule'.
		var commentRegex = /\/\/.*$/gm; //RegEx: Capturing comments RegEx.
		var mCommentRegex = /\/\*(.|[\r\n])*?\*\//gm; //RegEx: Capturing multi-line comments RegEx.
		var moduleKeywordRegex = getModuleKeywordRegexRegex('module'); //RegEx: capturing module name.;
		var yosysCommentsRegex = getYosysCommentRegex(); //RegEx: capturing Yosys comments.

		content = content.replace(mCommentRegex, ''); //Removing multi-line comments.
		content = content.replace(commentRegex, ''); //Removing single line comments.
		content = content.replace(yosysCommentsRegex, '');
		content = content.trim();

		var endmoduleCount = (content.match(endmoduleKeywordRegex) || []).length; //Counting the occurences of 'endmodule'.
		var moduleCount = (content.match(moduleKeywordRegex) || []).length; //Counting the occurences of 'module'.
		var warnings = [];
		var busBases = {};
		var cells = {
			'vdd': new Cell('vdd', stdcells.cells['vdd'], stdcells),
			'gnd': new Cell('gnd', stdcells.cells['gnd'], stdcells)
		};
		cells['vdd'].model = 'vdd';
		cells['gnd'].model = 'gnd';
		var wires = {
			'vdd_wire': {
				name: 'vdd_wire',
				direction: 'input',
				input: {
					port: 'Y',
					gate: cells.vdd
				},
				outputs: [],
				type: 'dummy_wire',
				net_capacitance: 0
			},
			'gnd_wire': {
				name: 'gnd_wire',
				direction: 'input',
				input: {
					port: 'Y',
					gate: cells.gnd
				},
				outputs: [],
				type: 'dummy_wire',
				net_capacitance: 0
			}
		};
		if (endmoduleCount != 1 || moduleCount != 1) {
			console.error('Invalid input');
			return cb('Invalid input.', warnings, null, null);
		}

		content = content.replace(endmoduleKeywordRegex, ''); //Removing 'endmodule'.
		var moduleName = moduleKeywordRegex.exec(content)[1];

		content = content.replace(moduleKeywordRegex, '').trim(); //Removing module name.
		var lines = content.split(';'); //Splitting content to instructions.


		/****Handling assgin****/
		var assignTable = {};

		for (var i = 0; i < lines.length; i++) {
			lines[i] = lines[i].trim();
			var assignRegex = getAssignRegex();
			if (assignRegex.test(lines[i])) {
				var matchedGroups = assignRegex.exec(lines[i]);
				assignTable[matchedGroups[1]] = matchedGroups[3];
				lines.splice(i--, 1);
			}
		}

		for (var i = 0; i < lines.length; i++) {
			for (var key in assignTable) {
				var keyRegx = getKeyRegex(key);
				var matches = keyRegx.exec(lines[i]);
				if (matches != null)
					lines[i] = lines[i].replace(getKeyRegex(key), matches[1] + assignTable[key] + matches[2]);
			}
		}

		lines.forEach(function (line) {
			var wireRegex = getWireRegex();
			var busRegex = getBusRegex();
			var moduleRegex = getModuleRegex(stdcells);

			if (wireRegex.test(line)) {
				var matchedGroups = wireRegex.exec(line);
				var wireDirection = matchedGroups[1];
				var wireName = matchedGroups[2];

				if (typeof wires[wireName] !== 'undefined') {
					console.error('Redeclaration of the wire ' + wireName);
					warnings.push('Redeclaration of the wire ' + wireName);
				}

				var netCap = caps[wireName] || {};

				wires[wireName] = {
					name: wireName,
					direction: wireDirection,
					input: {},
					outputs: [],
					type: 'wire',
					net_capacitance: netCap
				};

				if (wireDirection == 'input') {
					cells['___input_' + wireName] = new Cell('___input_' + wireName, stdcells.cells.input, stdcells, function (err) {
						if (err) warnings.push(err);
					});
					cells['___input_' + wireName].IO_wire = wireName;
					wires[wireName].input = {
						port: 'Y',
						gate: cells['___input_' + wireName]
					};
				} else if (wireDirection == 'output') {
					cells['___output_' + wireName] = new Cell('___output_' + wireName, stdcells.cells.output, stdcells, function (err) {
						if (err) warnings.push(err);
					});
					cells['___output_' + wireName].IO_wire = wireName;
					wires[wireName].outputs.push({
						port: 'A',
						gate: cells['___output_' + wireName]
					});
				}

			}

			if (busRegex.test(line)) { /****End of if wireRegex.test***/
				var matchedGroups = busRegex.exec(line);
				var wireDirection = matchedGroups[1];
				var MSB = parseInt(matchedGroups[2]);
				var LSB = parseInt(matchedGroups[3]);
				var wireBase = matchedGroups[4];
				if (LSB > MSB) {
					var temp = LSB;
					LSB = MSB;
					MSB = temp;
				}

				if (typeof busBases[wireBase] !== 'undefined') {
					console.error('Redeclaration of the bus ' + wireBase);
					warnings.push('Redeclaration of the bus ' + wireBase);
				}

				busBases[wireBase] = {
					name: wireBase,
					direction: wireDirection
				}

				for (var i = LSB; i <= MSB; i++) {
					var wireName = wireBase + '[' + i + ']';
					if (typeof wires[wireName] !== 'undefined') {
						console.error('Redeclaration of the wire ' + wireName);
						warnings.push('Redeclaration of the wire ' + wireName);
					}

					var netCap = caps[wireName] || {};

					wires[wireName] = {
						name: wireName,
						direction: wireDirection,
						input: {},
						outputs: [],
						type: 'bus',
						net_capacitance: netCap
					};

					if (wireDirection == 'input') {
						cells['___input_' + wireName] = new Cell('___input_' + wireName, stdcells.cells.input, stdcells, function (err) {
							if (err) warnings.push(err);
						});
						cells['___input_' + wireName].IO_wire = wireName;
						wires[wireName].input = {
							port: 'A',
							gate: cells['___input_' + wireName]
						};
					} else if (wireDirection == 'output') {
						cells['___output_' + wireName] = new Cell('___output_' + wireName, stdcells.cells.output, stdcells, function (err) {
							if (err) warnings.push(err);
						});
						cells['___output_' + wireName].IO_wire = wireName;
						wires[wireName].outputs.push({
							port: 'A',
							gate: cells['___output_' + wireName]
						});
					}
				}
			} else if (moduleRegex.test(line)) { /****End of if busRegex.test***/
				var matchedGroups = moduleRegex.exec(line);
				var cellDefName = matchedGroups[1].trim();
				var cellDef = stdcells.cells[cellDefName];
				var cellName = matchedGroups[2].trim();
				var rawParams = matchedGroups[3].trim();
				cells[cellName] = new Cell(cellName, cellDef, stdcells, function (err) {
					if (err) warnings.push(err);
				});
				cells[cellName].model = cellDefName;
				var paramsList = rawParams.split(',');
				for (var i = 0; i < paramsList.length; i++) {
					paramsList[i] = paramsList[i].trim();
					var paramConnections = getParamRegex().exec(paramsList[i]);
					var targetPort = paramConnections[1].trim();
					var connectionWire = paramConnections[2].trim();
					if (getConstantRegex().test(connectionWire)) {
						wires['vdd_wire'].outputs.push({
							port: targetPort,
							gate: cells[cellName]
						});
					} else {
						if (typeof wires[connectionWire] === 'undefined') {
							console.error('Undefined wire ' + connectionWire);
							warnings.push('Undefined wire ' + connectionWire);
						}
						if (cellDef.pins[targetPort].direction == 'input') {
							wires[connectionWire].outputs.push({
								port: targetPort,
								gate: cells[cellName]
							});
						} else if (cellDef.pins[targetPort].direction == 'output') {
							wires[connectionWire].input = {
								port: targetPort,
								gate: cells[cellName]
							};
						} else {
							console.error('Unknown pin direction for pin ' + targetPort);
							warnings.push('Unknown pin direction for pin ' + targetPort)
						}
					}
				}
			} /***End of moduleRegex.test.***/

		}); /****End of lines.forEach*****/


		/****Completing assign handling****/
		for (var key in assignTable) {
			if (wires[key].direction === 'output' && wires[assignTable[key]].direction === 'input') {
				for (var i = 0; i < wires[key].outputs.length; i++) {
					wires[assignTable[key]].outputs.push(wires[key].outputs[i]);
				}
				wires[key] = undefined;
			}
		}

		for (var key in cells) {
			if (cells[key].isFF()) {
				cells[key].clock_skew = skews[key] || 0;
			}
		}


		/****Connecting Extracted Gates****/
		for (var key in wires) {
			if (typeof wires[key] !== 'undefined' && wires[key].type !== 'dummy_wire')
				for (var i = 0; i < wires[key].outputs.length; i++) {
					if (Object.keys(wires[key].input).length === 0 || typeof (wires[key].outputs[i]) === 'undefined' || Object.keys(wires[key].outputs[i]).length === 0) {
						console.error('Flying wire ' + key);
						warnings.push('Flying wire ' + key);
					} else {
						Connect(wires[key].input.gate, wires[key].outputs[i].gate, wires[key].outputs[i].port, wires[key].net_capacitance);
					}
				}
		}


		delete cells.vdd;
		delete cells.gnd;

		cb(null, warnings, cells, wires);
	},

	parseNetCapacitance: function (content, cb) {
		var parsed;
		try {
			parsed = JSON.parse(content);
		} catch (e) {
			console.error(e);
			return cb('Invalid net capacitances file.', null);
		}

		cb(null, parsed);
	},

	parseTimingConstraints: function (content, cb) {
		var parsed;
		try {
			parsed = JSON.parse(content);
		} catch (e) {
			console.error(e);
			return cb('Invalid timing constraints data', null);
		}

		if (!parsed.hasOwnProperty('clock'))
			cb('The timing constraints file does not have the attribute "clock".', parsed);
		else
			cb(null, parsed);
	},

	parseClockSkews: function (content, cb) {
		var parsed;
		try {
			parsed = JSON.parse(content);
		} catch (e) {
			console.error(e);
			return cb('Invalid clock skews data.', null);
		}

		cb(null, parsed);
	},

	parseSTAInputs: function (stdcellData, capData, clkData, constrData, netlistData, cb) {
		var self = this;
		self.parseLiberty(stdcellData, function (err, stdcells) {
			if (err) {
				return cb(err);
			} else {
				self.parseNetCapacitance(capData, function (err, caps) {
					if (err) {
						return cb(err);
					} else {
						self.parseClockSkews(clkData, function (err, skews) {
							if (err) {
								return cb(err);
							} else {
								self.parseTimingConstraints(constrData, function (err, constr) {
									if (err) {
										return cb(err);
									} else {
										self.parseNetlist(netlistData, stdcells, caps, skews, function (err, warnings, cells, wires) {
											if (err) {
												return cb(err);
											} else {
												return cb(null, stdcells, caps, skews, constr, warnings, cells, wires);
											}
										}); /** End parseNetlist **/
									} /** End else..parseNetlist **/
								}); /** End parseTimingConstraints **/
							} /** End else..parseTimingConstraints **/
						}); /** End parseClockSkews **/
					} /** End else..parseClockSkews **/
				}); /** End parseNetCapacitance **/
			} /** End else..parseNetCapacitance **/
		}); /** End parseLiberty **/
	} /** End parseSTAInputs **/
}