module.exports = function(req, res, next) {
    if (req.isAuthenticated()) {
        if (!req.user.authComplete) {
            return res.status(401).json({
                error: "Incomplete user"
            });
        }
        return next();
    }
    if (req.session) {
        req.session.afterAuth = req.originalUrl;
    }
    return res.status(401).json({
        error: "Authentication required."
    });
};
