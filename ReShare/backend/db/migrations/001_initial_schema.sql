CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('buyer','seller','delivery','admin')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  service_area TEXT,
  availability_status TEXT NOT NULL DEFAULT 'UNAVAILABLE'
    CHECK (availability_status IN ('AVAILABLE','UNAVAILABLE','BUSY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  image_key TEXT,
  image_url TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  original_price_cents INTEGER CHECK (original_price_cents IS NULL OR original_price_cents >= price_cents),
  quantity_available INTEGER NOT NULL CHECK (quantity_available >= 0),
  quantity_unit TEXT NOT NULL DEFAULT 'item',
  expiry_at TIMESTAMPTZ NOT NULL,
  prepared_at TIMESTAMPTZ,
  storage_conditions TEXT,
  allergens TEXT[] NOT NULL DEFAULT '{}',
  pickup_address TEXT NOT NULL,
  pickup_area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','SOLD_OUT','INACTIVE','EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listings_status_expiry_idx ON listings(status, expiry_at);
CREATE INDEX IF NOT EXISTS listings_area_idx ON listings(pickup_area);
CREATE INDEX IF NOT EXISTS listings_seller_idx ON listings(seller_id);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  payment_status TEXT NOT NULL DEFAULT 'DEMO_PENDING'
    CHECK (payment_status IN ('DEMO_PENDING','PENDING','PAID','FAILED','REFUNDED')),
  order_status TEXT NOT NULL DEFAULT 'CONFIRMED'
    CHECK (order_status IN ('CONFIRMED','PENDING_ASSIGNMENT','ASSIGNED','PICKED_UP','DELIVERED','CANCELLED')),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (buyer_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  title_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  partner_id UUID REFERENCES users(id),
  pickup_address TEXT NOT NULL,
  pickup_area TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING_ASSIGNMENT'
    CHECK (delivery_status IN ('PENDING_ASSIGNMENT','ASSIGNED','ACCEPTED','PICKED_UP','DELIVERED','CANCELLED')),
  assigned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deliveries_partner_status_idx ON deliveries(partner_id, delivery_status);
CREATE INDEX IF NOT EXISTS delivery_partners_area_idx ON users(service_area, availability_status)
  WHERE role = 'delivery';

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
