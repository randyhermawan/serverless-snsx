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

  isValidObject(item) {
    return item && typeof item == "object";
  }

  validateRemove() {
    this.logger.notice("");
    this.logger.notice("Start param validation...");

    if (
      this.serverless.service.custom != null &&
      this.serverless.service.custom.validate != null &&
      this.serverless.service.custom.validate.remove != null
    ) {
      let params = this.serverless.service.custom.validate.remove;

      if (params.length != 0) {
        if (!this.isValidObject(params)) {
          this.logger.error(`Validate config object is invalid`);
          process.exit(1);
        }

        this.runValidation(params);
      }
    } else {
      this.greyLog("  No param to validate");
    }

    this.logger.notice("Param validation passed, continuing stack removal...");
    this.logger.notice("");
  }

  validateDeploy() {
    this.logger.notice("");
    this.logger.notice("Start param validation...");

    if (
      this.serverless.service.custom != null &&
      this.serverless.service.custom.validate != null &&
      this.serverless.service.custom.validate.deploy != null
    ) {
      let params = this.serverless.service.custom.validate.deploy;

      if (params.length != 0 || params != null) {
        if (!this.isValidObject(params)) {
          this.logger.error(`Validate config object is invalid`);
          process.exit(1);
        }

        this.runValidation(params);
      }
    } else {
      this.greyLog("  No param to validate");
    }

    this.logger.notice("Param validation passed, continuing deployment...");
    this.logger.notice("");
  }

  runValidation(params) {
    params.forEach((item, index) => {
      if (item.cond) {
        try {
          if (eval(item.cond)) {
            this.greyLog(`  CONDITION_${index} - PASSED - ${item.cond}`);
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

  greyLog(message) {
    const greyColorCode = "\x1b[90m";
    const resetColorCode = "\x1b[0m";

    this.logger.verbose(`${greyColorCode}${message}${resetColorCode}`);
  }
}

module.exports = ServerlessPlugin;
