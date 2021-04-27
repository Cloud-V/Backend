const mongoose = require("mongoose");
const _ = require("underscore");

const wrapResolveCallback = (cb) => {
	if (typeof cb !== 'function') {
		return null;
	}
	return function () {
		return cb(null, ...arguments);
	}
}
const handleMongooseError = (err, defaultMessage = 'An error has occured') => {
	if ((err.name != null) && (err.name === 'ValidationError') && (err.errors != null)) {
		let errorMessage = '';
		for (let validationPath in err.errors) {
			const validationError = err.errors[validationPath];
			errorMessage = `${errorMessage}${validationError.message}\n`;
		}
		if (errorMessage.trim() !== '') {
			return {
				error: errorMessage
			};
		} else {
			console.error(err);
			return {
				error: defaultMessage
			};
		}
	} else {
		console.error(err);
		return {
			error: defaultMessage
		};
	}
}
const isObjectId = (id) => {
	return mongoose.Types.ObjectId.isValid(id)
}
const getMongooseId = (model) => {
	if (typeof model === 'string' || isObjectId(model)) {
		return model;
	}
	return model._id;
}

const getRepoAccessPipeline = (userId) => {
	const {
		model: repoModel,
		PrivacyType
	} = require("../models/repo");

	const {
		AccessLevel
	} = require("../models/repo_access");
	const repoPaths = _.pickSchema(repoModel);
	const projection = _.reduce(repoPaths, (accum, val) => {
		if (!/\./.test(val)) {
			accum[val] = 1;
		}
		return accum;
	}, {});
	projection.accessLevel = {
		$arrayElemAt: ["$accessLevel", 0]
	};
	return [{
			$lookup: {
				from: 'repoaccesses',
				let: {
					repoId: '$_id',
					userId
				},
				pipeline: [{
					$match: {
						$expr: {
							$and: [{
									$eq: ['$repo', '$$repoId']
								},
								{
									$eq: ['$user', '$$userId']
								},
								{
									$eq: ['$deleted', false]
								}
							]
						}
					}
				}],
				as: 'accessLevel'
			},
		}, {
			$project: projection
		},
		{
			$project: _.extend(_.clone(projection), {
				accessLevel: {
					$ifNull: ["$accessLevel", {
						$cond: {
							if: {
								$eq: ['$privacy', PrivacyType.Public]
							},
							then: {
								accessLevel: AccessLevel.ReadOnly
							},
							else: {
								accessLevel: AccessLevel.NoAccess
							}
						}
					}]
				}
			})
		},
		{
			$project: _.extend(_.clone(projection), {
				accessLevel: "$accessLevel.accessLevel",
				isWriter: {
					$cond: {
						if: {
							$gte: ['$accessLevel.accessLevel', AccessLevel.ReadWrite]
						},
						then: true,
						else: false
					}
				},
				isOwner: {
					$cond: {
						if: {
							$gte: ['$accessLevel.accessLevel', AccessLevel.Owner]
						},
						then: true,
						else: false
					}
				}
			})
		},
		{
			$match: {
				accessLevel: {
					$ne: AccessLevel.NoAccess
				}
			}
		},
		{
			$lookup: {
				from: 'watches',
				let: {
					repoId: '$_id',
					userId
				},
				pipeline: [{
					$match: {
						$expr: {
							$and: [{
									$eq: ['$repo', '$$repoId']
								},
								{
									$eq: ['$user', '$$userId']
								},
								{
									$eq: ['$deleted', false]
								}
							]
						}
					}
				}],
				as: 'watched'
			},
		},
		{
			$lookup: {
				from: 'favorites',
				let: {
					repoId: '$_id',
					userId
				},
				pipeline: [{
					$match: {
						$expr: {
							$and: [{
									$eq: ['$repo', '$$repoId']
								},
								{
									$eq: ['$user', '$$userId']
								},
								{
									$eq: ['$deleted', false]
								}
							]
						}
					}
				}],
				as: 'favorited'
			},
		},
		{
			$project: _.extend(_.clone(projection), {
				watched: {
					$size: '$watched'
				},
				favorited: {
					$size: '$favorited'
				},
				accessLevel: 1
			})
		},
		{
			$project: _.extend(_.clone(projection), {
				watched: {
					$cond: {
						if: {
							$gte: ['$watched', 1]
						},
						then: true,
						else: false
					}
				},
				favorited: {
					$cond: {
						if: {
							$gte: ['$favorited', 1]
						},
						then: true,
						else: false
					}
				},
				accessLevel: 1
			})
		},
	];
}

const getPaginationFacet = (page = 0, pageSize = 9, key = 'repositories', limit = false) => {
	return {
		$facet: {
			[key]: [...(limit ? [{
					$limit: limit
				}] : []),
				{
					$skip: pageSize * (page || 0)
				}, {
					$limit: pageSize
				}
			],
			pageInfo: [...(limit ? [{
				$limit: limit
			}] : []), {
				$group: {
					_id: null,
					count: {
						$sum: 1
					},
				}
			}, {
				$project: {
					_id: 0,
					count: 1,
					pageSize: {
						$literal: pageSize
					},
					pageCount: {
						$ceil: {
							$divide: ['$count', pageSize]
						}
					}
				}
			}]
		}
	};
}

const promiseSeries = (list) => {
	const p = Promise.resolve();
	return list.reduce(function (pacc, fn) {
		return pacc = pacc.then(fn);
	}, p);
}

module.exports = {
	wrapResolveCallback,
	handleMongooseError,
	isObjectId,
	getMongooseId,
	getRepoAccessPipeline,
	getPaginationFacet,
	promiseSeries
}