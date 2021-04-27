'use strict';

/*	Cell Model  */

var shortId = require("shortid");



var clone = function (obj) {
	var copy;

	// Handle the 3 simple types, and null or undefined
	if (null == obj || "object" != typeof obj) return obj;

	// Handle Date
	if (obj instanceof Date) {
		copy = new Date();
		copy.setTime(obj.getTime());
		return copy;
	}

	// Handle Array
	if (obj instanceof Array) {
		copy = [];
		for (var i = 0, len = obj.length; i < len; i++) {
			copy[i] = clone(obj[i]);
		}
		return copy;
	}

	// Handle Object
	if (obj instanceof Object) {
		copy = {};
		for (var attr in obj) {
			if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
		}
		return copy;
	}

	throw new Error("Unable to copy obj! Its type isn't supported.");
}

module.exports.clone = clone;


module.exports.cell = function (instanceName, libDef, libRef, cb) {
	this.id = shortId.generate(); //Component ID.
	this.inputs = {}; //Inputs objects.
	this.outputs = {}; //Outputs objects.
	this.is_ff = false; //Checking for sequential elements.
	this.is_latch = false;
	this.instanceName = instanceName;


	// -------------------------For STA--------------------------------
	this.AAT_max = 0; // Maximum Actual Arrival Time
	this.AAT_min = Number.MAX_VALUE; // Minimum Actual Arrival Time
	this.RAT = Number.MAX_VALUE; // Required Arrival Time
	this.slack = 0; // Gate slack
	this.AAT_FF_start = 0; // For starting of FF
	this.RAT_FF_start = Number.MAX_VALUE; // For starting FF
	this.slack_FF_start = 0; // For starting FF
	this.clock_skew; // Clock skew: Used for FF only
	this.isClock = false; // Is the node the clock pin
	this.hold_slack = 0; // Hold slack: Used for FF only

	this.setup = { // Setup time: Used for FF only
		max: -1,
		min: Number.MAX_VALUE
	}
	this.hold = { // Hold time: Used for FF only
		max: -1,
		min: Number.MAX_VALUE
	}

	this.input_slew = { // Maximum and minimum input slew rates
		max: -1,
		min: Number.MAX_VALUE
	};
	this.capacitance_load = { // Maximum and minimum capacitance loads
		max: 0,
		min: 0
	};
	this.output_slew = { // Maximum and minimum output slew rates
		max: -1,
		min: Number.MAX_VALUE
	};
	this.gate_delay = { // Maximum and minimum gate delays
		max: -1,
		min: Number.MAX_VALUE
	};
	// ----------------------------------------------------------------

	this.setDefinition = function (def, ref) { //Setting liberty file cell definition.
		this.libraryRef = ref;
		if (typeof (def) !== 'undefined') {
			this.cellName = def.name;
			this.size = def.size;
			this.inputPorts = {};
			this.outputPort = {};
			this.unkownPorts = {};
			this.available_sizes = def.available_sizes;

			if (typeof ref !== 'undefined') {
				this._alter_definitions = {};
				for (var key in ref.sizing[def.basenameX]) {
					this._alter_definitions[key] = ref.sizing[def.basenameX][key];
				}
			}

			for (var key in def.pins) {
				if (def.pins[key].direction == 'input') {
					this.inputPorts[key] = clone(def.pins[key]);
				} else if (def.pins[key].direction == 'output') {
					this.outputPort[key] = clone(def.pins[key]);
				} else {
					if (typeof cb !== 'undefined')
						cb('Unknown direction for port ' + key + '.');
					this.unkownPorts[key] = clone(def.pins[key]);
				}
			}
			this.inputs = {};
			this.outputs = {};
			var op = Object.keys(this.outputPort)[0];
			this.outputs[op] = [];
			this.is_ff = def.is_ff;
			this.is_latch = def.is_latch;

			if (def.is_ff) {
				if ('setup_rising' in def)
					this.setup_rising = clone(def.setup_rising);
				if ('hold_rising' in def)
					this.hold_rising = clone(def.hold_rising);
			}

			this.is_input = def.is_input || false;

			this.is_output = def.is_output || false;

			if (!def.is_dummy) {
				this.area = def.area;
				this.cell_leakage_power = def.cell_leakage_power;
				this.is_dummy = false
			} else
				this.is_dummy = true;
			for (var key in this.inputPorts) {
				this.inputs[this.inputPorts[key].name] = [];
			}


		} else {
			if (typeof cb !== 'undefined')
				cb('No definition for the module ' + instanceName)
		}
	};

	this.setDefinition(libDef, libRef);

	this.getOutputs = function () { //Getting output cells array.
		if (typeof (this.outputPort) !== 'undefined') {
			var op = Object.keys(this.outputPort)[0];
			return this.outputs[op];
		}
	};

	this.getInputs = function () { //Getting input cells array.
		if (typeof (this.inputPorts) !== 'undefined') {
			var retInputs = [];
			for (var key in this.inputPorts)
				retInputs = retInputs.concat(this.inputs[this.inputPorts[key].name]);
			return retInputs;
		}

	};


	this.isFF = function () { //Checking for sequential elements.
		return this.is_ff;
	};

	this.isLatch = function () { //Checking for sequential elements.
		return this.is_latch;
	};

	this.resizeTo = function (value) {
		if (value <= 0)
			throw "Invalid size " + value;
		if (typeof this._alter_definitions[value] == 'undefined') {
			return 0;
		} else {
			this.size = parseInt(value);
			var newCellDef = this._alter_definitions[value];
			this.cellName = newCellDef.name;
			for (var key in newCellDef.pins) {
				if (newCellDef.pins[key].direction == 'input') {
					this.inputPorts[key] = newCellDef.pins[key];
				} else if (newCellDef.pins[key].direction == 'output') {
					this.outputPort[key] = newCellDef.pins[key];
				} else {
					this.unkownPorts[key] = newCellDef.pins[key];
				}
			}
			return value;
		}
	}

	this.getMinimumSize = function () {
		var min = 9999;
		for (var key in this._alter_definitions) {
			var size = parseInt(key);
			if (size < min)
				min = size;
		}
		return min;
	}

	this.getMaximumSize = function () {
		var max = -1;
		for (var key in this._alter_definitions) {
			var size = parseInt(key);
			if (size > max)
				max = size;
		}
		return max;
	}



	this.resizeBelow = function (value) {
		if (value <= 0)
			throw "Invalid size " + value;
		var newSize = this.getMinimumSize();
		for (var key in this._alter_definitions) {
			var size = parseInt(key);
			if (size > newSize && size < value)
				newSize = size;
		}
		return this.resizeTo(newSize);

	};

	this.resizeAbove = function (value) {
		if (value <= 0)
			throw "Invalid size " + value;
		var newSize = this.getMaximumSize();
		for (var key in this._alter_definitions) {
			var size = parseInt(key);
			if (size < newSize && size > value)
				newSize = size;
		}
		return this.resizeTo(newSize);

	};



	this.resizeBetweenMinimum = function (min, max) {

		if (min <= 0)
			throw "Invalid size " + min;
		if (max <= 0)
			throw "Invalid size " + max;

		var newSize = 9999;

		for (var key in this._alter_definitions) {
			var size = parseInt(key);
			if (size < max && size > min && size < newSize)
				newSize = size;
		}

		return this.resizeTo(newSize);
	};

	this.resizeBetweenMinimumInclusive = function (min, max) {

		if (min <= 0)
			throw "Invalid size " + min;
		if (max <= 0)
			throw "Invalid size " + max;


		var newSize = 9999;

		for (var key in this._alter_definitions) {
			var size = parseInt(key);
			if (size <= max && size >= min && size < newSize)
				newSize = size;
		}

		return this.resizeTo(newSize);
	};

	this.resizeBetweenMaximum = function (min, max) {

		if (min <= 0)
			throw "Invalid size " + min;
		if (max <= 0)
			throw "Invalid size " + max;

		var newSize = -1;

		for (var key in this._alter_definitions) {
			var size = parseInt(key);
			if (size < max && size > min && size > newSize)
				newSize = size;
		}

		return this.resizeTo(newSize);
	};

	this.resizeBetweenMaximumInclusive = function (min, max) {

		if (min <= 0)
			throw "Invalid size " + min;
		if (max <= 0)
			throw "Invalid size " + max;

		var newSize = -1;

		for (var key in this._alter_definitions) {
			var size = parseInt(key);
			if (size <= max && size >= min && size > newSize)
				newSize = size;
		}

		return this.resizeTo(newSize);
	};



};




module.exports.connect = function (source, target, portName, netCap, cb) {
	if (typeof (target.inputPorts[portName]) !== 'undefined') {
		if (target.inputs[portName].indexOf(source) == -1) {
			var op = Object.keys(source.outputPort)[0];
			source.outputs[source.outputPort[op].name].push(target);

			if (typeof source.outputPort[op].net_capacitance !== 'object')
				source.outputPort[op].net_capacitance = {};

			source.outputPort[op].net_capacitance[target.instanceName] = source.outputPort[op].net_capacitance[target.instanceName] || {};

			if (typeof netCap === 'undefined' || typeof netCap[target.instanceName] === 'undefined' || typeof netCap[target.instanceName][portName] === 'undefined')
				source.outputPort[op].net_capacitance[target.instanceName][portName] = 0;
			else {
				source.outputPort[op].net_capacitance[target.instanceName][portName] = netCap[target.instanceName][portName];
			}

			target.inputs[portName].push(source);
		} else {
			if (typeof cb !== 'undefined')
				cb('Connection already exists.')
		}
	} else {
		if (typeof cb !== 'undefined')
			cb('Port ' + portName + ' is not defined as input port for this cell ' + target.instanceName);
	}

};