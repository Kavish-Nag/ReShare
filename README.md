# ReShare

### An AWS-Based Surplus Food Marketplace 

ReShare is a cloud-ready marketplace concept that connects people and businesses with surplus or near-expiry food to buyers looking for affordable options. Sellers can publish listings with quantities, prices, images, pickup details, and expiry information. Buyers can browse available listings and place demo orders, while the platform tracks inventory and supports delivery assignment.

This project demonstrates a full-stack application and cloud computing concepts such as containerised deployment, load balancing, managed database storage, object storage, authentication, and asynchronous processing.

> **Project status:** Educational prototype. Checkout currently uses demonstration orders and does not collect real payments. Complete payment-provider integration, production authentication configuration, food-safety validation, and applicable legal/licensing checks before any public launch.

## Features

### Buyer
- Register and sign in.
- Browse surplus and near-expiry food listings.
- Search by keyword, category, and pickup area.
- View prices, quantities, seller information, and expiry dates.
- Place demonstration orders.
- View personal order history and delivery status.

### Seller
- Register and sign in as a seller.
- Create, update, and deactivate food listings.
- Provide descriptions, quantities, prices, pickup details, and expiry timestamps.
- View personal listings and sales/order information.

### Administrator
- Dedicated administrator sign-in.
- View marketplace summary statistics.
- Review orders and deliveries awaiting assignment.
- Access administrative functions separately from buyer and seller views.

### Cloud and backend
- React frontend and Node.js/Express REST API.
- PostgreSQL schema for users, listings, orders, order items, deliveries, and audit logs.
- Transactional inventory updates to reduce overselling risk.
- Amazon S3 presigned-upload endpoint for listing images.
- Amazon SQS and AWS Lambda delivery-assignment workflow.
- Docker and Docker Compose for local development.
- AWS ECS/Fargate and Application Load Balancer deployment examples.
- Health and diagnostic endpoints for testing.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL / Amazon RDS for PostgreSQL |
| Authentication | Local demo authentication for development; Amazon Cognito integration path for cloud deployment |
| Image storage | Amazon S3 |
| Container registry | Amazon ECR |
| Backend hosting | Amazon ECS with AWS Fargate |
| Load balancing | Application Load Balancer |
| Background jobs | Amazon SQS and AWS Lambda |
| Monitoring | Amazon CloudWatch |
| Security/configuration | IAM, AWS Secrets Manager, security groups, HTTPS, optional AWS WAF |
| Local development | Docker, Docker Compose |

## Architecture

```text
Browser
  |
  +--> React frontend
  |      Local: http://localhost:5173
  |      AWS: private S3 bucket behind CloudFront
  |
  +--> Express REST API
         Local: http://localhost:3000
         AWS: Application Load Balancer
                 |
                 +--> ECS Fargate task A
                 +--> ECS Fargate task B
                          |
                          +--> Amazon RDS for PostgreSQL
                          +--> Amazon S3 (presigned image uploads)
                          +--> Amazon SQS delivery queue
                                      |
                                      v
                              AWS Lambda worker
                                      |
                                      v
                              RDS delivery records
```

For AWS deployment, keep RDS and ECS tasks in private subnets where appropriate. The public entry points should be the HTTPS frontend/CDN and the load balancer, not the database.

## Project Structure

```text
ReShare/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── styles.css
│   ├── package.json
│   ├── Dockerfile
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── services/
│   ├── db/
│   │   ├── migrations/
│   │   └── seed-demo.sql
│   ├── lambda/
│   │   └── delivery-assignment/
│   ├── tests/
│   ├── Dockerfile
│   └── package.json
├── infra/
│   ├── policies/
│   ├── scripts/
│   └── ecs-task-definition.json
├── docker-compose.yml
├── .gitignore
└── README.md
```

Some AWS resources must be created and configured in your own AWS account. Files in `infra/` are starter examples and contain placeholders that must be replaced before deployment.

## Run Locally

### Prerequisites

