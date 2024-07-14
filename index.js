"use strict";

const AwsReq = require("./lib/awsReq");
const DeployFunc = require("./lib/deployFn");

class ServerlessPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless;
    this.options = options;
    this.logger = log;

    this.awsReq = new AwsReq(serverless, options, log);
    this.deployFn = new DeployFunc(serverless, options, log);

    this.hooks = {
      "after:deploy:deploy": this.Deploy.bind(this),
      "after:remove:remove": this.Destroy.bind(this),
    };
  }

  Deploy = async () => {
    this._checkS3Bucket();

    const subArns = [];

    const configurePromises = Object.entries(
      this.serverless.service.functions
    ).flatMap(([fnName, fnDef]) =>
      (fnDef.events || [])
        .filter((evt) => evt.snsx)
        .map((evt) => this.deployFn.ConfigureEvent(fnName, fnDef, evt.snsx))
    );

    const results = await Promise.all(configurePromises);
    subArns.push(...results);

    this.deployFn.PostConfigure(subArns);
  };

  Destroy = async () => {
    const { serverless, awsReq, logger } = this;

    this._checkS3Bucket();

    const bucketName = serverless.service.custom?.snsx?.bucketName;
    const key = `${serverless.service.provider.stage}-${serverless.service.service}-${serverless.service.provider.region}-snsx-state.txt`;

    try {
      const resp = await awsReq.S3GetObject(bucketName, key);
      const remoteState = resp.Body.toString().split("__");

      await Promise.all(
        remoteState.map(async (subArn) => {
          await awsReq.SNSUnsubscribe({ SubscriptionArn: subArn });
          console.log(`[snsx event] subscription '${subArn}' removed`);
        })
      );

      console.log(`[snsx event] all deployed subscriptions removed`);
    } catch (error) {
      if (error.code !== "AWS_S3_GET_OBJECT_NO_SUCH_KEY") {
        logger.error(`Error checking snsx state file: ${error}`);
        process.exit(1);
      }
    }

    try {
      await awsReq.S3DeleteObject(bucketName, key);
      console.log(`[snsx event] snsx state file deleted`);
    } catch (error) {
      logger.error(`Error deleting snsx state file: ${error}`);
      process.exit(1);
    }
  };

  _checkS3Bucket = () => {
    const _self = this;

    const bucketName = this.serverless.service.custom?.snsx?.bucketName;
    if (!bucketName) {
      _self.logger.error(
        `Missing required serverless parameter at custom.snsx.bucketName`
      );
      process.exit(1);
    }

    _self.awsReq
      .S3CheckBucket(bucketName)
      .then(() => {
        console.log(`[snsx event] state bucket '${bucketName}' is valid`);
      })
      .catch(function (error) {
        _self.logger.error(`Error retrieving s3 bucket info: ${error}`);
        process.exit(1);
      });
  };
}

module.exports = ServerlessPlugin;
