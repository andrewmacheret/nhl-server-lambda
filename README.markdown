# NHL API server using Node.js and AWS Lambda

[![License](https://img.shields.io/badge/license-MIT-lightgray.svg)](https://github.com/andrewmacheret/nhl-server-lambda/blob/master/LICENSE.md)

Back-end server for [andrewmacheret/nhl-client](https://github.com/andrewmacheret/nhl-client).

See [andrewmacheret/nhl-server](https://github.com/andrewmacheret/nhl-server) for the previous version that runs on Docker.

## Dependencies

Installation requires a UNIX environment with:

- Bash
- Node.js
- An Amazon Web Services account

## Setup and installation

Run aws-setup.sh to install AWS command line tools and create an AWS Lambda Function. (*It will run `aws configure`, so have an key id and access key ready*)

Run aws-update-lambda.sh after further changes to source code to update the AWS Lambda Functon with the new source code.

You may also want to:
1. Create an API gateway with AWS API Gateway, and connect it to the AWS Lambda Function
2. Create a new certificate with AWS Certificate Manager for use with AWS API Gateway (for HTTPS)
3. Create a new custom domain in AWS API Gateway (for HTTPS, and/or to put on your domain)
4. Create a CNAME record with your domain name provider (for HTTPS, and/or to put on your domain)
