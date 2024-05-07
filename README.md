# Serverless SNSX

Serverless Framework custom events similar to existing SNS events.
SNSX manages the SNS subscription in realtime (query -> compute -> action) and not from the CloudFormation stacks.

## Background

We create this plugin, to tackle problem happening in our Terraform infra when SNS topics is being updated, it somehow removes our SNS subscription (somehow ..).

Then the serverless stack need to be fully removed first before redeploying it to re-trigger the SNS subscription deployment.

Because CloudFormation doesn't manage the stacks after the deployment if there's no configuration changes (per our knowledge). You need to either remove it first, or made some changes to SNS subscription.

In our case, this is very useful when we are in position where removing the stacks isn't possible (VPC deployment, etc)

Hope you find this useful!

## Installing the Plugin

```
yarn add -D serverless-snsx
npm install serverless-snsx --save-dev

yarn remove serverless-snsx
npm uninstall serverless-snsx
```

## Serverless Configuration

There isn't any configuration needed at the top level, you just need to replace `sns` event with `snsx` event at function level.

The configuration should be defined either like the first or the second sample.

```
events:
  - snsx: {TopicArn}

events:
  - snsx:
      arn: {TopicArn}
      filterPolicy: {SubscriptionAttributes}
```

There should be warning related to 'Invalid configuration encountered' of 'unsupported function event' but in our deployment, it is safe to ignore.

---

**2024 Randy Hermawan**
