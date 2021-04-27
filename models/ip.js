const mongoose = require("../config/db");
const { Schema }  = require("mongoose");
const { ObjectId } = Schema;



const LicenseType = {
	Free: 0,
	Paid: 1
};

const Category = {
	Others: 0,
	Adder: 1,
	ALU: 2,
	Processor: 3,
	Memory: 4,
	RegisterFile: 5
};


const ipSchema = new Schema({
	repo: {
		type: ObjectId,
		required: true,
		ref: 'Repo'
	},
	user: {
		type: ObjectId,
		required: true,
		ref: 'User'
	},
	title: {
		type: String,
		required: true
	},
	description: {
		type: String,
		default: ''
	},
	topModule: {
		type: String,
		default: '',
		required: true
	},
	inputs: {
		type: [{
			name: {
				type: String,
				required: true
			},
			size: {
				type: Number,
				required: true,
				min: 1
			}
		}],
		required: true,
		default: []
	},
	outputs: {
		type: [{
			name: {
				type: String,
				required: true
			},
			size: {
				type: Number,
				required: true,
				min: 1
			}
		}],
		required: true,
		default: []
	},
	data: {
		type: String,
		default: ''
	},
	category: {
		type: Number,
		default: Category.Others,
		required: true
	},
	visible: {
		type: Boolean,
		default: true,
		required: true
	},
	licenseType: {
		type: Number,
		default: LicenseType.Free,
		required: true
	},
	price: {
		type: Number,
		default: 0,
		required: true
	},
	version: {
		type: Number,
		default: 0,
		required: true
	},
	sequence: {
		type: Number,
		default: 0,
		required: true
	},
	created: {
		type: Date,
		required: true,
		default: Date.now
	},
	deleted: {
		type: Boolean,
		required: true,
		default: false
	}
}, {
	timestamps: {
		createdAt: 'createdAt',
		updatedAt: 'updatedAt'
	}
});

ipSchema.virtual('categoryName').get(function () {
	if (this.category === Category.Others) {
		return 'Others';
	} else if (this.category === Category.Adder) {
		return 'Adder';
	} else if (this.category === Category.ALU) {
		return 'ALU';
	} else if (this.category === Category.Processor) {
		return 'Processor';
	} else if (this.category === Category.Memory) {
		return 'Memory';
	} else if (this.category === Category.RegisterFile) {
		return 'Register File';
	} else {
		return 'unkown';
	}
});

module.exports = {
	model: mongoose.model('IP', ipSchema),
	LicenseType,
	Category
};