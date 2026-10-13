# Infrastructure

`cloudformation.yaml` is the source of truth: one stack that creates everything below. The JSON files in `infra/policies/` and `infra/ecs-task-definition.json` are older reference fragments and are not used by the stack.

```
WAF (web ACL) ──> protects the ALB          CloudTrail ──> S3 (90 days of AWS account activity)
Browser ── HTTPS ──> CloudFront ─┬─ /            -> S3 (React build, private, OAC)
                                 ├─ /listings/*  -> S3 (listing photos, private, OAC)
                                 └─ /api/*       -> ALB -> ECS Fargate (2-4 tasks, private subnets)
                                                              ├─> RDS PostgreSQL (private)
                                                              ├─> SQS delivery queue (+DLQ) -> Lambda: delivery-assignment (VPC) -> RDS
                                                              └─> SNS order-events -> Lambda: order-notifier -> SES email
```

The site and API share one CloudFront domain, so there is no mixed content and no CORS to configure. Photos are uploaded by the browser straight to S3 with a 5-minute presigned URL.

## Deploy

Needs the AWS CLI configured for a non-root identity, Docker, Node 20+ and `bash` (Git Bash on Windows is fine).

```bash
export AWS_REGION=ap-south-1
export AWS_ACCOUNT_ID=123456789012
export SES_FROM_ADDRESS=you@example.com   # SES emails this address a verification link

bash infra/scripts/build-and-push.sh      # 1. build the API image, push to ECR
bash infra/scripts/deploy-stack.sh        # 2. create the stack (~15 min: RDS + CloudFront + NAT)
SEED_DEMO=true bash infra/scripts/run-migrations.sh   # 3. create tables (+ demo accounts, demos only)
bash infra/scripts/deploy-frontend.sh     # 4. build the UI, upload to S3, invalidate CloudFront
```

Step 2 prints `SiteUrl`. Open it and sign in with the demo accounts from the main README. After code changes: re-run step 1, then force a new deployment with
`aws ecs update-service --cluster <ClusterName> --service <service> --force-new-deployment`, and re-run step 4 for UI changes.

## Security and monitoring

- **AWS WAF** is attached to the load balancer with four rules: a per-IP rate limit (1,000 requests per 5 minutes), the AWS IP-reputation list, known-bad-inputs and the common attack rules. The 8 KB body-size rule is set to count only, because sellers POST photos up to 5 MB. If a legitimate request is ever blocked, open the WAF console, find it under Sampled requests and switch that rule to Count. The API's own rate limits and lockout still apply behind it.
- **AWS CloudTrail** records AWS account activity (who changed what) into a private encrypted S3 bucket for 90 days, with log-file validation. If your account already has a trail, this second copy of management events costs about US$2 per 100,000 events; delete the `Trail` resources if you do not want that.
- **CloudWatch** has a dashboard (`reshare-overview`, link in the stack outputs) and alarms for API CPU and memory, 5xx errors, slow responses, unhealthy targets, database CPU and free storage, Lambda errors, a non-empty delivery dead-letter queue, and a spike in WAF blocks. Alarms email `ALARM_EMAIL` (defaults to `SES_FROM_ADDRESS`); click the confirmation link AWS sends, or no email arrives.

## Email notifications (SES)

New SES accounts are in the sandbox: it can only send **to** verified addresses. For a demo, verify the buyer's email too (SES console > Identities > Create identity), or request production access. The sender address from step 2 must be verified by clicking the link SES emails you. Buyers are emailed when a delivery is assigned, picked up and delivered.

## Cost and teardown

Running costs come mostly from the NAT gateway, the ALB, two Fargate tasks and RDS (roughly US$3-4 per day, an estimate, plus about US$0.3 per day for WAF (a web ACL and four rules) and the CloudWatch dashboard for this layout). To stop paying:

```bash
aws s3 rm s3://<FrontendBucket> --recursive      # buckets must be empty before deletion
aws s3 rm s3://<ImagesBucket> --recursive
aws cloudformation delete-stack --stack-name reshare
```

RDS keeps a final snapshot (`DeletionPolicy: Snapshot`); delete it in the console if you do not want it.

## Operations notes

- Logs: CloudWatch groups `/ecs/reshare-api` and `/aws/lambda/<function>`. An alarm fires if the delivery DLQ has messages; admins can assign those deliveries by hand.
- Scaling: target tracking on 55% average CPU, min `DesiredCount`, max `MaxCount`.
- RDS needs TLS; the API image and the assignment Lambda bundle the RDS CA bundle and set `NODE_EXTRA_CA_CERTS`.
- Not included: custom domain and HTTPS certificate (CloudFront's default `*.cloudfront.net` certificate is used), RDS Multi-AZ, and a locked-down ALB (it accepts HTTP from anywhere; restrict it to the CloudFront origin-facing prefix list for production).
