import { Router } from 'express';
import { pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/verifyJwt.js';

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

export default router;
