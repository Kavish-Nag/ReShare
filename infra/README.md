# Infrastructure notes

These are starter fragments, not a complete CloudFormation deployment. Replace every `REPLACE_WITH...` placeholder before use. Do not commit real ARNs, secrets or credentials.

## Required IAM roles

- ECS task execution role: allows ECR image pull and CloudWatch Logs writes; it also needs `secretsmanager:GetSecretValue` for the database connection string and JWT signing secret referenced by the task definition.
- API task role: only `s3:PutObject` to the required image prefix and `sqs:SendMessage` to the delivery queue.
- Lambda execution role: CloudWatch Logs writes, SQS receive/delete/get-attributes for its source queue, and `secretsmanager:GetSecretValue` for the database secret. If Lambda is attached to a VPC, configure its networking and required endpoints/NAT.
- GitHub deployment role: use OIDC trust restricted to the intended repository and branch/environment.

## Networking

- ALB: public subnets in two Availability Zones.
- ECS tasks: private application subnets, security group accepts port 3000 only from ALB security group.
- RDS: private DB subnets, security group accepts port 5432 only from ECS/Lambda security groups.
- Lambda: private subnets with route/endpoint access to SQS and Secrets Manager as needed.
- Do not assign public IP addresses to ECS tasks and do not make RDS publicly accessible.

## ECS scaling

Create an ECS service with desired count 2, minimum 2 and maximum 4. Attach an ALB target group with `/api/health` health checks. Add a target-tracking policy on ECS service average CPU utilisation (for example, 55%). Scaling is not instantaneous and traffic is not guaranteed to split exactly evenly.

## Frontend bucket

Keep Block Public Access enabled. Use CloudFront Origin Access Control to allow only the CloudFront distribution to read the bucket. Configure the SPA fallback to `index.html`, but avoid rewriting API errors to the frontend index.

## Lambda packaging

From `backend/lambda/delivery-assignment`:

```bash
npm install
zip -r function.zip index.js package.json node_modules
```

Create a Node.js 20 Lambda function, set handler to `index.handler`, attach an SQS trigger, set `DB_SECRET_ARN`, `DB_SSL=true`, and `AWS_REGION`. The API task definition uses database-backed local auth and reads `JWT_SECRET` from Secrets Manager; use a unique high-entropy secret in any hosted environment. Set a visibility timeout on SQS longer than the Lambda timeout and configure a dead-letter queue. The Lambda needs network access to RDS if the database is private.
