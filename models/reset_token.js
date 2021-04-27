const mongoose = require("../config/db");
const { Schema }  = require("mongoose");
const { ObjectId } = Schema;

const { wrapResolveCallback } = require("../modules/utils");

const defaultValidty = 1800; //30 Minutes

const resetTokenSchema = new Schema({
	user: {
		type: ObjectId,
		required: true,
		ref: 'User'
	},
	value: {
		type: String,
		required: true
	},
	created: {
		type: Date,
		required: true,
		default: Date.now
	},
	duration: {
		type: Number,
		required: true,
		default: defaultValidty
	},
	consumed: {
		type: Boolean,
		required: true,
		default: false
	},
	expired: {
		type: Boolean,
		required: true,
		default: false
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

resetTokenSchema.methods.getUser = function (cb) {
	const User = require("../controllers/user");
	return User.getUser({
		_id: this.user
	}, cb);
};

resetTokenSchema.methods.isValid = function (cb) {
	return new Promise(async (resolve, reject) => {
		if (this.consumed) {
			return reject({
				error: 'Invalid or expired password reset token'
			});
		} else if (this.expired || (((Date.now() - this.created) / 1000) > this.duration)) {
			return reject({
				error: 'Invalid or expired password reset token'
			});
		} else {
			return resolve(true);
		}
	}).then(wrapResolveCallback(cb)).catch(cb)
};


module.exports = {
	model: mongoose.model('ResetToken', resetTokenSchema),
	defaultValidty
};