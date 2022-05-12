const jwt = require("jsonwebtoken");

const User = require("../controllers/user");
const InvalidToken = require("../models/invalid_token").model;

const config = require("../config");
async function authMiddleware(req, res, next) {
    const authorization = req.get("authorization") || "";
    const token = (
        authorization.split("Bearer ")[1] ||
        req.body.token ||
        req.query.token ||
        ""
    ).trim();
    if (token) {
        let decoded;
        try {
            decoded = await jwt.verify(token, config.jwtSecret);
        } catch (e) {
            console.error(e);
            return next();
        }
        let invalidToken;
        try {
            invalidToken = await InvalidToken.findOne({
                token: token,
            }).exec();
        } catch (e) {
            console.error(e);
            return res.status(401).json({
                error: "Token has expired.",
            });
        }
        if (invalidToken) {
            return next();
        }

        let reqUser;
        try {
            reqUser = await User.getUser({
                _id: decoded._id,
            });
        } catch (e) {
            console.error(e);
            return res.status(401).json({
                error: "Token has expired.",
            });
        }

        req.user = reqUser;
        req.userToken = token;

        return next();
    } else {
        return next();
    }
}
module.exports = authMiddleware;
