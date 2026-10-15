#!/usr/bin/env bash
# Packages the Lambda functions and creates/updates the ReShare CloudFormation stack.
# Run from the repository root after build-and-push.sh.
set -euo pipefail

: "${AWS_REGION:=ap-south-1}"
: "${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
: "${SES_FROM_ADDRESS:?Set SES_FROM_ADDRESS (an email you can open, SES will send it a verification link)}"
: "${STACK_NAME:=reshare}"
: "${IMAGE_TAG:=latest}"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-reshare-artifacts-$AWS_ACCOUNT_ID-$AWS_REGION}"
IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPOSITORY:-reshare-api}:$IMAGE_TAG"

aws s3api head-bucket --bucket "$ARTIFACT_BUCKET" 2>/dev/null || \
  aws s3 mb "s3://$ARTIFACT_BUCKET" --region "$AWS_REGION"

# Lambda bundles: production dependencies, plus the RDS CA so TLS to the database verifies.
for dir in delivery-assignment order-notifier; do
  (cd "backend/lambda/$dir" && npm install --omit=dev)
done
curl -sSfo backend/lambda/delivery-assignment/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

aws cloudformation package --region "$AWS_REGION" \
  --template-file infra/cloudformation.yaml \
  --s3-bucket "$ARTIFACT_BUCKET" \
  --output-template-file infra/packaged.yaml

aws cloudformation deploy --region "$AWS_REGION" \
  --template-file infra/packaged.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides ApiImageUri="$IMAGE_URI" SesFromAddress="$SES_FROM_ADDRESS" AlarmEmail="${ALARM_EMAIL:-$SES_FROM_ADDRESS}"

aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' --output table
