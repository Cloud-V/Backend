const mongoose = require("../config/db");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const _ = require("underscore");

const VisibiltyType = {
	Private: 0, // Only visisble to project members
	Internal: 1, // Visible to organization/project member
	Public: 2 // Visible to the public
};

const prohibitedNames = [
	"authorize",
	"new",
	"clone",
	"settings",
	"ws",
	"member",
	"members",
	"delete",
	"repo",
	"repository"
];

const projectSchema = new Schema(
	{
		name: {
			type: String,
			required: "You must provide a valid name for the project.",
			lowercase: true
		},
		title: {
			type: String,
			required: true
		},
		description: {
			type: String,
			default: ""
		},
		owner: {
			type: ObjectId,
			required: true,
			ref: "User"
		},
		team: {
			type: ObjectId,
			required: true,
			ref: "Team"
		},
		visibilty: {
			type: Number,
			required: true,
			default: VisibiltyType.Internal
		},
		repoVisibilty: {
			type: Number,
			required: true,
			default: VisibiltyType.Internal
		},
		enforcePrefix: {
			type: Boolean,
			required: true,
			default: true
		},
		prefix: {
			type: String,
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
	},
	{
		timestamps: {
			createdAt: "createdAt",
			updatedAt: "updatedAt"
		}
	}
);

projectSchema
	.path("name")
	.validate(
		name => /^\w+$/gm.test(name),
		"The project name can only contain letters, numbers and underscores."
	);

projectSchema.path("name").validate(function(name) {
	let needle;
	return (
		typeof name === "string" &&
		name.length &&
		((needle = name.toLowerCase()),
		!Array.from(prohibitedNames).includes(needle))
	);
}, "Invalid project name.");

module.exports = {
	model: mongoose.model("Project", projectSchema)
};
