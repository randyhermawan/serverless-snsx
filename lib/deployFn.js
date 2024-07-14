const AwsReq = require("./awsReq");

class DeployFunc {
  constructor(serverless, options, logger) {
    this.serverless = serverless;
    this.options = options;
    this.logger = logger;

    this.awsReq = new AwsReq(serverless, options, logger);
  }

  ConfigureEvent = (fnName, fnDef, topicDef) => {
    const _self = this;

    return _self._retrieveData(fnDef, topicDef).then((actData) => {
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
          process.exit(1);

        case "create-new-sub":
          _self.awsReq.SNSSubscribe(actData).then((res) => {
            console.log(
              `[snsx event] function '${fnName}' subscribed to topic '${topicName}' with subscription: ${res.SubscriptionArn}`
            );

            if (actData.SetPermission) setPermission();
            return res.SubscriptionArn;
          });
          break;

        case "update-sub-attr":
          _self.awsReq.SNSSetFilter(actData).then((res) => {
            console.log(
              `[snsx event] function '${fnName}' subscription to topic '${topicName}' updated`
            );

            if (actData.SetPermission) setPermission();
            return actData.SubscriptionArn;
          });
          break;

        default:
          console.log(
            `[snsx event] function '${fnName}' subscription to topic '${topicName}' already in-sync`
          );
          return actData.SubscriptionArn;
      }
    });
  };

  _retrieveData = (fnDef, topicDef) => {
    const _self = this;

    var fnArn,
      subArn,
      setPermission = false;

    var topicArn = topicDef;
    if (topicDef.arn) topicArn = topicDef.arn;

    return _self.awsReq
      .LambdaGetFunction(fnDef.name)
      .then((resp) => {
        fnArn = resp.Configuration.FunctionArn;

        _self.awsReq
          .LambdaGetPolicy(fnDef.name)
          .then((res) => {
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

  PostConfigure = async (subArns) => {
    const { serverless, awsReq, logger } = this;

    const currentState = subArns.join("__");

    const bucketName = serverless.service.custom?.snsx?.bucketName;
    const key = `${serverless.service.provider.stage}-${serverless.service.service}-${serverless.service.provider.region}-snsx-state.txt`;

    var stateAction = "new";

    try {
      const resp = await awsReq.S3GetObject(bucketName, key);
      const remoteState = resp.Body.toString().split("__");

      const unmatchedArns = remoteState.filter(
        (subArn) => !currentState.includes(subArn)
      );

      let subscriptionRemoved = false;

      if (unmatchedArns.length > 0) {
        await Promise.all(
          unmatchedArns.map(async (subArn) => {
            await awsReq.SNSUnsubscribe({ SubscriptionArn: subArn });
            console.log(
              `[snsx event] obsolete subscription '${subArn}' removed`
            );
            subscriptionRemoved = true;
          })
        );
      }

      if (remoteState.length === 0) {
        stateAction = "new";
      } else if (
        remoteState.length === subArns.length &&
        !subscriptionRemoved
      ) {
        stateAction = "sync";
      } else if (remoteState.length !== subArns.length || subscriptionRemoved) {
        stateAction = "update";
      }
    } catch (error) {
      if (error.code !== "AWS_S3_GET_OBJECT_NO_SUCH_KEY") {
        logger.error(`Error checking snsx state file: ${error}`);
        process.exit(1);
      }
    }

    if (stateAction === "new" || stateAction === "update") {
      try {
        await awsReq.S3PutObject(bucketName, key, currentState);
        if (stateAction === "new")
          console.log(
            `[snsx event] new state file created using deployment state`
          );
        else
          console.log(
            `[snsx event] current deployment state updated to state file`
          );
      } catch (error) {
        logger.error(`Error setting new state to snsx state file: ${error}`);
        process.exit(1);
      }
    } else
      console.log(
        `[snsx event] state file is in-sync with current deployment state`
      );
  };
}

module.exports = DeployFunc;
