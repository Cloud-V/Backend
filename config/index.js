const urlj = require("url-join");

let loggingLevel = process.env.CLOUDV_LOGGING_LEVEL || "silly";

let serviceHost = process.env.CLOUDV_SERVICE_HOST || "localhost";

// MongoDB
let mongoBaseUri = `mongodb://${serviceHost}:27017`;

let usersDBUri = process.env.CLOUDV_USERS_URI || urlj(mongoBaseUri, "/cloudv");
let fsDBUri = process.env.CLOUDV_FS_URI || urlj(mongoBaseUri, "/cloudvfs");

// Redis
let redis = {
    host: process.env.CLOUDV_REDIS_HOST || serviceHost,
    port: process.env.CLOUDV_REDIS_PORT || 6379,
    password: process.env.CLOUDV_REDIS_PASSWORD || undefined,
};
if (redis.password === undefined) {
    delete redis.password;
}

// Users
class User {
    constructor(user, pass, email) {
        this.user = process.env.CLOUDV_EXTERNAL_USER || user;
        this.pass = process.env.CLOUDV_EXTERNAL_PASS || pass;
        this.email = process.env.CLOUDV_EXTERNAL_EMAIL || email;
    }

    get name() {
        return this.user;
    }
}

let externalUser = new User(
    "external_user",
    "loudPatch66",
    "external_user@cloudv.io"
);
let versionUser = new User(
    "version_user",
    "loudPatch66",
    "version_user@cloudv.io"
);

// Sessions
let sessionKey =
    process.env.CLOUDV_SESSION_KEY || "Y6m5NtJVMo0yO0wN4v1gO164a9266TZf";

let jwtSecret =
    process.env.CLOUDV_JWT_SECRET || "284ES2g3nmt7B668v57m45AZ8292Wf";
let jwtExpiry = process.env.CLOUDV_JWT_EXPIRY || "30days";
let jwtRefreshExpiry = process.env.CLOUDV_JWT_REFRESH_EXPIRY || "14days";

let cookieMaxAge = 30 * 24 * 3600 * 1000;

// AWS
let s3 = {
    bucket: process.env.CLOUDV_S3_BUCKET || "cloudv-data",
};

let batch = {
    noAWSBatch: JSON.parse(process.env.CLOUDV_NO_AWS_BATCH || "false"),
    queues: {
        synthSmallQueue:
            process.env.BATCH_SYNTHESIS_QUEUE ||
            process.env.BATCH_DEFAULT_QUEUE ||
            "cloudv_synth_small_queue",
    },
    scriptsPaths: {
        synthesize:
            process.env.BATCH_SYNTHESIS_SCRIPT_PATH ||
            "/usr/local/scripts/synthesize.js",
    },
    jobDefs: {
        synthesize:
            process.env.BATCH_SYNTHESIS_JOB_DEF ||
            "arn:aws:batch:eu-central-1:415518040273:job-definition/cloudv_synthesize:3",
    },
    cpu: process.env.CLOUDV_BATCH_CPU || 1,
    memory: process.env.CLOUDV_BATCH_MEMORY || 1024,
};

let lambda = {
    local: JSON.parse(process.env.CLOUDV_LOCAL_LAMBDA || "false"),
    name: "CloudVTask",

    // Deprecated: Old Lambda Method (Cringe)
    urls: {
        validate: {
            host: "to2uah0ssi.execute-api.eu-central-1.amazonaws.com",
            path: "/default/CloudVTaskValidate",
            name: "CloudVTaskValidate",
        },
        validateTopModule: {
            host: "cngpz32f09.execute-api.eu-central-1.amazonaws.com",
            path: "/default/CloudVTaskValidateTopModule",
            name: "CloudVTaskValidateTopModule",
        },
        simulateTestbench: {
            host: "is4hjjduri.execute-api.eu-central-1.amazonaws.com",
            path: "/default/CloudVTaskSimulateTB",
            name: "CloudVTaskSimulateTB",
        },
        simulateNL: {
            host: "9zi1so3q5j.execute-api.eu-central-1.amazonaws.com",
            path: "/default/CloudVTaskSimulateNL",
            name: "CloudVTaskSimulateNL",
        },
        synthesis: {
            host: "gtdvmxc4x1.execute-api.eu-central-1.amazonaws.com",
            path: "/default/CloudVTaskSynthesis",
            name: "CloudVTaskSynthesis",
        },
        bitstream: {
            host: "rqmpusvkf5.execute-api.eu-central-1.amazonaws.com",
            path: "/default/CloudVTaskBitstream",
            name: "CloudVTaskBitstream",
        },
        swRiscV: {
            host: "qbvq8sit14.execute-api.eu-central-1.amazonaws.com",
            path: "/default/CloudVTaskCompileRiscV",
            name: "CloudVTaskCompileRiscV",
        },
        swArm: {
            host: "ep8uc4o0fi.execute-api.eu-central-1.amazonaws.com",
            path: "/default/CloudVTaskCompileArm",
            name: "CloudVTaskCompileArm",
        },
    },
};

