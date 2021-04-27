'use strict';

var analyze = function(gates, constraints, cb){
	this.arrivalTimeCalculation = function(){
		this._topologicalSorting(true); // Forward topological sorting of the graph

		var current;
		var current_index;
		var child;
		var child_index;
		var input_port;

		for(var i=0; i<this.forward_ordering.length; i++){
			current_index = this.forward_ordering[i];
			current = this.gates[current_index];
			for(var j=0; j<this.timing_graph[current_index].children.length; j++){
				child_index = this.timing_graph[current_index].children[j].gate;
				child = this.gates[child_index];
				input_port = this.timing_graph[current_index].children[j].port;

				this._updateValues(current, child, child_index, input_port); // Update the values on the nodes
			}
		}
	}.bind(this);

	this.requiredTimeCalculation = function(){
		this._topologicalSorting(false); // Topological sorting for backward traversal

		var current;
		var current_index;
		var child;
		var child_index;

		for(var i=0; i<this.backward_ordering.length; i++){
			current_index = this.backward_ordering[i];
			current = this.gates[current_index];
			for(var j=0; j<this.timing_graph[current_index].parents.length; j++){
				child_index = this.timing_graph[current_index].parents[j];
				child = this.gates[child_index];
				if(child_index == 0) continue;

				this._evaluateRequiredTime(current, child);
			}
		}
	}.bind(this);

	this.calculateSetupSlack = function(){ // Calculate the setup slack
		for(var i=1; i<this.gates.length; i++){
			if(this.gates[i].isFF()){
				this.gates[i].slack_FF_start = this.gates[i].RAT_FF_start - this.gates[i].AAT_FF_start;
			}
			this.gates[i].slack = this.gates[i].RAT - this.gates[i].AAT_max;
		}
	}.bind(this);

	this.calculateHoldSlack = function(){ // Evaluate the hold slack at the FFs
		for(var i=1; i<this.gates.length; i++){
			if(this.gates[i].isFF()){
				// Note: The hold values are already negated in the liberty file so we add them here
				this.gates[i].hold_slack = this.gates[i].AAT_min + this.gates[i].hold.max - this.gates[i].clock_skew;
			}
		}

	}.bind(this);


	this.generateTimingPathReport = function(){ // Generate all possible timing paths
		var gates_report = new Array(this.report.length);
		for(var i=1; i<this.timing_graph.length; i++){
			if((this.gates[i].is_input && (this.gates[i] != this.clock_node)) || this.gates[i].isFF())
				this.reportDFS(i, false, true);
		}

		for(var i=0; i<this.report.length; i++){
			gates_report[i] = new Array();
			for(var j=0; j<this.report[i].length; j++){
				gates_report[i].push({
					gate: this.gates[this.report[i][j].gate],
					port: this.report[i][j].port
				});
			}
		}

		return gates_report;
	}.bind(this);

	this.reportDFS = function(current_index, port, start){ // Used by generateTimingPathReport
		var gate = this.gates[current_index];
		var children = this.timing_graph[current_index].children;

		this.path.push({
			gate: current_index,
			port: port
		});

		if(gate.is_output || (gate.isFF() && !start)){
			var path = this._clone(this.path);
			this.report.push(path);
		}

		else{
			for(var i=0; i<children.length; i++){
				this.reportDFS(children[i].gate, children[i].port, false);
			}
		}

		this.path.pop();
	}.bind(this);

	this.generateTimingReport = function(){
		var report = {};
		var gatesReport = [];
		var inputsReport = [];
		var outputsReport = [];
		for(var i = 1; i < this.gates.length; i++){

			var gateI = this.gates[i];
			if(gateI.is_dummy)
				continue;
			var gateReport = {};
			if(gateI.is_output){
				gateReport.name = gateI.IO_wire
				gateReport.name_id = gateI.IO_wire.replace(/\[/gm, '_ob_').replace(/\]/gm, '_cb_').replace(/\s+/gm,'___');
				gateReport.module = 'Output Port';
			}else if (gateI.is_input){
				gateReport.name = gateI.IO_wire
				gateReport.name_id = gateI.IO_wire.replace(/\[/gm, '_ob_').replace(/\]/gm, '_cb_').replace(/\s+/gm,'___');
				gateReport.module = 'Input Port';
			}else{
				gateReport.name_id = gateI.instanceName.replace(/\[/gm, '_ob_').replace(/\]/gm, '_cb_').replace(/\s+/gm,'___');
				gateReport.name = gateI.instanceName;
				gateReport.module = gateI.cellName;
			}
			gateReport.input_slew_min = gateI.input_slew.min;
			gateReport.input_slew_max = gateI.input_slew.max;
			gateReport.output_slew_min = gateI.output_slew.min;
			gateReport.output_slew_max = gateI.output_slew.max;
			gateReport.capacitance_load_min = gateI.capacitance_load.min;
			gateReport.capacitance_load_max = gateI.capacitance_load.max;
			gateReport.delay_min = gateI.gate_delay.min;
			gateReport.delay_max = gateI.gate_delay.max;
			gateReport.AAT_min = gateI.AAT_min;
			gateReport.AAT_max = gateI.AAT_max;
			gateReport.RAT = gateI.RAT;
			gateReport.setup_slack = gateI.slack;
			if(gateI.isFF()){
				gateReport.is_ff = true;
				gateReport.hold_slack = gateI.hold_slack;
				gateReport.AAT_start = gateI.AAT_FF_start;
				gateReport.RAT_start = gateI.RAT_FF_start;
				gateReport.slack_FF_start = gateI.slack_FF_start;
				gateReport.setup_min = gateI.setup.min;
				gateReport.setup_max = gateI.setup.max;
				gateReport.hold_min = gateI.hold.min;
				gateReport.hold_max = gateI.hold.max;
			}else
				gateReport.is_ff = false;

			if(gateI.is_input)
				inputsReport.push(gateReport);
			else if (gateI.is_output)
				outputsReport.push(gateReport);
			else
				gatesReport.push(gateReport);
		}

		report.gates = gatesReport.concat(outputsReport).concat(inputsReport);
		report.general = {};

		return report;
	}.bind(this);

	this.optimizeCellSizes = function(){

	}.bind(this);

	this.fixTimingViolation = function(){

	}.bind(this);

	this._fetchAndSetupClockNode = function(){ // Find the clock node
		var input_slew;
		for(var i=1; i<this.gates.length; i++){
			if(this.gates[i].isFF()){
				for(var key in this.gates[i].inputPorts){
					if(this.gates[i].inputPorts[key].clock){
						this.clock_node = this.gates[i].inputs[key][0];
						this.clock_node.isClock = true;

						// Setup clock node
						this.clock_node.gate_delay.max = 0;
						this.clock_node.gate_delay.min = 0;

						input_slew = this.input_slew[this.clock_node.instanceName];
						this.clock_node.input_slew.max = Math.max(input_slew.rise_transition, input_slew.fall_transition);
						this.clock_node.input_slew.min = Math.min(input_slew.rise_transition, input_slew.fall_transition);

						this.clock_node.output_slew.max = this.clock_node.input_slew.max;
						this.clock_node.output_slew.min = this.clock_node.input_slew.min;
						return;
					}
				}
			}
		}
	}.bind(this);

	this._buildTimingPath = function(current, current_index){ // Building timing graph using DFS
		var children = current.getOutputs();
		var child_index;
		this.visited[current_index] = true; // Mark the node as visited
		for(var i=0; i<children.length; i++){
			child_index = this.gates.indexOf(children[i]);

			this.timing_graph[current_index].children.push({ // Point to child
				port: this._getInputPort(current, children[i]),
				gate: child_index
			});
			this.timing_graph[child_index].parents.push(current_index); // Point to parent

			if(!(children[i].is_output || children[i].isFF())) // Not an end of a timing path
				if(!this.visited[child_index]) // If the node wasn't visited previously
					this._buildTimingPath(children[i], child_index);
		}
	}.bind(this);

	this._getInputPort = function(parent, child){ // Get the child's input port the parent connects to
		var counter = 0;
		for(var key in child.inputPorts){
			if(child.inputs[key][0] == parent){
				if(this.port_counter[child.instanceName] != undefined){
					if(this.port_counter[child.instanceName][parent.instanceName] != undefined){
						if(counter == this.port_counter[child.instanceName][parent.instanceName]){
							this.port_counter[child.instanceName][parent.instanceName]++;
							return child.inputPorts[key];
						}else{
							counter++;
							continue;
						}
					}
				}
				this.port_counter[child.instanceName] = {};
				this.port_counter[child.instanceName][parent.instanceName] = 1;
				return child.inputPorts[key];
			}
		}
	}.bind(this);

	this._topologicalSorting = function(forward){ // Topologically sort the nodes for analysis
		var temp_timing_graph = this._clone(this.timing_graph); // Clone the graph as it will be modified during the process
		var starting = new Array();
		var current;
		var child_index;
		var child;
		var element_index;
		var origin_index;

		if(forward){ // Topological sorting for the forward traversal
			for(var i=0; i<temp_timing_graph[0].children.length; i++){ // Remove origin connections
				child_index = temp_timing_graph[0].children[i].gate;
				temp_timing_graph[0].children.splice(i, 1);
				origin_index = temp_timing_graph[child_index].parents.indexOf(0);
				temp_timing_graph[child_index].parents.splice(origin_index, 1); // Remove origin
				i--;
			}

			for(var i=1; i<this.gates.length; i++)
				if(this.gates[i].is_input || this.gates[i].isFF()) // If it is an starting node
					starting.push(i);

			while(starting.length > 0){
				current = starting[0];
				starting.splice(0,1); // remove the first element
				this.forward_ordering.push(current);
				for(var i=0; i<temp_timing_graph[current].children.length; i++){ // Go over children
					child_index = temp_timing_graph[current].children[i].gate;
					child = this.gates[child_index];
					element_index = temp_timing_graph[child_index].parents.indexOf(current); // Find the edge from child to parent
					temp_timing_graph[child_index].parents.splice(element_index, 1); // Remove the edge
					temp_timing_graph[current].children.splice(i, 1); // Remove child
					i--;

					if(temp_timing_graph[child_index].parents.length == 0) // No more incoming edges
						if(!child.isFF()) // Don't take ending FF as they will be covered in the analysis
							starting.push(child_index);
				}
			}
		}
		else{ // Topological sorting for the reverse traversal
			for(var i=0; i<temp_timing_graph[0].children.length; i++){ // Remove origin connections
				child_index = temp_timing_graph[0].children[i].gate;
				temp_timing_graph[0].children.splice(i, 1);
				origin_index = temp_timing_graph[child_index].parents.indexOf(0);
				temp_timing_graph[child_index].parents.splice(origin_index, 1); // Remove origin
				i--;
			}

			for(var i=1; i<this.gates.length; i++)
				if(this.gates[i].is_output || this.gates[i].isFF()) // If it is an ending node
					starting.push(i);

			while(starting.length > 0){
				current = starting[0];
				starting.splice(0, 1); // remove the first element
				this.backward_ordering.push(current);
				for(var i=0; i<temp_timing_graph[current].parents.length; i++){ // Go over parents
					// Needed to avoid cycling into the parents of the FF as it is modelled as 2 nodes
					child_index = temp_timing_graph[current].parents[i];
					child = this.gates[child_index];
					temp_timing_graph[current].parents.splice(i, 1);
					i--;
					//
					for(var j=0; j<temp_timing_graph[child_index].children.length; j++){ // Find the edge from parent to child
						if(temp_timing_graph[child_index].children[j].gate == current){
							element_index = j;
							break;
						}
					}
					temp_timing_graph[child_index].children.splice(element_index, 1); // Remove the edge

					if(temp_timing_graph[child_index].children.length == 0) // No more incoming edges
						if(!child.isFF()) // Don't take ending FF as they will be covered in the analysis
							starting.push(child_index);
				}
			}
		}
	}.bind(this);

	this._updateValues = function(parent, child, child_index, input_port){ // Update the values for the node
		this._evaluateCapacitanceLoad(child, child_index); // Evaluate capacitance for the node

		var timing_tables;
		var clock_port;
		var input_slew;
		var input_delay;
		var output_delay;
		var rise_transition_max, rise_transition_min;
		var fall_transition_max, fall_transition_min;
		var cell_rise_max, cell_fall_max;
		var cell_rise_min, cell_fall_min;
		var setup_rise_max, setup_rise_min;
		var setup_fall_max, setup_fall_min;
		var hold_rise_max, hold_rise_min;
		var hold_fall_max, hold_fall_min;
		var new_max = false;
		var new_min = false;

		// Evaluate the input pins
		if(parent.is_input){
			// Input slew
			if(parent.instanceName in this.input_slew){
				input_slew = this.input_slew[parent.instanceName];
				parent.input_slew.max = Math.max(input_slew.rise_transition, input_slew.fall_transition);
				parent.input_slew.min = Math.min(input_slew.rise_transition, input_slew.fall_transition);
			}
			else{
				parent.input_slew.max = 0;
				parent.input_slew.min = 0;
			}

			// Output slew
			parent.output_slew.max = parent.input_slew.max;
			parent.output_slew.min = parent.input_slew.min;

			// Gate delay
			if(parent.instanceName in this.input_delays){
				input_delay = this.input_delays[parent.instanceName];
				parent.gate_delay.max = Math.max(input_delay.cell_rise, input_delay.cell_fall);
				parent.gate_delay.min = Math.min(input_delay.cell_rise, input_delay.cell_fall);
			}
			else{
				parent.gate_delay.max = 0;
				parent.gate_delay.min = 0;
			}

			// AAT
			parent.AAT_max = 0; // Max AAT = 0
			parent.AAT_min = 0;
		}

		// Evaluate starting FF
		if(parent.isFF()){
			for(var key in parent.outputPort){
				// Input slew
				parent.input_slew.max = this.clock_node.output_slew.max;
				parent.input_slew.min = this.clock_node.output_slew.min;

				//Output slew
				for(var in_key in parent.inputPorts){ // Get the clock port
					if(parent.inputPorts[in_key].clock){
						clock_port = parent.inputPorts[in_key];
						break;
					}
				}
				timing_tables = parent.outputPort[key].timing[clock_port.name]; // Get the timing table with respect to the clock

				rise_transition_max = timing_tables.rise_transition.getData(parent.input_slew.max, parent.capacitance_load.max);
				fall_transition_max = timing_tables.fall_transition.getData(parent.input_slew.max, parent.capacitance_load.max);
				parent.output_slew.max = Math.max(rise_transition_max, fall_transition_max);

				rise_transition_min = timing_tables.rise_transition.getData(parent.input_slew.min, parent.capacitance_load.min);
				fall_transition_min = timing_tables.fall_transition.getData(parent.input_slew.min, parent.capacitance_load.min);
				parent.output_slew.min = Math.min(rise_transition_min, fall_transition_min);

				// Gate delay
				timing_tables = parent.outputPort[key].timing[clock_port.name]; // Get the timing table with respect to the clock

				cell_rise_max = timing_tables.cell_rise.getData(this.clock_node.output_slew.max, parent.capacitance_load.max);
				cell_fall_max = timing_tables.cell_fall.getData(this.clock_node.output_slew.max, parent.capacitance_load.max);
				parent.gate_delay.max = Math.max(cell_rise_max, cell_fall_max);

				cell_rise_min = timing_tables.cell_rise.getData(this.clock_node.output_slew.min, parent.capacitance_load.min);
				cell_fall_min = timing_tables.cell_fall.getData(this.clock_node.output_slew.min, parent.capacitance_load.min);
				parent.gate_delay.min = Math.max(cell_rise_min, cell_fall_min);

				// AAT
				parent.AAT_FF_start = parent.clock_skew; // AAT = clock skew
			}
		}

		if(child.is_output){ // Handled separately since the output pin doesn't have output ports
			// Input slew
			child.input_slew.max = parent.output_slew.max;
			child.input_slew.min = parent.output_slew.min;

			// Output slew
			child.output_slew.max = child.input_slew.max;
			child.output_slew.min = child.input_slew.min;

			// Gate delay
			if(child.instanceName in this.output_delays){
				output_delay = this.output_delays[child.instanceName];
				child.gate_delay.max = Math.max(output_delay.cell_rise, output_delay.cell_fall);
				child.gate_delay.min = Math.min(output_delay.cell_rise, output_delay.cell_fall);
			}
			else{
				child.gate_delay.max = 0;
				child.gate_delay.min = 0;
			}

			// AAT
			if(parent.isFF()) // If parent is a FF
				child.AAT_max = Math.max(child.AAT_max, parent.AAT_FF_start + parent.gate_delay.max + child.gate_delay.max);
			else
				child.AAT_max = Math.max(child.AAT_max, parent.AAT_max + parent.gate_delay.max + child.gate_delay.max);
			return;
		}

		for(var key in child.outputPort){ // Most cases it is a single output port
			if(!(child.is_input || child.isFF())) // Input pins have no timing tables
				timing_tables = child.outputPort[key].timing[input_port.name];

			// Setup and Hold
			if(child.isFF()){
				// Setup time
				setup_rise_max = child["setup_rising"].rise_constraint.getData(this.clock_node.output_slew.min, child.capacitance_load.min);
				setup_fall_max = child["setup_rising"].fall_constraint.getData(this.clock_node.output_slew.min, child.capacitance_load.min);
				child.setup.max = Math.max(setup_rise_max, setup_fall_max);

				setup_rise_min = child["setup_rising"].rise_constraint.getData(this.clock_node.output_slew.min, child.capacitance_load.min);
				setup_fall_min = child["setup_rising"].fall_constraint.getData(this.clock_node.output_slew.min, child.capacitance_load.min);
				child.setup.min = Math.min(setup_rise_min, setup_fall_min);

				// Hold time
				hold_rise_max = child["hold_rising"].rise_constraint.getData(this.clock_node.output_slew.min, child.capacitance_load.min);
				hold_fall_max = child["hold_rising"].rise_constraint.getData(this.clock_node.output_slew.min, child.capacitance_load.min);
				child.hold.max = Math.max(hold_rise_max, hold_fall_max);

				hold_rise_min = child["hold_rising"].rise_constraint.getData(this.clock_node.output_slew.min, child.capacitance_load.min);
				hold_fall_min = child["hold_rising"].rise_constraint.getData(this.clock_node.output_slew.min, child.capacitance_load.min);
				child.hold.min = Math.min(hold_rise_min, hold_fall_min);

				// AAT
				if(parent.isFF()){ // If parent is a FF
					child.AAT_max = Math.max(child.AAT_max, parent.AAT_FF_start + parent.gate_delay.max + child.setup.max);
					child.AAT_min = Math.min(child.AAT_min, parent.AAT_FF_start + parent.gate_delay.min);
				}
				else{
					child.AAT_max = Math.max(child.AAT_max, parent.AAT_max + parent.gate_delay.max + child.setup.max);
					child.AAT_min = Math.min(child.AAT_min, parent.AAT_min + parent.gate_delay.min);
				}
			}
			else{ // Normal handling
				// Input slew
				if(parent.output_slew.max > child.input_slew.max){ // If the maximum input slew rate is a new maximum
					child.input_slew.max = parent.output_slew.max;
					new_max = true;
				}
				if(parent.output_slew.min < child.input_slew.min){ // If the minimum input slew rate is a new minimum
					child.input_slew.min = parent.output_slew.min;
					new_min = true;
				}

				// Output slew
				if(new_max){
					rise_transition_max = timing_tables.rise_transition.getData(child.input_slew.max, child.capacitance_load.max);
					fall_transition_max = timing_tables.fall_transition.getData(child.input_slew.max, child.capacitance_load.max);
					child.output_slew.max = Math.max(rise_transition_max, fall_transition_max);
				}

				if(new_min){
					rise_transition_min = timing_tables.rise_transition.getData(child.input_slew.min, child.capacitance_load.min);
					fall_transition_min = timing_tables.fall_transition.getData(child.input_slew.min, child.capacitance_load.min);
					child.output_slew.min = Math.min(rise_transition_min, fall_transition_min);
				}

				// Gate delay
				if(new_max){
					cell_rise_max = timing_tables.cell_rise.getData(child.input_slew.max, child.capacitance_load.max);
					cell_fall_max = timing_tables.cell_fall.getData(child.input_slew.max, child.capacitance_load.max);
					child.gate_delay.max = Math.max(cell_rise_max, cell_fall_max);
				}

				if(new_min){
					cell_rise_min = timing_tables.cell_rise.getData(child.input_slew.min, child.capacitance_load.min);
					cell_fall_min = timing_tables.cell_fall.getData(child.input_slew.min, child.capacitance_load.min);
					child.gate_delay.min = Math.max(cell_rise_min, cell_fall_min);
				}

				// AAT
				if(parent.isFF()){ // If parent is a FF
					child.AAT_max = Math.max(child.AAT_max, parent.AAT_FF_start + parent.gate_delay.max);
					child.AAT_min = Math.min(child.AAT_min, parent.AAT_FF_start + parent.gate_delay.min);
				}
				else{
					child.AAT_max = Math.max(child.AAT_max, parent.AAT_max + parent.gate_delay.max);
					child.AAT_min = Math.min(child.AAT_min, parent.AAT_min + parent.gate_delay.min);
				}
			}
		}
	}.bind(this);

	this._evaluateRequiredTime = function(parent, child){ // Calculate RAT
		// Evaluate the end nodes
		if(parent.is_output){ // Output pin
			parent.RAT = this.clock;
		}
		else if(parent.isFF()){ // Ending FF
			parent.RAT = this.clock + parent.clock_skew;
		}

		if(child.isFF()){ // Starting FF
			child.RAT_FF_start = Math.min(child.RAT_FF_start, parent.RAT - parent.gate_delay.max);
		}
		else{ // Normal handling
			child.RAT = Math.min(child.RAT, parent.RAT - child.gate_delay.max);
		}
	}.bind(this);

	this._evaluateCapacitanceLoad = function(node, node_index){ // Calculate the capacitance load for a cell
		if(this.calculated_capacitance[node_index]) return; // If it was already evaluated
		if(node.is_output){ // If this is an output pin
			var output_capacitance;
			if(node.instanceName in this.output_capacitance_load)
			{
				output_capacitance = this.output_capacitance_load[node.instanceName];
				node.capacitance_load.max = Math.max(output_capacitance.rise_capacitance, output_capacitance.fall_capacitance);
				node.capacitance_load.min = Math.min(output_capacitance.rise_capacitance, output_capacitance.fall_capacitance);
			}
			else{
				output_capacitance = 0;
				node.capacitance_load.max = 0;
				node.capacitance_load.min = 0;
			}
		}
		else{
			var child;
			var child_index;
			var port;
			for(var key in node.outputPort){ // One output port for simple gates
				for(var i=0; i<this.timing_graph[node_index].children.length; i++){
					child_index = this.timing_graph[node_index].children[i].gate;
					child = this.gates[child_index];
					port = this.timing_graph[node_index].children[i].port;

					// Add the net capacitance to both the minimum and the maximum
					node.capacitance_load.max += node.outputPort[key].net_capacitance[child.instanceName][port.name];
					node.capacitance_load.min += node.outputPort[key].net_capacitance[child.instanceName][port.name];

					if(!child.is_output){
						// Add the maximum and minimum capacitance as a result of the child port
						node.capacitance_load.max += Math.max(port.rise_capacitance, port.fall_capacitance);
						node.capacitance_load.min += Math.min(port.rise_capacitance, port.fall_capacitance);
					}
				}
			}
		}
		this.calculated_capacitance[node_index] = true; // Mark as evaluated
		// Got the total capacitance loading the gate
	}.bind(this);

	this._clone = function(obj){ // Cloning any type of object
		var copy;
		if(null == obj || "object" != typeof obj) return obj; // Handle the 3 simple types, and null or undefined

		if(obj instanceof Date){ // Handle Date
			copy = new Date();
			copy.setTime(obj.getTime());
			return copy;
		}

		if(obj instanceof Array){ // Handle Array
			copy = [];
			for(var i=0, len=obj.length; i<len; i++){
				copy[i] = this._clone(obj[i]);
			}
			return copy;
		}

		if(obj instanceof Object){ // Handle Object
			copy = {};
			for(var attr in obj){
				if(obj.hasOwnProperty(attr)) copy[attr] = this._clone(obj[attr]);
			}
			return copy;
		}
		throw new Error("Unable to copy obj! Its type isn't supported.");
	};

	// Setup array of gates

	this.gates = new Array();
	this.gates.push("Origin"); // This is the origin node
	for(var key in gates) // Map to array convertion
		if(gates.hasOwnProperty(key))
			this.gates.push(gates[key]);

	this.constraints = constraints; // Constraints
	this.timing_graph = new Array(this.gates.length); // Structure to store the timing graph
	this.visited = new Array(this.gates.length); // Used for building the graph
	this.port_counter = {};
	this.calculated_capacitance = new Array(this.gates.length);
	this.forward_ordering = new Array(); // Topological order of the nodes for foward traversal
	this.backward_ordering = new Array(); // Topological order of the nodes for backward traversal

	// For reporting
	this.report = new Array();
	this.path = new Array();

	// Constraints data
	if("input_delays" in constraints)
		this.input_delays = constraints.input_delays; // Constraint input delays (cell rise and cell fall)
	else
		this.input_delays = [];
	if("output_delays" in constraints)
		this.output_delays = constraints.output_delays; // Constraint output delays (cell rise and cell fall)
	else
		this.output_delays = [];
	if("input_slew" in constraints)
		this.input_slew = constraints.input_slew; // Constraint input slew rates (rise transition and fall transition)
	else
		this.input_slew = [];
	if("output_capacitance_load" in constraints)
		this.output_capacitance_load = constraints.output_capacitance_load; // Constraint output capacitance loads (maximum and minimum loads)
	else
		this.output_capacitance_load = [];
	this.clock = constraints.clock; // Constraint clock
	this.clock_node; // The cell modelling the clock

	for(var i=0; i<this.calculated_capacitance.length; i++){ // Initialize array
			this.calculated_capacitance[i] = false;
		}

	// Initialize the timing graph
	for(var i=0; i<this.timing_graph.length; i++){
		this.timing_graph[i] = {
			children: [],
			parents: []
		};
		this.visited[i] = false;
	}

	this._fetchAndSetupClockNode(); // Locate clock node

	// Constructing the timing graph
	for(var i=1; i<this.gates.length; i++){
		if(this.gates[i].is_input || this.gates[i].isFF()){ // Starting point of a timing path: Input pin / FF
			if(!this.gates[i].isClock){
				this.timing_graph[0].children.push({ // Origin points to child
					port: false,
					gate: i
				});
				this.timing_graph[i].parents.push(0); // Point to parent Origin

				this._buildTimingPath(this.gates[i], i);
				this.visited[0] = true;
			}
		}
	}


	this.arrivalTimeCalculation(); // AAT evaluation
	this.requiredTimeCalculation(); // RAT evaluation
	this.calculateSetupSlack(); // Setup slack evaluation
	this.calculateHoldSlack(); // Hold slack evaluation


	var report = this.generateTimingReport();
	var paths_report = this.generateTimingPathReport();
	return cb(null, report, paths_report);
}
var parseAndAnalyze = function() {

}
var STA = {
	parseAndAnalyze: parseAndAnalyze,
	analyze: analyze
};

module.exports = STA;
