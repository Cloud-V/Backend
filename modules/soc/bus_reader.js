const fs = require("fs-extra");

function busReader() {
	return new Promise(async (resolve, reject) => {
		const dirs = await fs.readdir('modules/soc/templates');
		const resp = {};

		const promises = dirs.map(dir => new Promise(async (resolve, reject) => {
			try {
				const content = await fs.readFile(path.join('modules/soc/templates', dir));
				const parsed = JSON.parse(content);
				resp[dir.endsWith('.json') ? dir.substr(0, dir.lastIndexOf('.json')) : dir] = parsed;
				return resolve(parsed);
			} catch (err) {
				return reject(err);
			}
		}));

		try {
			await Promise.all(promises);
			return resolve(resp);
		} catch (err) {
			return reject(err);
		}

	});
}

function generateDefaultSoC(template) {
	let gateCount = 0;
	let areaCount = 0;

	function getItemidx(components, field, itemName) {
		for (var i = 0; i <= components.length; ++i) {
			if (components[i][field] === itemName) return i;
		}
		return -1;
	};

	let catIdCounter = {};

	function newCategoryId(category) {
		return catIdCounter[category] = (category in catIdCounter) ? catIdCounter[category] += 1 : 1;
	};
	const DEFAULT_COMPONENTS = [];
	const CATEGORIES = {
		bootloader: "bootloader",
		rv32: "rv32",
		memoryctrl: "memoryctrl",
		memorybanks: "memorybanks",
		io: "io",
		digitalIO: "dio",
		digitalIOPort: "GPIO",
		digitalIORTC: "diortc",
		digitalIOTimer: "Timer",
		analogIO: "aio",
		analogIODAC: "aiodac",
		analogIOADC: "aioadc",
		analogIOPWM: "aiopwm",
		interfaces: "interfaces",
		interfacesSPIMaster: "SPI",
		interfacesUART: "UART",
		interfacesI2C: "interfacesi2c",
		ip: "ip",
		ipAES: "aesaccelerator",
		unsignedMult: "unsignedmult",
		firFilter: "fir",
		BUS: "BUS",
		SRAM: "SRAM",
		CPU: "CPU",
		SMCTRL: "SMCTRL",
		BRDG: "BRDG",
		otherIPs: "otherIPs",
		commIPs: "commIPs",
		digIPs: "digIPs",
		anaIPs: "anaIPs",
		gateCount: gateCount,
		areaCount: areaCount,
		GPIO: "GPIO",
		Timer: "Timer",
		UART: "UART",
		SPI: "SPI"
	};

	const defaultComponents = template.components;
	const AVAILABLE_ATTRS = [];
	const defaultBuses = [];
	const components = [];
	var id_counter = 1;

	for (var key in Object.keys(defaultComponents)) {
		if (Object.keys(defaultComponents[key]).length > 0) {
			var component = {
				title: defaultComponents[key].caption,
				id: "default_" + defaultComponents[key].type + "_" + newCategoryId(CATEGORIES[defaultComponents[key].type]),
				category: CATEGORIES[defaultComponents[key].type],
				gateCount: 0,
				area: 0,
				currentOptions: {},
				isDefaultComponent: true,
				pos_x: defaultComponents[key].pos_x,
				pos_y: defaultComponents[key].pos_y,
				provider: defaultComponents[key].provider,
				cloudvId: defaultComponents[key].cloudvId,
				affinity: defaultComponents[key].affinity
			};

			if (component.category === CATEGORIES["BUS"]) { //BUS step and Length values
				component["step"] = defaultComponents[key].step;
				component["length"] = defaultComponents[key].length;
				defaultBuses.push(component);
			} else {
				component["BUS_name"] = defaultBuses[0].title // Default BUS. Usually "AHB-Lite"
				component["BUSId"] = defaultBuses[0].id //Default BUS.
				component["bussOrientation"] = defaultComponents[key].BusConn.orientation;
			}

			if (component.category === CATEGORIES["BRDG"]) { //Add BRDG's source and distinaton Buses
				component["fromBus"] = defaultBuses[getItemidx(defaultBuses, "title", defaultComponents[key].BusConn.fromBus)].id;
				component["toBus"] = defaultBuses[getItemidx(defaultBuses, "title", defaultComponents[key].BusConn.toBus)].id;
			}

			if (defaultComponents[key].noneditable != undefined) { //non-editable options
				component.gateCount = defaultComponents[key].noneditable.GCount;
				component.area = defaultComponents[key].noneditable.Area;
			}

			if (defaultComponents[key].editable != undefined) { //editable options
				AVAILABLE_ATTRS[component.category] = defaultComponents[key].editable;
				var attrs = defaultComponents[key].editable;
				for (var j = 0, len = attrs.length; j < len; j++) {
					component.currentOptions[attrs[j].name] = null;
				}

			}
			DEFAULT_COMPONENTS.push(component);
		}

	}
	return {
		bus: DEFAULT_COMPONENTS[0].title,
		busId: DEFAULT_COMPONENTS[0].id,
		template: template.template,
		components: DEFAULT_COMPONENTS,
	};
}

module.exports = busReader;
module.exports.generateDefaultSoC = generateDefaultSoC;