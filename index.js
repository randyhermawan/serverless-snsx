"use strict";

const AwsReq = require("./lib/awsReq");

class ServerlessPlugin {
  constructor(serverless, options, { log }) {
    this.serverless = serverless;
    this.options = options;
    this.logger = log;

    const debugConfig = this.serverless.service.custom?.snsx?.debug ?? {};
    this.isDebug = {
      getLambda: debugConfig.getLambda === true,
      getLambdaPolicy: debugConfig.getLambdaPolicy === true,
      getSnsSubscription: debugConfig.getSnsSubscription === true,
      listSnsSubscription: debugConfig.listSnsSubscription === true,
    };

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

    _self._computeDeploy(fnDef, topicDef).then((actData) => {
      const topicArnSplits = actData.TopicArn.split(":");
      const topicName = topicArnSplits[topicArnSplits.length - 1];

      const setPermission = () => {
        _self.awsReq.LambdaSetSNSTrigger(actData).then((res) => {
          console.log(
            `[snsx event] added trigger permission from sns '${topicName}' to function '${fnName}'`
          );
        });
      };

      switch (actData.Action) {
        case "function-not-found":
          _self.logger.error(
            `Error while retrieving '${fnDef.name}', function doesn't exist`
          );

          break;

        case "create-new-sub":
          _self.awsReq.SNSSubscribe(actData).then((res) => {
            console.log(
              `[snsx event] function '${fnName}' subscribed to topic '${topicName}' with subscription: ${res.SubscriptionArn}`
            );
          });

          if (actData.SetPermission) setPermission();
          break;

        case "update-sub-attr":
          _self.awsReq.SNSSetFilter(actData).then((res) => {
            console.log(
              `[snsx event] function '${fnName}' subscription to topic '${topicName}' updated`
            );
          });

          if (actData.SetPermission) setPermission();
          break;

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

    _self._computeRemove(fnDef, topicDef).then((actData) => {
      const topicArnSplits = actData.TopicArn.split(":");
      const topicName = topicArnSplits[topicArnSplits.length - 1];

      switch (actData.Action) {
        case "delete-sub":
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

  _computeDeploy = (fnDef, topicDef) => {
    const _self = this;

    var fnArn,
      subArn,
      setPermission = false;

    var topicArn = topicDef;
    if (topicDef.arn) topicArn = topicDef.arn;

    return _self.awsReq
      .LambdaGetFunction(fnDef.name)
      .then((resp) => {
        if (this.isDebug.getLambda)
          console.log("[snsx debug] GetLambda Res: ", resp);

        fnArn = resp.Configuration.FunctionArn;

        _self.awsReq
          .LambdaGetPolicy(fnDef.name)
          .then((res) => {
            if (this.isDebug.getLambdaPolicy)
              console.log("[snsx debug] GetLambdaPolicy Res: ", res);

            const triggerPermission = JSON.parse(res.Policy).Statement.find(
              (st) => {
                return (
                  st.Principal.Service === "sns.amazonaws.com" &&
                  st.Resource === fnArn &&
                  st.Condition.ArnLike["AWS:SourceArn"] === topicArn
                );
              }
            );

            if (!triggerPermission) setPermission = true;
          })
          .catch((err) => {
            if (
              !err.message.includes("The resource you requested does not exist")
            ) {
              _self.logger.error(
                `Error while running 'getPolicy' for function '${fnName}': ${err}`
              );
              process.exit(1);
            } else setPermission = true;
          });

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
        if (this.isDebug.getSnsSubscription)
          console.log("[snsx debug] GetSnsSubscription Res: ", resp);

        const res = {
          FunctionArn: fnArn,
          TopicArn: topicArn,
          SetPermission: setPermission,
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
        if (error.message.includes("Function not found:"))
          return { Action: "function-not-found", TopicArn: topicArn };

        _self.logger.error(`Error computing snsx deployment: ${error}`);
        process.exit(1);
      });
  };

  _computeRemove = (fnDef, topicDef) => {
    const _self = this;

    var topicArn = topicDef;
    if (topicDef.arn) topicArn = topicDef.arn;

    const topicArnSplits = topicArn.split(":");
    const fnArn = `arn:aws:lambda:${_self.options.region}:${topicArnSplits[4]}:function:${fnDef.name}`;

    const res = { FunctionArn: fnArn, TopicArn: topicArn };

    return _self.awsReq
      .SNSListSubscription(topicArn)
      .then((resp) => {
        if (this.isDebug.getSnsSubscription)
          console.log("[snsx debug] ListSnsSubscription Res: ", resp);

        const targetSub =
          resp.Subscriptions.find(
            (sub) => sub.Protocol === "lambda" && sub.Endpoint === fnArn
          ) || {};

        if (targetSub.SubscriptionArn) {
          res.Action = "delete-sub";
          res.SubscriptionArn = targetSub.SubscriptionArn;
        } else res.Action = "none";

        return res;
      })
      .catch(function (error) {
        _self.logger.error(`Error computing snsx removal: ${error}`);
        process.exit(1);
      });
  };
}

module.exports = ServerlessPlugin;
