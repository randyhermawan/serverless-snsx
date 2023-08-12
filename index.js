"use strict";

class ServerlessPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless;
    this.options = options;
    this.logger = log;

    this.hooks = {
      initialize: this.runValidation.bind(this),
    };
  }

  isValidObject(item) {
    return item && typeof item == "object";
  }

  runValidation() {
    this.logger.notice("Begin param validation checking...");
    this.logger.notice("");

    let params = this.serverless.service.custom.validate;
    if (!this.isValidObject(params)) {
      this.logger.error(`paramValidation content is invalid`);
      process.exit(1);
    }

    params.forEach((item, index) => {
      if (item.cond) {
        try {
          if (eval(item.cond)) {
            this.logger.verbose(`[PASSED] ${item.cond}`);
          } else {
            this.logger.error(
              `Param validation error (${item.cond}): ${item.error}`
            );
            this.logger.notice("");
            process.exit(1);
          }
        } catch (e) {
          this.logger.error(`Cannot evaluate condition ${item.cond}: ${e}`);
          process.exit(1);
        }
      }
    });

    this.logger.notice("");
    this.logger.notice(
      "Param validation checking passed, continuing deployment"
    );
    this.logger.notice("");
  }
}

module.exports = ServerlessPlugin;
