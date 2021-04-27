module.exports = {
    paths: function(content) {
        var extractedArray = [];
        for(var i = 0; i < content.length; i++){
            var pathArray = [];
            for(var j = 0; j < content[i].length; j++){
                if(content[i][j].gate.is_input){

                    pathArray.push({
                                    gate: {
                                                name: content[i][j].gate.IO_wire,
                                                name_id: content[i][j].gate.IO_wire.replace(/\[/gm, '_ob_').replace(/\]/gm, '_cb_').replace(/\s+/gm,'___'),
                                                delay: content[i][j].gate.gate_delay.max,
                                                AAT: content[i][j].gate.AAT_max,
                                                module: 'Input Port',
                                                RAT: content[i][j].gate.RAT
                                        },
                                    port: 'In'
                                });
                }
                else if(content[i][j].gate.is_output)
                    pathArray.push({
                                    gate: {
                                                name: content[i][j].gate.IO_wire,
                                                name_id: content[i][j].gate.IO_wire.replace(/\[/gm, '_ob_').replace(/\]/gm, '_cb_').replace(/\s+/gm,'___'),
                                                delay: content[i][j].gate.gate_delay.max,
                                                AAT: content[i][j].gate.AAT_max,
                                                module: 'Output Port',
                                                RAT: content[i][j].gate.RAT
                                        },
                                    port: content[i][j].port.name
                                });
                else
                    pathArray.push({
                                        gate: {
                                                    name: content[i][j].gate.instanceName,
                                                    name_id: content[i][j].gate.instanceName.replace(/\[/gm, '_ob_').replace(/\]/gm, '_cb_').replace(/\s+/gm,'___'),
                                                    delay: content[i][j].gate.gate_delay.max,
                                                    AAT: (j == 0 && content[i][j].gate.is_ff)? content[i][j].gate.AAT_FF_start : content[i][j].gate.AAT_max,
                                                    module: content[i][j].gate.cellName,
                                                    RAT: (j == 0 && content[i][j].gate.is_ff)? content[i][j].gate.RAT_FF_start : content[i][j].gate.RAT,
                                            },
                                        port: content[i][j].port.name? content[i][j].port.name : 'In'
                                    });
            }
            extractedArray.push(pathArray);
        }

        return JSON.stringify(extractedArray);
    },

    cells: function(content) {
        var cellsContents = [];
		for(var key in content) {
			if(!content[key].is_dummy && !content[key].is_input && !content[key].is_output){
				var cellItem = {};
				cellItem.name = content[key].instanceName;
				var cellInputs = content[key].getInputs();
				var cellOutputs = content[key].getOutputs();
				var inputNames = [];
				var outputNames = [];
				cellItem.number_of_inputs = (cellInputs || []).length;
				cellInputs.forEach(function(inputGate){
						if(!inputGate.is_dummy){
							if(inputGate.is_input)
								inputNames.push('input ' + inputGate.IO_wire);
							else if (inputGate.is_output)
								inputNames.push('output ' + inputGate.IO_wire + ')');
							else
								inputNames.push(inputGate.instanceName);
						}
				});

				cellItem.number_of_outputs = (cellOutputs || []).length;
				cellOutputs.forEach(function(outputGate){
						if(!outputGate.is_dummy){
							if(outputGate.is_input)
								outputGate.push('input ' + outputGate.IO_wire);
							else if (outputGate.is_output)
								outputNames.push('output ' + outputGate.IO_wire);
							else
								outputNames.push(outputGate.instanceName);
						}
				});
				cellItem.input_names = '';
				cellItem.output_names = ';'
				if(inputNames.length > 0){
					if(inputNames.length == 1)
						cellItem.input_names = inputNames[0];
					else
						for(var i = 0; i < inputNames.length; i++)
							if(i == 0)
								cellItem.input_names = '[' + inputNames[i];
							else if (i == inputNames.length - 1)
								cellItem.input_names = cellItem.input_names + ',  ' + inputNames[i] + ']';
							else
								cellItem = cellItem.input_names + ',  ' + inputNames[i];
				}

				if(outputNames.length > 0){
					if(outputNames.length == 1)
						cellItem.output_names =  outputNames[0];
					else
						for(var i = 0; i < outputNames.length; i++)
							if(i == 0)
								cellItem.output_names = '[' + outputNames[i];
							else if (i == outputNames.length - 1)
								cellItem.output_names = cellItem.output_names + ',  ' + outputNames[i] + ']';
							else
								cellItem = cellItem.output_names + ',  ' + outputNames[i];
				}
				cellItem.size = content[key].size;
				cellItem.module = content[key].cellName;
				cellsContents.push(cellItem);
			}
		}
		return JSON.stringify(cellsContents);
    },

    standardCells: function(content) {
        var stdCellsContent = [];
		for(var key in content){
			var cell = content[key];
			if(!cell.is_dummy && !cell.is_input && !cell.is_output){
				var cellItem = {};
				cellItem.name = key;
				if(typeof cell.area !== 'undefined')
					cellItem.area = cell.area;
				else
					cellItem.area = 'N/A';

				if(typeof cell.cell_leakage_power !== 'undefined')
					cellItem.cell_leakage_power = cell.cell_leakage_power;
				else
					cellItem.cell_leakage_power = 'N/A';
				var inputPins = [],
					outputPins = [];
				for(var pinKey in cell.pins){
					if(cell.pins[pinKey].direction == 'input')
						inputPins.push(pinKey);
					else if (cell.pins[pinKey].direction == 'output')
						outputPins.push(pinKey);
				}

				if(inputPins.length == 0){
					cellItem.input_pins = '[]';
				}else if (inputPins.length == 1){
					cellItem.input_pins = '[' + inputPins[0] + ']';
				}else{
					cellItem.input_pins = '[' + inputPins[0];
					for(var i = 1; i < inputPins.length; i++){
						if(i != inputPins.length - 1)
							cellItem.input_pins = cellItem.input_pins + ', ' + inputPins[i];
						else
							cellItem.input_pins = cellItem.input_pins + ', ' + inputPins[i] + ']';
					}
				}

				if(outputPins.length == 0){
					cellItem.output_pins = '[]';
				}else if (outputPins.length == 1){
					cellItem.output_pins = '[' + outputPins[0] + ']';
				}else{
					cellItem.output_pins = '[' + outputPins[0];
					for(var i = 1; i < outputPins.length; i++){
						if(i != outputPins.length - 1)
							cellItem.output_pins = cellItem.output_pins + ', ' + outputPins[i];
						else
							cellItem.output_pins = cellItem.output_pins + ', ' + outputPins[i] + ']';
					}
				}
				stdCellsContent.push(cellItem);
			}
		}
		return JSON.stringify(stdCellsContent);
    }
}
