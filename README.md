# ReShare

ReShare is a cloud-ready surplus and near-expiry food marketplace starter project. It includes a React/Vite frontend, Express API, PostgreSQL schema, S3 presigned uploads, Cognito JWT verification, SQS delivery queue, Lambda delivery assignment worker, Docker configuration, and AWS deployment notes.

## Architecture

- Frontend: React + Vite, hosted in private S3 behind CloudFront.
- API: Node.js + Express in ECS Fargate, behind an Application Load Balancer.
- Identity: database-backed email/password accounts using scrypt password hashes and expiring JWTs in this starter flow; Cognito JWT verification remains available as a separate integration path.
- Data: Amazon RDS for PostgreSQL.
- Images: private S3 bucket, uploaded with short-lived presigned URLs.
- Delivery assignment: SQS queue + Lambda worker.
- Observability: CloudWatch logs and metrics.
- Secrets: AWS Secrets Manager, injected into ECS/Lambda configuration.

This is an educational MVP scaffold, not a production-ready food commerce/payment platform. It does not process real payments. Checkout uses a clearly labelled `DEMO` payment mode. Do not accept real orders until you have implemented a payment provider, verified webhooks, cancellation/refund handling, food-safety review, privacy controls, and the relevant legal/licensing checks.

## Prerequisites

- Node.js 20+
- npm
- Docker
- AWS account and AWS CLI configured for a non-root IAM identity
- PostgreSQL locally for development, or an RDS PostgreSQL instance for cloud deployment

## Repository layout

- `frontend/`: React UI
- `backend/`: Express API and SQL migrations
- `backend/lambda/delivery-assignment/`: SQS-triggered Lambda worker
- `infra/`: sample ECS task definition, IAM policies and deployment scripts

## 1. Configure the backend

```bash
cd backend
cp .env.example .env
npm install
```

Set the values in `.env`. For local development, `AUTH_MODE=local` enables database-backed email/password sign-in. Passwords are stored as scrypt hashes and the API issues expiring signed JWTs. Use a long random `JWT_SECRET`; the included Docker Compose value is for local development only. The backend retains a Cognito verification mode, but the included login/register UI currently targets local database-backed auth.

Create a local PostgreSQL database, then run the schema:

```bash
psql "$DATABASE_URL" -f db/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f db/seed-demo.sql  # local presentation data only
npm run dev
```

The API runs on `http://localhost:3000`. Health endpoint: `GET /api/health`. The SQL schema includes a migration-safe `password_hash` column.

## 2. Configure the frontend

```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
```

Set `VITE_API_BASE_URL=http://localhost:3000`. Keep `VITE_AUTH_MODE=local` for this email/password starter flow. The frontend stores a short-lived signed bearer token after sign-in and sends it to the API; no browser role selector or user-ID header is used.

Sign in or register from the ReShare login screen. Public sign-up accepts only `buyer` and `seller`; administrator access is via the separate Admin sign-in page. The seeded delivery-partner account can still sign in through the normal sign-in form, but delivery is not offered as a public registration role. Accounts and passwords are stored in PostgreSQL, with passwords hashed using scrypt. Seeded presentation accounts are listed below.

## Seeded presentation accounts

These accounts are inserted by `backend/db/seed-demo.sql` for local presentations. Do not use these predictable passwords in a public deployment.

- Buyer: `buyer@reshare.demo` / `BuyerDemo@2026!`
- Seller: `seller@reshare.demo` / `SellerDemo@2026!`
- Admin: `admin@reshare.demo` / `ReShareAdmin@2026!`
- Optional delivery dashboard demo: `delivery@reshare.demo` / `DeliveryDemo@2026!`

The admin account is pre-stored in the database with a scrypt password hash. Admin sign-in shows only the admin panel. Admin signup is not available from the public registration form.

The seed also provides sample food listings, two previous buyer orders, related order items and delivery records. Seller views only that seller account's own listings and order items; buyers see only their own orders.

## 3. Local Docker Compose

From the repository root:

```bash
docker compose up --build
```

The frontend is available at `http://localhost:5173`, API at `http://localhost:3000`. Compose starts PostgreSQL, applies the schema and inserts seeded presentation data on first database initialization. If you already started an older version and the database volume exists, run `docker compose down -v` and then `docker compose up --build` to recreate it. **This deletes the local PostgreSQL volume and its data**, so back up anything you need first.

## 4. Core API routes

- `GET /api/health`
- `GET /api/diagnostics/instance` returns the serving task hostname, useful for demonstrating ALB routing. Do not expose this publicly in production.
- `GET /api/listings?search=&category=&area=`
- `GET /api/listings/:id`
- `GET /api/listings/mine` (seller/admin)
- `POST /api/listings` (seller/admin)
- `PATCH /api/listings/:id` (owner/admin)
- `DELETE /api/listings/:id` (owner/admin; soft deactivation)
- `GET /api/products/barcode/:code` and `POST /api/products/identify` (seller/admin; fill a listing from a barcode or a JPEG/PNG photo)
- `POST /api/uploads/presign` (seller/admin; AWS S3 mode only)
- `POST /api/orders` (buyer)
- `GET /api/orders/mine` (current buyer)
- `GET /api/orders/sales` (current seller/admin)
- `POST /api/auth/register` (buyer/seller only)
- `POST /api/auth/login` (buyer/seller portal or separate admin portal)
- `GET /api/auth/me` (current session)
- `GET /api/deliveries/mine` (delivery/admin)
- `PATCH /api/deliveries/:id/status` (assigned delivery partner/admin)
- `GET /api/orders/sales/stats` (seller; daily revenue and top products for charts)
- `GET /api/admin/summary` (admin)
- `GET /api/admin/stats` (admin; orders per day and top sellers for charts)
- `GET /api/admin/delivery-partners` (admin)
- `POST /api/admin/deliveries/:id/assign` (admin; manually assign a pending delivery)