// Docker
let docker = {
    workspaceImageName:
        process.env.CLOUDV_WORKSPACE_DOCKER || "cloudv/workspace",
    workspacePath: process.env.CLOUDV_WORKSPACE_DOCKER_PATH || "/tmp/ws",
    workspacePath: process.env.CLOUDV_WORKSPACE_DOCKER_PATH || "/tmp/ws",
    stdcellsPath:
        process.env.CLOUDV_WORKSPACE_DOCKER_STDCELLS_PATH || "/tmp/stdcells",
    stdcellsModelsPath:
        process.env.CLOUDV_WORKSPACE_DOCKER_STDCELLS_MODELS_PATH ||
        "/tmp/stdcells-models",
    buildPath: process.env.CLOUDV_WORKSPACE_DOCKER_BUILD_PATH || "/tmp/build",
    timeout: process.env.CLOUDV_DOCKER_TIMEOUT || 10 * 60,
};

// STDCELL Repo Path
let stdcellRepo = process.env.STDCELL_REPO_PATH || "/Stdcells";

// Commands and Lambda App Paths
let yosysCommand = process.env.YOSYS_COMMAND || "yosys";
let iverilogCommand = process.env.IVERILOG_COMMAND || "iverilog";
let vvpCommand = process.env.VVP_COMMAND || "vvp";

class AppInfo {
    constructor(name, variable, fallback) {
        this.name = name;
        this.variable = variable;
        this.fallback = fallback;
    }

    get path() {
        let envPath = process.env[this.variable];
        if (envPath) {
            return envPath;
        }
        return this.fallback;
    }
}

let apps = [
    new AppInfo("ivl", "IVL_PATH", null),
    new AppInfo("iverilog", "IVERILOG_PATH", "iverilog"),
    new AppInfo("iverilogVVP", "IVERILOG_VVP_PATH", "vvp"),
    new AppInfo("yosys", "YOSYS_PATH", "yosys"),
    new AppInfo("nextpnr_ice40", "NEXTPNR_ICE40_PATH", "nextpnr-ice40"),
    new AppInfo("icepack", "ICEPACK_PATH", "icepack"),
    new AppInfo("make", "MAKE_PATH", "make"),
    new AppInfo("armGnu", "ARM_GNU_PATH", "arm-none-eabi"),
    new AppInfo("riscGnu", "RISC_GNU_PATH", "riscv64-unknown-elf"),
];

let appPaths = {};

for (let app of apps) {
    appPaths[app.name] = app.path;
}

// Server Config
function normalizePort(val) {
    const port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}
let useSockets = process.env.CLOUDV_USE_SOCKETS || "";
let servedComponent = process.env.CLOUDV_SERVED_COMPONENT || "api";
let consolidatedProcessing = JSON.parse(
    process.env.CLOUDV_CONSOLIDATE_PROCESSING || "false"
);

let defaultPort =
    servedComponent === "api"
        ? 3000
        : servedComponent === "processing"
        ? 4040
        : 9999;
let port = normalizePort(process.env.PORT || defaultPort);

let webhook = process.env.CLOUDV_WEBHOOK || `http://localhost:${port}/webhook`;

let frontend = {
    host: process.env.CLOUDV_FRONTEND_URL || "localhost:3001",
};

let procProtocol = process.env.CLOUDV_PROCESSOR_PROTOCOL || `http`;
let procPort = consolidatedProcessing
    ? port
    : process.env.CLOUDV_PROCESSOR_PORT || 4040;
let procHost = consolidatedProcessing
    ? `localhost:${port}/processing`
    : process.env.CLOUDV_PROCESSOR_HOST || `localhost:${procPort}`;
let proc = {
    host: procHost,
    protocol: procProtocol,
    url: `${procProtocol}://${procHost}/`,

    simulateTestbenchPath: "simulate-testbench",
    simulateNetlistPath: "simulate-netlist",
    synthesizePath: "synthesize",
    validatePath: "validate",
    validateTopModulePath: "validate-topmodule",
    bitstreamPath: "bitstream",
    swPath: "sw",
};

//File manager
let repoFilesPath = process.env.REPO_FILES_PATH || "repo_files";

module.exports = {
    stdcellRepo,
    loggingLevel,
    usersDBUri,
    fsDBUri,
    redis,
    useSockets,
    externalUser,
    versionUser,
    sessionKey,
    jwtSecret,
    jwtExpiry,
    jwtRefreshExpiry,
    s3,
    batch,
    docker,
    lambda,
    cookieMaxAge,
    yosysCommand,
    iverilogCommand,
    vvpCommand,
    appPaths,
    webhook,
    servedComponent,
    consolidatedProcessing,
    defaultPort,
    port,
    frontend,
    proc,
    repoFilesPath,
};
