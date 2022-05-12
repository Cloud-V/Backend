const mongoose = require("../config/db");
const async = require("async");
const moment = require("moment");

const { ReviewState } = require("../models/code_review");

const createReview = function (review, cb) {
    if (typeof review !== "object") {
        return cb({
            error: "Invalid user data.",
        });
    }

    const reviewModel = require("../models/code_review").model;
    const newReview = new reviewModel({
        repoEntry: review.repoEntry,
        user: review.user,
        state: ReviewState.Ignored,
        content: review.content,
        code: review.code,
        title: "",
    });

    if (review.title != null) {
        newReview.title = review.title;
    }
    return newReview.save(function (err, savedReview) {
        if (err) {
            console.error(err);
            return cb({
                error: "An error occurred while submitting the review.",
            });
        } else {
            return cb(null, savedReview);
        }
    });
};

let updateReview = function () {};

const getReview = function (query, cb) {
    if (query == null) {
        query = {};
    }
    query.deleted = false;

    return mongoose
        .model("CodeReview")
        .findOne(query)
        .sort({
            created: 1,
        })
        .exec(function (err, review) {
            if (err) {
                console.error(err);
                return cb({
                    error: "An error occurred while retrieving the review.",
                });
            } else {
                return cb(null, review);
            }
        });
};

const getReviews = function (query, cb) {
    if (query == null) {
        query = {};
    }
    query.deleted = false;

    return mongoose
        .model("CodeReview")
        .find(query)
        .sort({
            created: 1,
        })
        .exec(function (err, reviews) {
            if (err) {
                console.error(err);
                return cb({
                    error: "An error occurred while retrieving the reviews.",
                });
            } else {
                return cb(null, reviews);
            }
        });
};

const getPendingFileReview = function (entryId, seq, cb) {
    const query = {
        repoEntry: entryId,
        state: ReviewState.Ignored,
        seq,
    };
    return getReview(query, function (err, review) {
        if (err) {
            return cb(err);
        } else if (!review) {
            return cb(null, null);
        } else {
            return review.getUser(function (err, user) {
                if (err) {
                    return cb(err);
                } else if (!user) {
                    return callback({
                        error: "Cannot find review owner",
                    });
                } else {
                    review.username = user.username;
                    review.decoded = Buffer.from(
                        review.code,
                        "base64"
                    ).toString("utf8");
                    review.date = moment(review.created).fromNow();
                    return cb(null, review);
                }
            });
        }
    });
};

const getPendingFileReviews = function (entryId, cb) {
    const query = {
        repoEntry: entryId,
        state: ReviewState.Ignored,
    };
    return getReviews(query, function (err, reviews) {
        if (err) {
            return cb(err);
        } else {
            const tasks = [];
            const updatedReviews = [];
            reviews.forEach((review) =>
                tasks.push((callback) =>
                    review.getUser(function (err, user) {
                        if (err) {
                            return callback(err);
                        } else if (!user) {
                            return callback({
                                error: "Cannot find review owner",
                            });
                        } else {
                            review.username = user.username;
                            review.decoded = Buffer.from(
                                review.code,
                                "base64"
                            ).toString("utf8");
                            review.date = moment(review.created).fromNow();
                            updatedReviews.push(review);
                            return callback();
                        }
                    })
                )
            );
            return async.parallel(tasks, function (err) {
                if (err) {
                    return cb(err);
                } else {
                    return cb(null, updatedReviews);
                }
            });
        }
    });
};

updateReview = (reviewId, updates, cb) =>
    getReview(
        {
            _id: reviewId,
        },
        function (err, review) {
            if (err) {
                return cb(err);
            } else if (!review) {
                return cb({
                    error: "Review does not exist.",
                });
            } else {
                if (updates.state != null) {
                    review.state = updates.state;
                }

                if (updates.title != null) {
                    review.title = updates.title;
                }

                if (updates.content != null) {
                    review.content = updates.content;
                }
                if (updates.code != null) {
                    review.code = updates.code;
                }

                if (updates.deleted != null && updates.deleted) {
                    review.deleted = true;
                    review.code = "";
                }

                return review.save(function (err, savedReview) {
                    if (err) {
                        return cb(err);
                    } else {
                        return cb(null, savedReview);
                    }
                });
            }
        }
    );

const approveReview = (reviewId, cb) =>
    updateReview(
        reviewId,
        {
            state: ReviewState.Approved,
        },
        cb
    );

const disapproveReview = (reviewId, cb) =>
    updateReview(
        reviewId,
        {
            state: ReviewState.Disapproved,
        },
        cb
    );

const removeReview = (reviewId, cb) =>
    updateReview(
        reviewId,
        {
            deleted: true,
        },
        cb
    );

module.exports = {
    createReview,
    updateReview,
    getPendingFileReview,
    getPendingFileReviews,
    updateReview,
    getReview,
    getReviews,
    approveReview,
    disapproveReview,
    removeReview,
};
