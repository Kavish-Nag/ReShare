#!/usr/bin/env bash
# Builds the React app and publishes it to S3/CloudFront. The API shares the CloudFront domain, so no API URL is baked in.
set -euo pipefail

: "${AWS_REGION:=ap-south-1}"
: "${STACK_NAME:=reshare}"
out() { aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

BUCKET=$(out FrontendBucket)
DISTRIBUTION=$(out DistributionId)

(cd frontend && npm install && VITE_API_BASE_URL="" VITE_AUTH_MODE=local npm run build)

aws s3 sync frontend/dist/ "s3://$BUCKET/" --delete
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" >/dev/null
echo "Site: $(out SiteUrl)"
