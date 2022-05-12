const _ = require("underscore");
const callbackTokenModel = require("../models/callback_token").model;
const Utils = require("../models/utils");

let createToken, getToken, getValidToken;

module.exports.createToken = createToken = function (tokenData, cb) {
    let newToken = new callbackTokenModel();

    newToken = _.extend(
        newToken,
        _.pick(
            _.omit(tokenData, Utils.nonCloneable),
            _.pickSchema(callbackTokenModel)
        )
    );

    return newToken.save(function (err, createdToken) {
        if (err) {
            if (
                err.name != null &&
                err.name === "ValidationError" &&
                err.errors != null
            ) {
                let errorMessage = "";
                for (let validationPath in err.errors) {
                    const validationError = err.errors[validationPath];
                    errorMessage = `${errorMessage}${validationError.message}\n`;
                }
                if (errorMessage.trim() !== "") {
                    return cb({
                        error: errorMessage,
                    });
                } else {
                    console.error(err);
                    return cb({
                        error: "An error occurred while creating the repository.",
                    });
                }
            } else {
                console.error(err);
                return cb({
                    error: "An error occurred while creating the repository.",
                });
            }
        } else {
            return cb(null, createdToken);
        }
    });
};
module.exports.getValidToken = getValidToken = function (query, cb) {
    query = query || {};
    query.deleted = false;
    query.expired = false;
    return callbackTokenModel.findOne(query, function (err, token) {
        if (err) {
            console.error(err);
            return cb({
                error: "An error occurred while retrieving the entry.",
            });
        } else if (!token) {
            return cb({
                error: "Token expired or does not exist.",
            });
        } else {
            return token.isValid(function (err, valid) {
                if (err || !valid) {
                    return cb({
                        error: "Token expired or does not exist.",
                    });
                }
                return cb(null, token);
            });
        }
    });
};

module.exports.getToken = getToken = function (query, cb) {
    query.deleted = false;

    return callbackTokenModel
        .findOne(query)
        .sort({
            created: -1,
        })
        .exec(function (err, token) {
            if (err) {
                console.error(err);
                return cb({
                    error: "An error occurred while retrieving the token.",
                });
            } else {
                return cb(null, token);
            }
        });
};

module.exports.updateToken = updateToken = (callbackId, updates, cb) =>
    getToken(
        {
            _id: callbackId,
        },
        function (err, token) {
            if (err) {
                return cb(err);
            } else if (!token) {
                return cb({
                    error: "Cannot find targeted token.",
                });
            } else {
                const validPaths = _.pickSchema(
                    callbackTokenModel,
                    Utils.nonCloneable
                );
                updates = _.pick(updates, validPaths);
                token = _.extend(token, updates);

                return token.save(function (err, updatedToken) {
                    if (err) {
                        if (
                            err.name != null &&
                            err.name === "ValidationError" &&
                            err.errors != null
                        ) {
                            let errorMessage = "";
                            for (let validationPath in err.errors) {
                                const validationError =
                                    err.errors[validationPath];
                                errorMessage = `${errorMessage}${validationError.message}\n`;
                            }
                            if (errorMessage.trim() !== "") {
                                return cb({
                                    error: errorMessage,
                                });
                            } else {
                                console.error(err);
                                return cb({
                                    error: "An error occurred while updating/deleting the token.",
                                });
                            }
                        } else {
                            console.error(err);
                            return cb({
                                error: "An error occurred while updating/deleting the token",
                            });
                        }
                    } else {
                        return cb(null, updatedToken);
                    }
                });
            }
        }
    );
