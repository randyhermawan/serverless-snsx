class AwsReq {
  constructor(serverless, options, logger) {
    this.provider = serverless.getProvider("aws");
    this.options = options;
    this.logger = logger;
  }

  S3CheckBucket = (bucketName) => {
    const _self = this;

    return _self.provider.request(
      "S3",
      "getBucketPolicyStatus",
      { Bucket: bucketName },
      _self.options.stage,
      _self.options.region
    );
  };

  S3GetObject = (bucketName, key) => {
    const _self = this;

    return _self.provider.request(
      "S3",
      "getObject",
      { Bucket: bucketName, Key: key },
      _self.options.stage,
      _self.options.region
    );
  };

  S3PutObject = (bucketName, key, body) => {
    const _self = this;

    return _self.provider.request(
      "S3",
      "putObject",
      { Bucket: bucketName, Key: key, Body: body },
      _self.options.stage,
      _self.options.region
    );
  };

  S3DeleteObject = (bucketName, key) => {
    const _self = this;

    return _self.provider.request(
      "S3",
      "deleteObject",
      { Bucket: bucketName, Key: key },
      _self.options.stage,
      _self.options.region
    );
  };

  LambdaGetFunction = (fnName) => {
    const _self = this;

    return _self.provider.request(
      "Lambda",
      "getFunction",
      { FunctionName: fnName },
      _self.options.stage,
      _self.options.region
    );
  };

  LambdaGetPolicy = (fnName) => {
    const _self = this;

    return _self.provider.request(
      "Lambda",
      "getPolicy",
      { FunctionName: fnName },
      _self.options.stage,
      _self.options.region
    );
  };

  LambdaSetSNSTrigger = (actData) => {
    const _self = this;

    const topicArnSplits = actData.TopicArn.split(":");
    const topicName = topicArnSplits[topicArnSplits.length - 1];

    const funcArnSplits = actData.FunctionArn.split("-");
    const xtrFnName = funcArnSplits[funcArnSplits.length - 1];
    const funcName = xtrFnName.charAt(0).toUpperCase() + xtrFnName.slice(1);

    const params = {
      FunctionName: actData.FunctionArn,
      StatementId: `${funcName}-trigger-sns-${topicName}`,
      Action: "lambda:InvokeFunction",
      Principal: "sns.amazonaws.com",
      SourceArn: actData.TopicArn,
    };

    return _self.provider
      .request(
        "Lambda",
        "addPermission",
        params,
        _self.options.stage,
        _self.options.region
      )
      .catch((err) => {
        _self.logger.error(
          `Error while running 'addPermission' for function '${actData.FunctionArn}': ${err}`
        );
        process.exit(1);
      });
  };

  SNSListSubscription = (topicArn) => {
    const _self = this;

    return _self.provider
      .request(
        "SNS",
        "listSubscriptionsByTopic",
        { TopicArn: topicArn },
        _self.options.stage,
        _self.options.region
      )
      .catch((err) => {
        _self.logger.error(
          `Error while running 'listSubscriptionsByTopic' for '${topicArn}': ${err}`
        );
        process.exit(1);
      });
  };

  SNSGetSubscription = (subArn) => {
    const _self = this;

    return _self.provider
      .request(
        "SNS",
        "getSubscriptionAttributes",
        { SubscriptionArn: subArn },
        _self.options.stage,
        _self.options.region
      )
      .catch((err) => {
        _self.logger.error(
          `Error while running 'getSubscriptionAttributes' for '${subArn}': ${err}`
        );
        process.exit(1);
      });
  };

  SNSSubscribe = (actData) => {
    const _self = this;

    const params = {
      TopicArn: actData.TopicArn,
      Protocol: "lambda",
      Endpoint: actData.FunctionArn,
    };

    if (actData.FilterPolicy)
      params.Attributes = {
        FilterPolicy: actData.FilterPolicy,
        FilterPolicyScope: "MessageAttributes",
      };

    return _self.provider
      .request(
        "SNS",
        "subscribe",
        params,
        _self.options.stage,
        _self.options.region
      )
      .catch((err) => {
        _self.logger.error(
          `Error while running 'subscribe' to topic '${actData.TopicArn}' for function '${actData.FunctionArn}': ${err}`
        );
        process.exit(1);
      });
  };

  SNSUnsubscribe = (actData) => {
    const _self = this;

    return _self.provider
      .request(
        "SNS",
        "unsubscribe",
        { SubscriptionArn: actData.SubscriptionArn },
        _self.options.stage,
        _self.options.region
      )
      .catch((err) => {
        _self.logger.error(
          `Error while running 'unsubscribe' to topic '${actData.TopicArn}' for function '${actData.FunctionArn}': ${err}`
        );
        process.exit(1);
      });
  };

  SNSSetFilter = (actData) => {
    const _self = this;

    const params = {
      SubscriptionArn: actData.SubscriptionArn,
      AttributeName: "FilterPolicy",
      AttributeValue: actData.FilterPolicy,
    };

    return _self.provider
      .request(
        "SNS",
        "setSubscriptionAttributes",
        params,
        _self.options.stage,
        _self.options.region
      )
      .catch((err) => {
        _self.logger.error(
          `Error while running 'setSubscriptionAttributes' for subscription '${actData.SubscriptionArn}': ${err}`
        );
        process.exit(1);
      });
  };
}

module.exports = AwsReq;
