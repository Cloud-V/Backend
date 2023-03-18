const config = require("./config");
const passportConfig = require("./passport");
const jwtMiddleware = require("./passport/jwt");

const _ = require("underscore");
const express = require("express");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const passport = require("passport");
const rmdir = require("rimraf");
const Grid = require("gridfs-stream");
const compression = require("compression");

const fs = require("fs");
const path = require("path");

const isDev = (process.env.NODE_ENV || "development") === "development";
const servedComponent = config.servedComponent;

if (!["api", "processing"].includes(servedComponent)) {
    console.error(`Unknown served component ${servedComponent}.`);
    process.exit(64);
}

if (servedComponent === "api") {
    require("dotenv").config();
    passportConfig();
}

//Add Underscore Mixins
_.mixin({
    pickSchema(model, excluded) {
        const fields = [];
        const addedNests = {};
        model.schema.eachPath(function (path) {
            if (path.indexOf(".") !== -1) {
                const root = path.substr(0, path.indexOf("."));
                if (addedNests[root] == null) {
                    fields.push(root);
                    addedNests[root] = 1;
                }
            }
            if (_.isArray(excluded)) {
                if (excluded.indexOf(path) < 0) {
                    return fields.push(path);
                } else {
                    return false;
                }
            } else if (path === excluded) {
                return false;
            } else {
                return fields.push(path);
            }
        });
        return fields;
    },
});

const api = {
    routes: require("./routes/v2/index"),
    auth: require("./routes/v2/auth"),
    repo: require("./routes/v2/repo"),
    dashboard: require("./routes/v2/dashboard"),

    cleanup: require("./routes/cleanup"),
    download: require("./routes/v2/repodownload"),
};

const processing = {
    routes: require("./routes/processor"),
};

const restrict = require("./passport/restrict");

mongoose.connection.on("error", function (err) {
    console.error(`Mongoose connection error: ${err}`);
    throw err;
});

Grid.mongo = mongoose.mongo;

const modelFiles = fs.readdirSync("./models");
modelFiles.forEach((elem) => {
    require(`./${path.join("models", elem)}`).model;
});

const app = express();

app.use(compression());

// view engine setup.
app.set("views", path.join(__dirname, "views"));

app.use(
    bodyParser.json({
        limit: "50mb",
    })
);
app.use(
    bodyParser.urlencoded({
        extended: false,
        limit: "50mb",
    })
);
app.use(cookieParser());

app.use("/assets", express.static(path.join(__dirname, "bower_components")));
app.use(express.static(path.join(__dirname, "public")));

global.cookieParser = cookieParser;

const padOptional = (string, amount) => {
    return ("" + (string || "?")).padStart(amount, " ");
};

app.use(
    morgan((tokens, req, res) => {
        let contentLength = tokens.res(req, res, "content-length");
        contentLength = contentLength === NaN ? 0 : contentLength;
        return [
            padOptional(tokens["remote-addr"](req, res), 32) + ":",
            padOptional(tokens.method(req, res), 8),
            padOptional(tokens.status(req, res), 4),
            padOptional(contentLength, 8) + "B",
            "-",
            padOptional(tokens["response-time"](req, res), 8),
            "ms",
            tokens.url(req, res),
        ].join(" ");
    })
);

if (servedComponent === "api") {
    if (config.consolidatedProcessing) {
        app.use("/processing", processing.routes);
    }

    app.use(passport.initialize());
    app.use(passport.session());
    app.use(jwtMiddleware);

    app.use("/uploads", express.static(path.join(__dirname, "uploads")));
    app.use("/beta/soc", express.static(path.join(__dirname, "IDE/soceditor")));

    app.use("/pp", require("express-http-proxy")("localhost:4000/"));

    app.use("/dashboard", api.dashboard);
    app.use("/auth", api.auth);
    app.use("/cleanup", restrict, api.cleanup);
    app.use("/:username/:reponame.zip", api.download);

    app.use("/", api.routes);

    app.use(
        "/:username/:reponame",
        function (req, res, next) {
            req.local = {};
            req.local.username = req.params.username;
            req.local.reponame = req.params.reponame;
            return next();
        },
        api.repo
    );
}
if (servedComponent === "processing") {
    app.use("/", processing.routes);
}

if ((process.env.REFRESH || "").toLowerCase() === "true") {
    const Repo = require("./controllers/repo");
    Repo.refreshAllRepos(function (err) {
        if (err) {
            return console.error(err);
        }
    });
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    const err = new Error("Not Found");
    err.status = 404;
    next(err);
});

// Error Handler
app.use(function (err, req, res, next) {
    isDev && res.status(err.status || 500);
    if (err.status === 404) {
        return res.status(404).json({
            error: "Not found.",
        });
    } else if (err.status === 401) {
        let requestType = req.header("Content-Type" || "");
        requestType = requestType.trim().substr(0, 16).trim();
        return res.status(401).json({
            error: "Authentication failed.",
        });
    } else {
        console.error("Error Handler");
        console.error(err);
        return res.status(500).json(err);
    }
});

module.exports = app;
