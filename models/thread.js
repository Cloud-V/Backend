const mongoose = require("../config/db");
const { Schema }  = require("mongoose");
const { ObjectId } = Schema;


const Repo = require("../controllers/repo");

const ThreadType = {
	Discussion: 0,
	Comment: 1,
	Bug: 2
};


const threadSchema = new Schema({
	title: {
		type: String,
		required: true,
		default: ''
	},
	body: {
		type: String,
		required: true,
		default: ''
	},
	user: {
		type: ObjectId,
		required: true,
		ref: 'User'
	},
	seq: {
		type: Number,
		default: 0
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



module.exports = {
	model: mongoose.model('Thread', threadSchema)
};