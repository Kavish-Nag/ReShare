import { Router } from 'express';
import { pool } from '../config/database.js';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/verifyJwt.js';
import { notifyBuyer } from '../services/events.js';

const router = Router();

router.get('/summary', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const [listings, orders, delivery, users] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='AVAILABLE')::int AS available,
        COUNT(*) FILTER (WHERE expiry_at <= NOW() AND status='AVAILABLE')::int AS expired_not_cleaned FROM listings`),
      pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(total_cents),0)::bigint AS demo_order_value_cents FROM orders`),
      pool.query(`SELECT COUNT(*)::int AS pending FROM deliveries WHERE delivery_status='PENDING_ASSIGNMENT'`),
      pool.query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`)
    ]);
    res.json({ listings: listings.rows[0], orders: orders.rows[0], delivery: delivery.rows[0], users: users.rows });
  } catch (e) { next(e); }
});

router.get('/pending-deliveries', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.*, o.total_cents FROM deliveries d JOIN orders o ON o.id=d.order_id
       WHERE d.delivery_status='PENDING_ASSIGNMENT' ORDER BY d.updated_at ASC LIMIT 100`
    );
    res.json({ deliveries: result.rows });
  } catch (e) { next(e); }
});

router.get('/delivery-partners', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.service_area, u.availability_status,
              (SELECT COUNT(*)::int FROM deliveries d WHERE d.partner_id=u.id
                 AND d.delivery_status IN ('ASSIGNED','ACCEPTED','PICKED_UP')) AS active_deliveries
       FROM users u WHERE u.role='delivery' AND u.status='ACTIVE' ORDER BY u.name`
    );
    res.json({ partners: result.rows });
  } catch (e) { next(e); }
});

router.post('/deliveries/:id/assign', authenticate, requireRole('admin'), async (req, res, next) => {
  const parsed = z.object({ partner_id: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success || !z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'A valid delivery and partner are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM deliveries WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Delivery not found' }); }
    const delivery = found.rows[0];
    if (delivery.delivery_status !== 'PENDING_ASSIGNMENT') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This delivery has already been assigned' });
    }
    const partner = await client.query(
      `SELECT id FROM users WHERE id=$1 AND role='delivery' AND status='ACTIVE'`, [parsed.data.partner_id]
    );
    if (!partner.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Choose an active delivery partner' }); }
    await client.query(
      `UPDATE deliveries SET partner_id=$1, delivery_status='ASSIGNED', assigned_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [parsed.data.partner_id, delivery.id]
    );
    await client.query(`UPDATE orders SET order_status='ASSIGNED' WHERE id=$1`, [delivery.order_id]);
    await client.query(
      `INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'DELIVERY_ASSIGNED_MANUAL','delivery',$2,$3::jsonb)`,
      [req.user.id, delivery.id, JSON.stringify({ order_id: delivery.order_id, partner_id: parsed.data.partner_id })]
    );
    await client.query('COMMIT');
    await notifyBuyer(delivery.order_id, 'DELIVERY_ASSIGNED');
    res.json({ message: 'Delivery assigned' });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    next(e);
  } finally { client.release(); }
});

router.get('/stats', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const [daily, sellers] = await Promise.all([
      pool.query(
        `SELECT to_char(d::date,'YYYY-MM-DD') AS day, COALESCE(x.orders,0)::int AS orders, COALESCE(x.revenue_cents,0)::bigint AS revenue_cents
         FROM generate_series(CURRENT_DATE-13, CURRENT_DATE, '1 day') d
         LEFT JOIN (SELECT created_at::date AS day, COUNT(*) AS orders, SUM(total_cents) AS revenue_cents FROM orders GROUP BY 1) x ON x.day=d::date
         ORDER BY d`
      ),
      pool.query(
        `SELECT u.name, SUM(oi.quantity * oi.unit_price_cents)::bigint AS revenue_cents, SUM(oi.quantity)::int AS units
         FROM order_items oi JOIN users u ON u.id=oi.seller_id
         GROUP BY u.id, u.name ORDER BY revenue_cents DESC LIMIT 5`
      )
    ]);
    res.json({ daily: daily.rows, top_sellers: sellers.rows });
  } catch (e) { next(e); }
});

export default router;
