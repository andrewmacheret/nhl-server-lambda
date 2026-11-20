# NHL API server using Node.js and AWS Lambda

[![License](https://img.shields.io/badge/license-MIT-lightgray.svg)](https://github.com/andrewmacheret/nhl-server-lambda/blob/master/LICENSE.md)

Back-end server for [andrewmacheret/nhl-client](https://github.com/andrewmacheret/nhl-client). Schedules come from the NHL API at `api-web.nhle.com`.

See [andrewmacheret/nhl-server](https://github.com/andrewmacheret/nhl-server) for the previous version that runs on Docker.

## Development

Run tests with `cd src/lambda && npm test` (needs Node.js 24). They call the real NHL API.

## Deploy

Pushes to `master` run the tests and deploy to the `NHLServer` AWS Lambda function through GitHub Actions (see `.github/workflows/deploy.yml`). To redeploy without a code change, use "Run workflow" on the Actions tab.

The workflow signs in to AWS with GitHub OIDC using the IAM role in the `AWS_ROLE_ARN` repo variable. The Lambda sits behind AWS API Gateway at `nhl.andrewmacheret.com`.