In local development, image URLs can be supplied as regular URLs. In AWS, use the presigned-upload route and store the returned S3 object key in the listing.

## 5. Order flow

1. Buyer posts listing IDs and quantities to `POST /api/orders`.
2. The API starts a PostgreSQL transaction, atomically reduces inventory, creates order rows, and commits.
3. If `SQS_DELIVERY_QUEUE_URL` is configured, the API sends a delivery-assignment job to SQS after commit.
4. Lambda selects an available delivery partner serving the pickup area and records the assignment.
5. If no partner is available, the delivery remains `PENDING_ASSIGNMENT` for an admin to resolve.

Important MVP limitation: publishing to SQS happens after the database transaction commits. A process crash between commit and queue publish can leave an order awaiting assignment. For production, implement a transactional outbox table and a publisher/worker to guarantee eventual delivery-event publication.

## 6. AWS deployment

`infra/cloudformation.yaml` creates the whole stack (VPC, RDS, ECS Fargate behind an ALB, S3 + CloudFront, SQS + Lambda, SNS + SES). Four commands deploy it; see [infra/README.md](infra/README.md) for the diagram, prerequisites, costs and teardown.

```bash
bash infra/scripts/build-and-push.sh
bash infra/scripts/deploy-stack.sh
SEED_DEMO=true bash infra/scripts/run-migrations.sh
bash infra/scripts/deploy-frontend.sh
```

## Features added for the AWS demo

- Listing cards show a discount badge, an expiry countdown (red under 6 hours, amber under 24) and an "Only N left" label. Cards without a working photo get a category icon and gradient.
- Sellers can fill in a listing two ways: scan or type a barcode (Open Food Facts lookup), or add a photo and let Amazon Rekognition identify the food. Both fill in the name, category and description; price, quantity and expiry date always stay manual. Photo recognition needs AWS: the ECS task role is allowed `rekognition:DetectLabels` in the CloudFormation stack. To try it locally, export `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (an IAM user with only `rekognition:DetectLabels`) before `docker compose up`; without them the form says recognition is unavailable and the seller fills the fields by hand.
- Sellers upload a photo with preview. It goes straight to S3 through a presigned URL (CloudFront serves it). Locally S3 is not configured, so paste an image URL instead.
- Buyers get emails (SNS -> Lambda -> SES) when their delivery is assigned, picked up and delivered. This is skipped when `SNS_ORDER_EVENTS_TOPIC_ARN` is unset, as in local development.
- Admins see orders-per-day and top-seller charts and can assign pending deliveries to a partner by hand; sellers see revenue-per-day and top-product charts.

## 7. Load-balancing demo

Deploy at least two ECS tasks behind the ALB. Repeatedly call `/api/diagnostics/instance` and observe `instance` values. Check that the ALB target group reports both targets healthy. Use CloudWatch to show request count, target response time, ECS CPU and task count. ALB distribution is not guaranteed to be exactly 50/50.

## Security controls in the code

- Sign-in: 5 wrong passwords for one email blocks that email for 15 minutes (counted in `audit_logs`, so it holds across all API tasks). Each IP is also limited to 10 failed sign-ins per 15 minutes. Sign-ins and failures are logged.
- Passwords: at least 10 characters, not in the 10,000 most common passwords (also checked without trailing digits and symbols), no single repeated character, must not contain the email name.
- Rate limits (`backend/src/middleware/rateLimits.js`): 600 requests per 15 minutes per IP overall, 5 sign-ups per hour, 20 orders and 30 barcode lookups per 15 minutes per user. The counters are per API task; use an AWS WAF rate rule or a shared store for exact limits.
- Uploaded photos: when a listing uses an uploaded image, the API checks the stored file's first bytes (JPEG, PNG or WebP only), its size and that the key sits under the seller's own folder. Bad files are deleted.
- Behind CloudFront and the load balancer, set `TRUST_PROXY_HOPS=2` so limits use the real client IP (the CloudFormation stack does this).

## Security checklist

- Set `AUTH_MODE=local` in deployments using the included email/password frontend and inject a unique high-entropy `JWT_SECRET` from Secrets Manager. The predictable demo users should not be seeded into a public deployment.
- Never commit `.env`, AWS credentials, database passwords or secrets.
- Keep RDS in private subnets and disable public accessibility.
- Use TLS for frontend and API (CloudFront provides HTTPS in the included stack).
- Use parameterized SQL queries.
- Verify ownership and role on every write endpoint.
- Validate uploads, expiry timestamps and requested quantities.
- Do not treat a browser redirect as proof of payment.
- Add a real payment provider and signed webhook before accepting money.
- Set S3 lifecycle rules, backups, alarms and least-privilege IAM policies.
- Check applicable food safety and licensing requirements before public launch.


## Authentication implementation notes

The local sign-in flow uses `POST /api/auth/register`, `POST /api/auth/login`, and `GET /api/auth/me`. Registration is limited to buyer/seller roles. Login tokens expire after 12 hours. The backend reads the role from the database on each authenticated API call, rather than trusting the browser role. Do not expose the local demo seed credentials on a public deployment. For Cognito production authentication, the frontend sign-up/sign-in flow must be configured against your User Pool and its profiles provisioned in the `users` table.
