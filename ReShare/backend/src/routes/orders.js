import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/verifyJwt.js';
import { enqueueDeliveryAssignment } from '../services/sqs.js';

const router = Router();
const orderSchema = z.object({
  items: z.array(z.object({
    listing_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(1000)
  })).min(1).max(30),
  delivery_address: z.string().trim().min(5).max(500),
  idempotency_key: z.string().min(8).max(100).optional()
});

router.post('/', authenticate, requireRole('buyer'), async (req, res, next) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid order', details: parsed.error.flatten() });

  const client = await pool.connect();
  let order;
  let deliveryPayload;
  try {
    const d = parsed.data;
    await client.query('BEGIN');

    if (d.idempotency_key) {
      const existing = await client.query(
        `SELECT * FROM orders WHERE buyer_id=$1 AND idempotency_key=$2`,
        [req.user.id, d.idempotency_key]
      );
      if (existing.rowCount) {
        await client.query('ROLLBACK');
        return res.status(200).json({ order: existing.rows[0], idempotent_replay: true });
      }
    }

    const listingIds = [...new Set(d.items.map(i => i.listing_id))];
    if (listingIds.length !== d.items.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Use one line per listing' });
    }

    const lines = [];
    let total = 0;
    let pickupAddress = '';
    let pickupArea = '';

    for (const item of d.items) {
      const updated = await client.query(
        `UPDATE listings
         SET quantity_available=quantity_available-$1,
             status=CASE WHEN quantity_available-$1=0 THEN 'SOLD_OUT' ELSE 'AVAILABLE' END,
             updated_at=NOW()
         WHERE id=$2 AND quantity_available >= $1 AND status='AVAILABLE' AND expiry_at > NOW()
         RETURNING id,seller_id,title,price_cents,quantity_available,pickup_address,pickup_area`,
        [item.quantity, item.listing_id]
      );
      if (!updated.rowCount) throw Object.assign(new Error('One or more items are unavailable or have insufficient stock'), { status: 409 });
      const listing = updated.rows[0];
      lines.push({ ...item, listing });
      total += listing.price_cents * item.quantity;
      if (!pickupAddress) {
        pickupAddress = listing.pickup_address;
        pickupArea = listing.pickup_area;
      }
    }

    const orderResult = await client.query(
      `INSERT INTO orders(buyer_id,total_cents,payment_status,order_status,idempotency_key)
       VALUES($1,$2,'DEMO_PENDING','PENDING_ASSIGNMENT',$3) RETURNING *`,
      [req.user.id, total, d.idempotency_key || null]
    );
    order = orderResult.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items(order_id,listing_id,seller_id,title_snapshot,quantity,unit_price_cents)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [order.id,line.listing.id,line.listing.seller_id,line.listing.title,line.quantity,line.listing.price_cents]
      );
    }

    await client.query(
      `INSERT INTO deliveries(order_id,pickup_address,pickup_area,delivery_address,delivery_status)
       VALUES($1,$2,$3,$4,'PENDING_ASSIGNMENT')`,
      [order.id,pickupAddress,pickupArea,d.delivery_address]
    );
    await client.query(
      `INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details)
       VALUES($1,'ORDER_CREATED','order',$2,$3::jsonb)`,
      [req.user.id,order.id,JSON.stringify({ total_cents: total, items: lines.length })]
    );
    await client.query('COMMIT');

    deliveryPayload = { orderId: order.id };
    let queuePublished = false;
    try {
      queuePublished = await enqueueDeliveryAssignment(deliveryPayload);
    } catch (queueError) {
      console.error('Could not enqueue delivery assignment:', queueError.message);
    }
    res.status(201).json({
      order,
      message: 'Demo order created. No real payment was collected.',
      delivery_assignment_queued: queuePublished
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    next(e);
  } finally {
    client.release();
  }
});

router.get('/sales', authenticate, requireRole('seller', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.created_at, o.order_status, o.payment_status,
              buyer.name AS buyer_name,
              COALESCE(SUM(oi.quantity * oi.unit_price_cents),0)::bigint AS seller_total_cents,
              COALESCE(json_agg(json_build_object(
                'listing_id',oi.listing_id,'title',oi.title_snapshot,'quantity',oi.quantity,
                'unit_price_cents',oi.unit_price_cents
              )) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items
       FROM order_items oi
       JOIN orders o ON o.id=oi.order_id
       JOIN users buyer ON buyer.id=o.buyer_id
       WHERE oi.seller_id=$1
       GROUP BY o.id,buyer.name
       ORDER BY o.created_at DESC LIMIT 100`, [req.user.id]
    );
    res.json({ orders: result.rows });
  } catch (e) { next(e); }
});

router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT o.*, COALESCE(json_agg(json_build_object(
          'listing_id',oi.listing_id,'title',oi.title_snapshot,'quantity',oi.quantity,
          'unit_price_cents',oi.unit_price_cents
        )) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items,
        d.delivery_status, d.partner_id
       FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
       LEFT JOIN deliveries d ON d.order_id=o.id
       WHERE o.buyer_id=$1
       GROUP BY o.id,d.delivery_status,d.partner_id
       ORDER BY o.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ orders: result.rows });
  } catch (e) { next(e); }
});

export default router;
