# Serverless Param Validate

[![Serverless][ico-serverless]][link-serverless]
[![License][ico-license]][link-license]
[![NPM][ico-npm]][link-npm]

[ico-serverless]: http://public.serverless.com/badges/v3.svg
[ico-license]: https://img.shields.io/github/license/randyhermawan/serverless-go-build.svg
[ico-npm]: https://img.shields.io/npm/v/serverless-param-validate.svg
[link-serverless]: http://www.serverless.com/
[link-license]: ./LICENSE
[link-npm]: https://www.npmjs.com/package/serverless-param-validate

A simple serverless v1.x plugin to give you a checking & validation capabilities to prevent unwanted execution!

This plugin allows a conditional input that will go through `Eval` function and if the result doesn't satisfy the condition, it will exit your serverless deployment to avoid unwanted mistakes.

## Disclaimer

- I'm building this plugin following my needs so i won't update the plugin if i don't need to, but feel free to open a PR if you think this plugin need enhancement.
- I'm not an expert JS developer, so feel free to open PR if there are some codes that can be optimized.

## Installation

```
npm install --save-dev serverless-param-validate
```

## Usage

```
custom:
  validate:
    deploy:
      - cond: '"${self:provider.region}" == "ap-southeast-1"'
        error: Region must be ap-southeast-1
      - cond: '"${ssm:/architecture-type, ""}" == "verycool"'
        error: Infra type must be very cool. Please change it by fully delete and and redeploy the serverless again
    remove:
      - cond: '"${self:provider.region}" == "ap-southeast-1"'
        error: Region must be ap-southeast-1
```

Will give result such as:

```
❯ sls deploy --verbose --region=ap-southeast-1

Start param validation...
  CONDITION_0 - PASSED - "ap-southeast-1" == "ap-southeast-1"
✖ Validation error ("" == "verycool"): Infra type must be very cool. Please change it by fully delete and and redeploy the serverless again
```

---

**2023 Randy Hermawan, GK**
