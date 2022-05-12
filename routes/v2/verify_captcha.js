let verifyCaptcha;

if (process.env.CLOUDV_NO_CAPTCHA === "true") {
    verifyCaptcha = async () => {
        return { success: true };
    };
} else {
    if ((process.env.CAPTCHA_SECRET ?? "") === "") {
        console.error(
            "Captchas are not disabled, but no environment variable CAPTCHA_SECRET was set."
        );
        process.exit(78);
    }
    const hcaptcha = require("hcaptcha");
    verifyCaptcha = hcaptcha.verify;
}

module.exports = verifyCaptcha;
