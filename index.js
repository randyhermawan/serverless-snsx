"use strict";

const AwsReq = require("./lib/awsReq");

class ServerlessPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless;
    this.options = options;
    this.config = serverless.config.serverless.configurationInput;
    this.logger = log;

    this.awsReq = new AwsReq(serverless, options, log);

    this.hooks = {
      "after:deploy:deploy": this._loopEvents.bind(this, this.runDeploy),
      "before:remove:remove": this._loopEvents.bind(this, this.runRemove),
    };
  }

  _loopEvents = (fn) => {
    Object.entries(this.serverless.service.functions).forEach(
      ([fnName, fnDef]) => {
        (fnDef.events || []).forEach((evt) => {
          if (evt.snsx) fn.call(this, fnName, fnDef, evt.snsx);
        });
      }
    );
  };

  _infoLog = (message) => {
    const greyColorCode = "\x1b[90m";
    const resetColorCode = "\x1b[0m";

    this.logger.verbose(`${greyColorCode}${message}${resetColorCode}`);
  };

  runDeploy = (fnName, fnDef, topicDef) => {
    const _self = this;

    _self._check(fnDef, topicDef).then((actData) => {
      const topicArnSplits = actData.TopicArn.split(":");
      const topicName = topicArnSplits[topicArnSplits.length - 1];

      switch (actData.Action) {
        case "create-new-sub":
          return _self.awsReq.SNSSubscribe(actData).then((res) => {
            console.log(
              `[snsx event] function '${fnName}' subscribed to topic '${topicName}' with subscription: ${res.SubscriptionArn}`
            );
            _self.awsReq.LambdaSetSNSTrigger(actData).then((res) => {
              console.log(
                `[snsx event] function '${fnName}' sns topic '${topicName}' trigger permission added`
              );
            });
          });

        case "update-sub-attr":
          return _self.awsReq.SNSSetFilter(actData).then((res) => {
            console.log(
              `[snsx event] function '${fnName}' subscription to topic '${topicName}' updated`
            );
          });

        default:
          console.log(
            `[snsx event] function '${fnName}' subscription to topic '${topicName}' already in-sync`
          );
          break;
      }
    });
  };

  runRemove = (fnName, fnDef, topicDef) => {
    const _self = this;

    _self._check(fnDef, topicDef).then((actData) => {
      const topicArnSplits = actData.TopicArn.split(":");
      const topicName = topicArnSplits[topicArnSplits.length - 1];

      switch (actData.Action) {
        case ("update-sub-attr", "none"):
          return _self.awsReq.SNSUnsubscribe(actData).then((res) => {
            console.log(
              `[snsx event] function '${fnName}' unsubscribed from topic '${topicName}'`
            );
          });

        default:
          console.log(
            `[snsx event] function '${fnName}' subscription to topic '${topicName}' already removed`
          );
          break;
      }
    });
  };

  _check = (fnDef, topicDef) => {
    const _self = this;

    var fnArn, subArn;

    var topicArn = topicDef;
    if (topicDef.arn) topicArn = topicDef.arn;

    return _self.awsReq
      .LambdaGetFunction(fnDef.name)
      .then((resp) => {
        fnArn = resp.Configuration.FunctionArn;
        return _self.awsReq.SNSListSubscription(topicArn);
      })
      .then((resp) => {
        const targetSub =
          resp.Subscriptions.find(
            (sub) => sub.Protocol === "lambda" && sub.Endpoint === fnArn
          ) || {};
        subArn = targetSub.SubscriptionArn;

        if (!targetSub.SubscriptionArn) return { Action: "create-new-sub" };
        else return _self.awsReq.SNSGetSubscription(targetSub.SubscriptionArn);
      })
      .then((resp) => {
        const res = {
          FunctionArn: fnArn,
          TopicArn: topicArn,
        };

        if (resp.Action === "create-new-sub") {
          res.Action = "create-new-sub";
          res.FilterPolicy = topicDef.filterPolicy
            ? JSON.stringify(topicDef.filterPolicy)
            : undefined;
        } else {
          res.SubscriptionArn = subArn;

          if (
            topicDef.filterPolicy &&
            (resp.Attributes.FilterPolicy || "") !==
              (JSON.stringify(topicDef.filterPolicy) || "")
          ) {
            res.Action = "update-sub-attr";
            res.FilterPolicy = JSON.stringify(topicDef.filterPolicy);
          } else if (!topicDef.filterPolicy && resp.Attributes.FilterPolicy) {
            res.Action = "update-sub-attr";
            res.FilterPolicy = JSON.stringify({});
          } else res.Action = "none";
        }

        return res;
      })
      .catch(function (error) {
        _self.logger.error(`Error computing sns actions: ${error}`);
        process.exit(1);
      });
  };
}

module.exports = ServerlessPlugin;
