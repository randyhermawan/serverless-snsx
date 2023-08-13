"use strict";

class ServerlessPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless;
    this.options = options;
    this.logger = log;

    this.hooks = {
      "before:deploy:deploy": this.validateDeploy.bind(this),
      "before:remove:remove": this.validateRemove.bind(this),
    };
  }

  validateRemove() {
    this.logger.notice("");
    this.logger.notice("Start param validation...");
    this.logger.notice("");

    let params = this.serverless.service.custom.validate.remove;
    if (!this.isValidObject(params)) {
      this.logger.error(`validate config object is invalid`);
      process.exit(1);
    }

    this.runValidation(params);

    this.logger.notice("");
    this.logger.notice("Param validation passed, continuing stack removal...");
    this.logger.notice("");
  }

  validateDeploy() {
    this.logger.notice("");
    this.logger.notice("Start param validation...");

    let params = this.serverless.service.custom.validate.deploy;
    if (!this.isValidObject(params)) {
      this.logger.error(`validate config object is invalid`);
      process.exit(1);
    }

    this.runValidation(params);

    this.logger.notice("Param validation passed, continuing deployment...");
    this.logger.notice("");
  }

  runValidation(params) {
    params.forEach((item, index) => {
      if (item.cond) {
        try {
          if (eval(item.cond)) {
            this.logGrey(`  CONDITION_${index} - PASSED - ${item.cond}`);
          } else {
            this.logger.error(`Validation error (${item.cond}): ${item.error}`);
            this.logger.notice("");
            process.exit(1);
          }
        } catch (e) {
          this.logger.error(`Cannot evaluate condition ${item.cond}: ${e}`);
          process.exit(1);
        }
      }
    });
  }

  isValidObject(item) {
    return item && typeof item == "object";
  }

  logGrey(message) {
    const greyColorCode = "\x1b[90m";
    const resetColorCode = "\x1b[0m";

    this.logger.verbose(`${greyColorCode}${message}${resetColorCode}`);
  }
}

module.exports = ServerlessPlugin;
