const mongoose = require("../config/db");
const { Schema }  = require("mongoose");
const { ObjectId } = Schema;


const PrivacyType = {
	Private: 0,
	Public: 1
};

const versionSchema = new Schema({
	repo: {
		type: ObjectId,
		required: true,
		ref: 'Repo'
	},
	repoOwner: {
		type: ObjectId,
		required: true,
		ref: 'User'
	},
	repoTitle: {
		type: String,
		required: true
	},
	repoName: {
		type: String,
		required: true
	},
	repoPrivacy: {
		type: Number,
		required: true,
		default: PrivacyType.Public
	},
	user: {
		type: ObjectId,
		required: true,
		ref: 'User'
	},
	versionUser: {
		type: ObjectId,
		required: true,
		ref: 'User'
	},
	versionRepo: {
		type: ObjectId,
		required: true,
		ref: 'Repo'
	},
	title: {
		type: String,
		required: true
	},
	description: {
		type: String,
		default: ''
	},
	number: {
		type: String,
		required: true
	},
	privacy: {
		type: Number,
		required: true,
		default: PrivacyType.Public
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

versionSchema.methods.getVersionRepo = function (cb) {
	const Repo = require("../controllers/repo");
	return Repo.getRepo({
		_id: this.versionRepo
	}, cb);
};

versionSchema.methods.getRepo = function (cb) {
	const Repo = require("../controllers/repo");
	return Repo.getRepo({
		_id: this.repo
	}, cb);
};

const autoPopulateUser = function (next) {
	this.populate('user');
	return next();
};

versionSchema.
pre('findOne', autoPopulateUser).
pre('find', autoPopulateUser);

module.exports = {
	model: mongoose.model('Version', versionSchema)
};