const mongoose = require("../config/db");
const { Schema }  = require("mongoose");
const { ObjectId } = Schema;

const moment = require("moment");


const InvalidTokenSchema = new Schema({
	user: {
		type: ObjectId,
		ref: 'User',
		required: true
	},
	token: {
		type: String,
		required: true,
		unique: true
	},
	reason: {
		type: String
	},
	expiry: {
		type: Date,
		default: () => moment().add(30, 'days').toDate()
	}
}, {
	timestamps: {
		createdAt: 'createdAt',
		updatedAt: 'updatedAt'
	}
})

InvalidTokenSchema.virtual('id').get(function () {
	return this._id.toHexString()
})

InvalidTokenSchema.set('toJSON', {
	virtuals: true
})

InvalidTokenSchema.index({
	createdAt: 1
}, {
	expireAfterSeconds: 60 * 1 //60 * 60 * 24 * 30, //30 days (60s * 60m * 24h * 30d)
})
InvalidTokenSchema.index({
	expiry: 1
}, {
	expireAfterSeconds: 0
})

const InvalidToken = mongoose.model('InvalidToken', InvalidTokenSchema)

module.exports = {
	model: InvalidToken
};