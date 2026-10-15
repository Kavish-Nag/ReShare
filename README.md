<div align="center">

# 🔄 ReShare

### _Rescue surplus food. Reduce waste. Rebuild community._

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![AWS](https://img.shields.io/badge/AWS-Cloud-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)](https://aws.amazon.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

---

**ReShare** is a cloud-ready marketplace that connects surplus and near-expiry food with conscious buyers — cutting waste, saving money, and strengthening local communities.

[Getting Started](#-getting-started) · [Architecture](#-architecture) · [API Reference](#-api-reference) · [Deployment](#-aws-deployment) · [Security](#-security)

</div>

---

## ✨ Highlights

| | Feature | Description |
|---|---|---|
| 🛒 | **Smart Marketplace** | Listings with discount badges, live expiry countdowns, and "only N left" urgency labels |
| 📷 | **AI-Powered Listing** | Snap a photo → Amazon Rekognition identifies the food and pre-fills listing details |
| 🔍 | **Barcode Lookup** | Scan or type a barcode — Open Food Facts fills name, category & description instantly |
| 🚚 | **Automated Delivery** | SQS + Lambda assigns the nearest available delivery partner in real-time |
| 📊 | **Analytics Dashboards** | Sellers see daily revenue & top products; admins see order trends & top sellers |
| 📧 | **Email Notifications** | Buyers are emailed (SNS → Lambda → SES) on delivery assigned, picked up & delivered |
| 🔐 | **Hardened Auth** | Scrypt password hashes, expiring JWTs, brute-force lockout, and rate limiting |
| ☁️ | **One-Command AWS Deploy** | Full CloudFormation stack — VPC, RDS, ECS Fargate, ALB, S3, CloudFront, SQS, Lambda |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         C L I E N T S                               │
│                                                                     │
│   React + Vite SPA ──── S3 (private) ──── CloudFront (HTTPS)       │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Application Load      │
                    │      Balancer (ALB)      │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────▼──────────────────┐
              │       ECS Fargate (Express API)      │
              │                                      │
              │  ┌────────┐  ┌─────────┐  ┌───────┐ │
              │  │ Routes │  │  Auth   │  │ Rate  │ │
              │  │        │  │  (JWT)  │  │ Limit │ │
              │  └───┬────┘  └────┬────┘  └───────┘ │
              └──────┼────────────┼──────────────────┘
                     │            │
        ┌────────────┼────────────┼─────────────┐
        │            │            │              │
   ┌────▼────┐  ┌────▼────┐  ┌───▼───┐  ┌──────▼──────┐
   │   RDS   │  │   S3    │  │  SQS  │  │ Rekognition │
   │ Postgres│  │ Images  │  │ Queue │  │   (AI ID)   │
   └─────────┘  └─────────┘  └───┬───┘  └─────────────┘
                                  │
                           ┌──────▼──────┐
                           │   Lambda    │
                           │  Delivery   │
                           │  Assigner   │
                           └──────┬──────┘
                                  │
                           ┌──────▼──────┐
                           │  SNS → SES  │
                           │   Emails    │
                           └─────────────┘
```

<details>
<summary><strong>Component breakdown</strong></summary>

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18 + Vite 6 | Single-page app with role-based dashboards |
| **API** | Node.js + Express 4 | RESTful backend in ECS Fargate behind ALB |
| **Identity** | Database-backed auth | Scrypt password hashes + expiring signed JWTs |
| **Database** | Amazon RDS PostgreSQL 17 | Listings, orders, users, deliveries, audit logs |
| **Media** | Private S3 + CloudFront | Presigned uploads; CDN-served images |
| **Delivery Queue** | SQS + Lambda | Automatic delivery partner assignment |
| **Notifications** | SNS → Lambda → SES | Buyer email updates on delivery status |
| **Observability** | CloudWatch | Logs, metrics, alarms |
| **Secrets** | AWS Secrets Manager | Injected into ECS & Lambda at runtime |

</details>

> [!IMPORTANT]
> **This is an educational MVP scaffold, not a production food commerce platform.** Checkout uses a clearly labelled `DEMO` payment mode. Before accepting real orders, implement: a payment provider with verified webhooks, cancellation/refund handling, food-safety review, privacy controls, and applicable legal/licensing checks.

---

## 📁 Repository Layout

```
ReShare/
├── frontend/              # React SPA (Vite)
│   ├── src/
│   │   ├── App.jsx        # Main application & routing
│   │   ├── api.js         # API client
│   │   ├── styles.css     # Global styles
│   │   └── main.jsx       # Entry point
│   ├── Dockerfile
│   └── vite.config.js
│
├── backend/               # Express API + SQL migrations
│   ├── src/
│   │   ├── app.js         # Express app setup
│   │   ├── server.js      # HTTP server entry
│   │   ├── routes/        # API route handlers
│   │   ├── middleware/     # Auth, rate limiting, validation
│   │   ├── services/      # Business logic
│   │   ├── config/        # Environment configuration
│   │   └── data/          # Static data (common passwords, etc.)
│   ├── db/                # Migrations & seed data
│   ├── lambda/            # SQS-triggered delivery worker
│   ├── tests/             # API tests
│   └── Dockerfile
│
├── infra/                 # AWS infrastructure
│   ├── cloudformation.yaml
│   ├── scripts/           # Build, deploy, migrate scripts
│   ├── policies/          # IAM policy documents
│   └── README.md          # Deployment diagram & guide
│
├── docker-compose.yml     # Local dev stack
└── AWS_DEPLOYMENT_GUIDE.md
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| **Node.js** | 20+ | Runtime for API and frontend build |
| **npm** | Latest | Package management |
| **Docker** | Latest | Local development stack |
| **PostgreSQL** | 17 | Database (or use Docker Compose) |
| **AWS CLI** | Latest | Cloud deployment (optional for local dev) |

---

### Option A — Docker Compose (Recommended)

The fastest way to get the full stack running locally:

```bash
# Clone and start everything
git clone https://github.com/Kavish-Nag/ReShare.git
cd ReShare
docker compose up --build
```

| Service | URL |
|---|---|
| 🖥 Frontend | http://localhost:5173 |
| ⚙️ API | http://localhost:3000 |
| 🏥 Health check | http://localhost:3000/api/health |

Compose starts PostgreSQL, applies the schema, and inserts demo seed data on first initialization.

> [!TIP]
> If you previously ran an older version, reset the database with:
> ```bash
> docker compose down -v && docker compose up --build
> ```
> ⚠️ This deletes the local PostgreSQL volume and all its data.

---

### Option B — Manual Setup

<details>
<summary><strong>1. Backend</strong></summary>

```bash
cd backend
cp .env.example .env
npm install
```

Edit `.env` — set `AUTH_MODE=local` for database-backed email/password auth. Generate a strong random `JWT_SECRET` (the Docker Compose value is for local dev only).

Create a PostgreSQL database, then run:

```bash
psql "$DATABASE_URL" -f db/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f db/seed-demo.sql   # demo data only
npm run dev
```

API starts on `http://localhost:3000`. Health: `GET /api/health`.

</details>

<details>
<summary><strong>2. Frontend</strong></summary>

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Set `VITE_API_BASE_URL=http://localhost:3000` and `VITE_AUTH_MODE=local` in `.env`.

The frontend stores a short-lived signed bearer token after sign-in. No browser role selector or user-ID header is used.

</details>

---

### 🧪 Demo Accounts

> [!WARNING]
> These accounts are for **local presentations only**. Never seed them into a public deployment.

| Role | Email | Password |
|---|---|---|
| 🛒 Buyer | `buyer@reshare.demo` | `BuyerDemo@2026!` |
| 🏪 Seller | `seller@reshare.demo` | `SellerDemo@2026!` |
| 🔧 Admin | `admin@reshare.demo` | `ReShareAdmin@2026!` |
| 🚚 Delivery | `delivery@reshare.demo` | `DeliveryDemo@2026!` |

- **Public sign-up** accepts only `buyer` and `seller` roles
- **Admin sign-in** has a separate page and shows only the admin panel
- **Delivery partner** can sign in normally but is not available as a public registration role
- The seed includes sample food listings, buyer orders, order items, and delivery records

---

## 📡 API Reference

<details>
<summary><strong>Authentication</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register (buyer/seller only) |
| `POST` | `/api/auth/login` | Public | Sign in (buyer/seller or admin portal) |
| `GET` | `/api/auth/me` | Authenticated | Current session info |

</details>

<details>
<summary><strong>Listings</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/listings?search=&category=&area=` | Public | Browse listings with filters |
| `GET` | `/api/listings/:id` | Public | Listing detail |
| `GET` | `/api/listings/mine` | Seller/Admin | My listings |
| `POST` | `/api/listings` | Seller/Admin | Create listing |
| `PATCH` | `/api/listings/:id` | Owner/Admin | Update listing |
| `DELETE` | `/api/listings/:id` | Owner/Admin | Soft-deactivate listing |

</details>

<details>
<summary><strong>Product Identification</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/products/barcode/:code` | Seller/Admin | Lookup by barcode (Open Food Facts) |
| `POST` | `/api/products/identify` | Seller/Admin | Photo → AI recognition (Rekognition) |

</details>

<details>
<summary><strong>Orders</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/orders` | Buyer | Place order |
| `GET` | `/api/orders/mine` | Buyer | My orders |
| `GET` | `/api/orders/sales` | Seller/Admin | My sales |
| `GET` | `/api/orders/sales/stats` | Seller | Revenue & top products (charts) |

</details>

<details>
<summary><strong>Deliveries</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/deliveries/mine` | Delivery/Admin | My deliveries |
| `PATCH` | `/api/deliveries/:id/status` | Delivery/Admin | Update delivery status |

</details>

<details>
<summary><strong>Admin</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/summary` | Admin | Platform summary |
| `GET` | `/api/admin/stats` | Admin | Orders/day & top sellers (charts) |
| `GET` | `/api/admin/delivery-partners` | Admin | List delivery partners |
| `POST` | `/api/admin/deliveries/:id/assign` | Admin | Manually assign delivery |

</details>

<details>
<summary><strong>Uploads & Diagnostics</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/uploads/presign` | Seller/Admin | Get S3 presigned upload URL |
| `GET` | `/api/health` | Public | Health check |
| `GET` | `/api/diagnostics/instance` | Public | Task hostname (ALB demo) |

> [!NOTE]
> In local development, image URLs can be supplied as regular URLs. In AWS, use the presigned-upload route and store the returned S3 key in the listing. The diagnostics endpoint should **not** be exposed publicly in production.

</details>

---

## 🛍 Order Flow

```
  Buyer                  API                    SQS              Lambda            SNS/SES
   │                      │                      │                  │                 │
   │  POST /api/orders    │                      │                  │                 │
   ├─────────────────────►│                      │                  │                 │
   │                      │  BEGIN transaction   │                  │                 │
   │                      │  ├─ reduce inventory │                  │                 │
   │                      │  ├─ create order     │                  │                 │
   │                      │  └─ COMMIT           │                  │                 │
   │                      │                      │                  │                 │
   │   201 Created        │  Send delivery job   │                  │                 │
   │◄─────────────────────├─────────────────────►│                  │                 │
   │                      │                      │  Trigger worker  │                 │
   │                      │                      ├─────────────────►│                 │
   │                      │                      │                  │  Assign partner │
   │                      │                      │                  ├──── UPDATE DB   │
   │                      │                      │                  │                 │
   │                      │                      │                  │  Notify buyer   │
   │   📧 Email           │                      │                  ├────────────────►│
   │◄─────────────────────┼──────────────────────┼──────────────────┼─────────────────┤
```

> [!NOTE]
> **MVP Limitation:** SQS publish happens _after_ the DB commit. A crash between commit and publish can leave an order awaiting assignment. For production, implement a transactional outbox table with a polling publisher.

---

## ☁️ AWS Deployment

The `infra/cloudformation.yaml` creates the complete stack: VPC, RDS, ECS Fargate + ALB, S3 + CloudFront, SQS + Lambda, SNS + SES.

**Four commands to deploy:**

```bash
# 1. Build & push Docker images to ECR
bash infra/scripts/build-and-push.sh

# 2. Deploy the CloudFormation stack
bash infra/scripts/deploy-stack.sh

# 3. Run migrations (optionally seed demo data)
SEED_DEMO=true bash infra/scripts/run-migrations.sh

# 4. Build & deploy the frontend to S3/CloudFront
bash infra/scripts/deploy-frontend.sh
```

📘 See [`infra/README.md`](infra/README.md) for the full deployment diagram, prerequisites, cost estimates, and teardown instructions.

### Load-Balancing Demo

Deploy ≥ 2 ECS tasks behind the ALB and repeatedly call `/api/diagnostics/instance` to observe different `instance` values. Verify both targets are healthy in the ALB target group. Use CloudWatch to monitor request count, target response time, ECS CPU, and task count.

---

## 🔐 Security

### Built-In Controls

| Protection | Implementation |
|---|---|
| **Brute-force lockout** | 5 wrong passwords → email blocked 15 min; 10 failed IPs → IP blocked 15 min |
| **Password policy** | ≥ 10 chars, not in top 10K common passwords, no repeated chars, no email substring |
| **Rate limiting** | 600 req/15 min/IP overall · 5 signups/hr · 20 orders/15 min · 30 barcode lookups/15 min |
| **Upload validation** | First-byte magic check (JPEG/PNG/WebP), size limit, seller-folder scoping; bad files deleted |
| **Proxy awareness** | `TRUST_PROXY_HOPS=2` for correct client IP behind CloudFront + ALB |
| **Audit logging** | Sign-in attempts (success + failure) logged in `audit_logs` table across all tasks |

### Deployment Security Checklist

- [ ] Set `AUTH_MODE=local` and inject a unique high-entropy `JWT_SECRET` from Secrets Manager
- [ ] **Never** seed demo accounts into a public deployment
- [ ] Never commit `.env`, AWS credentials, database passwords, or secrets
- [ ] Keep RDS in private subnets with public accessibility disabled
- [ ] Enable TLS everywhere (CloudFront provides HTTPS in the included stack)
- [ ] Use parameterized SQL queries (already implemented)
- [ ] Verify ownership and role on every write endpoint
- [ ] Validate uploads, expiry timestamps, and requested quantities
- [ ] Do not treat a browser redirect as proof of payment
- [ ] Add a real payment provider with signed webhooks before accepting money
- [ ] Configure S3 lifecycle rules, backups, alarms, and least-privilege IAM policies
- [ ] Check applicable food safety and licensing requirements before public launch

---

## 🔑 Auth Implementation Notes

| Detail | Value |
|---|---|
| **Endpoints** | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| **Registration roles** | `buyer`, `seller` only |
| **Token expiry** | 12 hours |
| **Role resolution** | Read from DB on every authenticated call (not trusted from browser) |
| **Cognito path** | Verification mode retained; configure frontend against your User Pool and provision profiles in the `users` table |

---

## 🧰 Tech Stack

<table>
<tr>
<td align="center" width="120"><strong>React</strong><br/>Frontend UI</td>
<td align="center" width="120"><strong>Vite</strong><br/>Build tool</td>
<td align="center" width="120"><strong>Express</strong><br/>REST API</td>
<td align="center" width="120"><strong>PostgreSQL</strong><br/>Database</td>
<td align="center" width="120"><strong>Docker</strong><br/>Containers</td>
</tr>
<tr>
<td align="center" width="120"><strong>ECS Fargate</strong><br/>Compute</td>
<td align="center" width="120"><strong>CloudFront</strong><br/>CDN</td>
<td align="center" width="120"><strong>S3</strong><br/>Storage</td>
<td align="center" width="120"><strong>SQS + Lambda</strong><br/>Delivery queue</td>
<td align="center" width="120"><strong>Rekognition</strong><br/>AI food ID</td>
</tr>
</table>

---

<div align="center">

**Built with ❤️ to fight food waste**

_Star ⭐ this repo if you believe surplus food deserves a second chance._

</div>
