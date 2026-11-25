# NHL API server using Node.js and AWS Lambda

[![Test and deploy](https://github.com/andrewmacheret/nhl-server-lambda/actions/workflows/deploy.yml/badge.svg)](https://github.com/andrewmacheret/nhl-server-lambda/actions/workflows/deploy.yml) [![Canary](https://github.com/andrewmacheret/nhl-server-lambda/actions/workflows/canary.yml/badge.svg)](https://github.com/andrewmacheret/nhl-server-lambda/actions/workflows/canary.yml) [![License](https://img.shields.io/badge/license-MIT-lightgray.svg)](https://github.com/andrewmacheret/nhl-server-lambda/blob/master/LICENSE.md)

Back-end server for [andrewmacheret/nhl-client](https://github.com/andrewmacheret/nhl-client). Schedules come from the NHL API at `api-web.nhle.com`.

See [andrewmacheret/nhl-server](https://github.com/andrewmacheret/nhl-server) for the previous version that runs on Docker.

## API

- `GET /games?team=sharks&date=2026-11-21` returns that day's games for the team (with scores once they start), the team's record, its next game, and a list of all teams. `team` can be a name, city or abbreviation, like `maple leafs`, `toronto` or `tor`. `date` defaults to today in Pacific time.
- `GET /calendar?team=sharks` returns an iCalendar feed of the team's games from last season and this season. Subscribe to it with `webcal://nhl.andrewmacheret.com/calendar?team=sharks`.

Once a day, the Canary workflow (`.github/workflows/canary.yml`) checks that the NHL API's standings and schedule still answer. It's started by [andrewmacheret/canary](https://github.com/andrewmacheret/canary).

In API Gateway, `/games` uses a mapping template that turns the query string into the Lambda event. `/calendar` and the canary's health check use a Lambda proxy integration instead, so the Lambda can return its own content type and status code.

## Development

Run tests with `cd src/lambda && npm test` (needs Node.js 24). They call the real NHL API.

## Deploy

Pushes to `master` run the tests and deploy to the `NHLServer` AWS Lambda function through GitHub Actions (see `.github/workflows/deploy.yml`). To redeploy without a code change, use "Run workflow" on the Actions tab.

The workflow signs in to AWS with GitHub OIDC using the IAM role in the `AWS_ROLE_ARN` repo variable. The Lambda sits behind AWS API Gateway at `nhl.andrewmacheret.com`.
