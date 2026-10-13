import pg from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const { Pool } = pg;
const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-south-1' });
let poolPromise;

async function getPool() {
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    let connectionString = process.env.DATABASE_URL;
    if (process.env.DB_SECRET_ARN) {
      const result = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }));
      const secret = JSON.parse(result.SecretString || '{}');
      connectionString = secret.connectionString ||
        `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${secret.host}:${secret.port || 5432}/${secret.dbname}`;
    }
    if (!connectionString) throw new Error('DATABASE_URL or DB_SECRET_ARN is required');
    return new Pool({
      connectionString,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
      max: 2,
      connectionTimeoutMillis: 5000
    });
  })();
  return poolPromise;
}

async function assignOrder(orderId) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT d.*, o.order_status FROM deliveries d JOIN orders o ON o.id=d.order_id
       WHERE d.order_id=$1 FOR UPDATE OF d`, [orderId]
    );
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      console.warn(`No delivery record for order ${orderId}`);
      return;
    }
    const delivery = found.rows[0];
    if (delivery.partner_id || delivery.delivery_status !== 'PENDING_ASSIGNMENT') {
      await client.query('COMMIT');
      return; // idempotent retry
    }
    const partner = await client.query(
      `SELECT u.id
       FROM users u
       WHERE u.role='delivery' AND u.status='ACTIVE'
         AND u.availability_status='AVAILABLE'
         AND (u.service_area IS NULL OR LOWER(u.service_area)=LOWER($1))
         AND NOT EXISTS (
           SELECT 1 FROM deliveries active
           WHERE active.partner_id=u.id
             AND active.delivery_status IN ('ASSIGNED','ACCEPTED','PICKED_UP')
         )
       ORDER BY u.created_at ASC
       FOR UPDATE OF u SKIP LOCKED
       LIMIT 1`,
      [delivery.pickup_area]
    );
    if (!partner.rowCount) {
      await client.query('COMMIT');
      console.log(`No available partner for order ${orderId}; left pending for admin`);
      return;
    }
    const partnerId = partner.rows[0].id;
    await client.query(
      `UPDATE deliveries SET partner_id=$1, delivery_status='ASSIGNED',
       assigned_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [partnerId, delivery.id]
    );
    await client.query(`UPDATE orders SET order_status='ASSIGNED' WHERE id=$1`, [orderId]);
    await client.query(
      `INSERT INTO audit_logs(action,entity_type,entity_id,details)
       VALUES('DELIVERY_ASSIGNED','delivery',$1,$2::jsonb)`,
      [delivery.id, JSON.stringify({ order_id: orderId, partner_id: partnerId })]
    );
    await client.query('COMMIT');
    console.log(`Assigned order ${orderId} to partner ${partnerId}`);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export const handler = async (event) => {
  for (const record of event.Records || []) {
    const message = JSON.parse(record.body);
    if (!message.orderId) throw new Error('SQS message missing orderId');
    await assignOrder(message.orderId);
  }
  return { ok: true };
};