Install [Git](https://git-scm.com/), [Node.js 20+](https://nodejs.org/), [Docker Desktop](https://www.docker.com/products/docker-desktop/), and optionally [Visual Studio Code](https://code.visualstudio.com/).

### 1. Clone the repository

Replace `YOUR_GITHUB_USERNAME` with your GitHub username and ensure the repository name matches your GitHub repository.

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/ReShare.git
cd ReShare
```

Alternatively, download the repository ZIP from GitHub and extract it.

### 2. Start the application

Make sure Docker Desktop is running. From the project root, where `docker-compose.yml` is located, run:

```bash
docker compose up --build
```

The first run can take several minutes while Docker downloads images and installs dependencies. Keep the terminal open while the containers are running.

### 3. Open ReShare

- **Frontend:** http://localhost:5173
- **API health check:** http://localhost:3000/api/health
- **API diagnostic endpoint:** http://localhost:3000/api/diagnostics/instance

The health endpoint should return:

```json
{"status":"ok"}
```

To stop the services, press `Ctrl+C`, then run:

```bash
docker compose down
```

### Reset the local demo database

The seed SQL is applied when PostgreSQL initialises a new data volume. To recreate the local database from scratch:

```bash
docker compose down -v
docker compose up --build
```

**Warning:** `docker compose down -v` deletes the local PostgreSQL volume and its data. Do not use it if you need to preserve local database changes.

## Demo Accounts

The project includes local demonstration accounts for presentations. Use the dedicated administrator sign-in for the admin account.

| Role | Demo email | Demo password |
|---|---|---|
| Buyer | `buyer@reshare.demo` | `BuyerDemo@2026!` |
| Seller | `seller@reshare.demo` | `SellerDemo@2026!` |
| Administrator | `admin@reshare.demo` | `ReShareAdmin@2026!` |

These credentials are for local demonstrations only. They must not be used for a public deployment. Change or remove seeded credentials before sharing a live environment, and never commit real credentials or secrets to GitHub.

## API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/diagnostics/instance` | Returns backend task/container identifier for load-balancing demonstrations |
| `GET` | `/api/listings` | Browse and filter active listings |
| `GET` | `/api/listings/:id` | View a listing |
| `POST` | `/api/listings` | Create a listing |
| `PATCH` | `/api/listings/:id` | Update an owned listing |
| `DELETE` | `/api/listings/:id` | Deactivate an owned listing |
| `POST` | `/api/uploads/presign` | Generate a short-lived S3 upload URL |
| `POST` | `/api/orders` | Create a demonstration order |
| `GET` | `/api/orders/mine` | Retrieve the signed-in buyer's orders |
| `GET` | `/api/deliveries/mine` | Retrieve delivery assignments for the signed-in partner |
| `PATCH` | `/api/deliveries/:id/status` | Update an assigned delivery status |
| `GET` | `/api/admin/summary` | Retrieve administrator summary statistics |
| `GET` | `/api/admin/pending-deliveries` | List deliveries awaiting assignment |

Protected endpoints require authentication and role authorisation. Local demo authentication is a development convenience and must be disabled in a public environment.

## AWS Deployment Overview

The intended AWS deployment uses:

1. **Amazon S3 + CloudFront:** Host the built React frontend. Keep the S3 bucket private and use CloudFront Origin Access Control.
2. **Amazon Cognito:** Manage user sign-in for cloud deployment.
3. **Application Load Balancer:** Route HTTPS API traffic to healthy backend tasks.
4. **Amazon ECS + AWS Fargate:** Run multiple copies of the Node.js API container.
5. **Amazon ECR:** Store the backend Docker image.
6. **Amazon RDS for PostgreSQL:** Store users, listings, orders, inventory, and delivery records.
7. **Amazon S3:** Store listing photos using presigned uploads.
8. **Amazon SQS + AWS Lambda:** Process delivery-assignment jobs asynchronously.
9. **AWS Secrets Manager:** Store database credentials and server-side secrets.
10. **Amazon CloudWatch and CloudTrail:** Monitor application behaviour and audit supported AWS activity.
11. **AWS WAF (recommended):** Apply web request filtering and rate-based rules.
12. **AWS IAM and VPC security groups:** Apply least-privilege permissions and network isolation.

### Deployment checklist

- [ ] Create a VPC with public ALB subnets and private application/database subnets.
- [ ] Create RDS PostgreSQL with public access disabled.
- [ ] Create private S3 buckets for the frontend and listing images.
- [ ] Configure Cognito and set backend authentication to Cognito mode.
- [ ] Create the SQS queue and dead-letter queue.
- [ ] Build the backend Docker image and push it to ECR.
- [ ] Deploy an ECS Fargate service with at least two tasks.
- [ ] Configure an ALB target group using `/api/health` as the health check.
- [ ] Configure task and Lambda IAM roles with least privilege.
- [ ] Deploy the delivery-assignment Lambda and connect its SQS trigger.
- [ ] Build the frontend and upload the build output to S3.
- [ ] Configure CloudFront, HTTPS certificates, logging, alarms, and budget alerts.
- [ ] Run database migrations securely from an environment that can reach RDS.

See `infra/README.md` and `infra/scripts/` for starter deployment notes. Resource ARNs, account IDs, bucket names, subnet IDs, security groups, secret references, certificates, and image URIs must be configured for your AWS account.

## Load-Balancing Demonstration

1. Deploy at least two healthy ECS tasks behind the same Application Load Balancer target group.
2. Repeatedly call `/api/diagnostics/instance`.
3. Observe that responses can show different backend task identifiers.
4. Show the target group health in the AWS console.
5. Use CloudWatch to display request count, target response time, ECS CPU utilisation, and running task count.
6. Configure ECS Service Auto Scaling to show how task count can increase under load.

Load balancing and auto scaling are different: the ALB distributes requests among healthy targets, while ECS Service Auto Scaling adjusts the number of running tasks. An exact 50/50 request split is not guaranteed.

## Security Notes

- Never commit `.env` files, database passwords, AWS access keys, private keys, or API secrets.
- Use Cognito or another properly configured identity provider for public deployment.
- Disable local demo authentication outside local development.
- Keep RDS private and restrict database access using security groups.
- Use HTTPS for the frontend and API.
- Use parameterised SQL queries and validate all request data on the backend.
- Verify listing ownership and order access on every protected operation.
- Do not treat a frontend redirect as proof of payment.
- The current checkout is a demo flow, not a real payment integration.
- Restrict S3 uploads by file type, size, key prefix, and presigned URL expiry.
- Configure backups, logs, alarms, and billing alerts.
- Only list food that is safe to consume. Disclose expiry/best-before details, storage requirements, and allergens.
- Check current food-safety and licensing requirements before operating the marketplace publicly.

## Future Improvements

- Integrate a real payment provider with verified webhooks and refund handling.
- Add email/SMS notifications for order and delivery updates.
- Add location-aware partner matching and route estimates.
- Add automated expiry processing and seller reminders.
- Add a transactional outbox for reliable publication of delivery jobs.
- Add comprehensive integration tests and CI/CD deployment workflows.
- Add seller verification, moderation, reporting, and dispute handling.

---

## Project Purpose

ReShare demonstrates how a cloud-hosted marketplace can coordinate surplus-food listings, inventory, orders, and delivery workflows while using AWS services for scalable hosting, managed storage, access control, asynchronous processing, and observability.
