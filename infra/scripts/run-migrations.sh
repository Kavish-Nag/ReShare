#!/usr/bin/env bash
# Runs the schema migration as a one-off ECS task, because RDS is private and cannot be reached from your laptop.
# SEED_DEMO=true also loads the demo accounts and listings (predictable passwords: demos only).
set -euo pipefail

: "${AWS_REGION:=ap-south-1}"
: "${STACK_NAME:=reshare}"
out() { aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

CLUSTER=$(out ClusterName)
CMD='["node","db/migrate.js"]'
[ "${SEED_DEMO:-false}" = "true" ] && CMD='["node","db/migrate.js","--seed"]'

TASK_ARN=$(aws ecs run-task --region "$AWS_REGION" --cluster "$CLUSTER" --launch-type FARGATE \
  --task-definition "$(out TaskDefinitionArn)" \
  --network-configuration "awsvpcConfiguration={subnets=[$(out PrivateSubnets)],securityGroups=[$(out ApiSecurityGroupId)],assignPublicIp=DISABLED}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"reshare-api\",\"command\":$CMD}]}" \
  --query 'tasks[0].taskArn' --output text)

echo "Migration task started: $TASK_ARN"
aws ecs wait tasks-stopped --region "$AWS_REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN"
EXIT=$(aws ecs describe-tasks --region "$AWS_REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)
echo "Migration exit code: $EXIT (output is in CloudWatch log group /ecs/reshare-api)"
[ "$EXIT" = "0" ]
