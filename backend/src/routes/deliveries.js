import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/verifyJwt.js';
import { notifyBuyer } from '../services/events.js';

const router = Router();

router.get('/mine', authenticate, requireRole('delivery','admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.*, o.total_cents, o.order_status
       FROM deliveries d JOIN orders o ON o.id=d.order_id
       WHERE ($1='admin' OR d.partner_id=$2)
       ORDER BY d.updated_at DESC LIMIT 100`,
      [req.user.role, req.user.id]
    );
    res.json({ deliveries: result.rows });
  } catch (e) { next(e); }
});

router.patch('/:id/status', authenticate, requireRole('delivery','admin'), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(['ACCEPTED','PICKED_UP','DELIVERED']) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid delivery status' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM deliveries WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!found.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Delivery not found' });
      }
      const delivery = found.rows[0];
      if (req.user.role !== 'admin' && delivery.partner_id !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'This delivery is not assigned to you' });
      }
      const allowed = {
        ASSIGNED: ['ACCEPTED'],
        ACCEPTED: ['PICKED_UP'],
        PICKED_UP: ['DELIVERED']
      };
      if (!allowed[delivery.delivery_status]?.includes(parsed.data.status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Cannot change ${delivery.delivery_status} to ${parsed.data.status}` });
      }
      const updated = await client.query(
        `UPDATE deliveries SET delivery_status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [parsed.data.status, req.params.id]
      );
      const orderStatus = parsed.data.status === 'ACCEPTED' ? 'ASSIGNED'
        : parsed.data.status === 'PICKED_UP' ? 'PICKED_UP' : 'DELIVERED';
      await client.query('UPDATE orders SET order_status=$1 WHERE id=$2', [orderStatus, delivery.order_id]);
      await client.query('COMMIT');
      if (orderStatus !== 'ASSIGNED') await notifyBuyer(delivery.order_id, orderStatus === 'DELIVERED' ? 'DELIVERED' : 'PICKED_UP');
      res.json({ delivery: updated.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  } catch (e) { next(e); }
});

export default router;
