import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/verifyJwt.js';
import { verifyListingImage } from '../services/imageCheck.js';

const router = Router();
const listingSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional().default(''),
  category: z.string().max(60).optional().default('Other'),
  image_key: z.string().max(1024).optional().nullable(),
  image_url: z.string().url().max(2048).optional().nullable(),
  price_cents: z.number().int().min(0).max(100000000),
  original_price_cents: z.number().int().min(0).max(100000000).nullable().optional(),
  quantity_available: z.number().int().min(0).max(100000),
  quantity_unit: z.string().max(40).optional().default('item'),
  expiry_at: z.string().datetime(),
  prepared_at: z.string().datetime().nullable().optional(),
  storage_conditions: z.string().max(500).optional().nullable(),
  allergens: z.array(z.string().max(80)).max(30).optional().default([]),
  pickup_address: z.string().trim().min(5).max(500),
  pickup_area: z.string().trim().min(2).max(120)
});

router.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').slice(0, 100);
    const category = String(req.query.category || '').slice(0, 60);
    const area = String(req.query.area || '').slice(0, 120);
    const result = await pool.query(
      `SELECT l.id, l.seller_id, l.title, l.description, l.category, l.image_key, l.image_url,
              l.price_cents, l.original_price_cents, l.quantity_available, l.quantity_unit,
              l.expiry_at, l.prepared_at, l.storage_conditions, l.allergens,
              l.pickup_area, l.status, l.created_at, u.name AS seller_name
       FROM listings l JOIN users u ON u.id = l.seller_id
       WHERE l.status = 'AVAILABLE' AND l.quantity_available > 0 AND l.expiry_at > NOW()
         AND ($1 = '' OR l.title ILIKE '%' || $1 || '%' OR l.description ILIKE '%' || $1 || '%')
         AND ($2 = '' OR l.category = $2)
         AND ($3 = '' OR l.pickup_area ILIKE '%' || $3 || '%')
       ORDER BY l.expiry_at ASC LIMIT 100`,
      [search, category, area]
    );
    res.json({ listings: result.rows });
  } catch (e) { next(e); }
});

router.get('/mine', authenticate, requireRole('seller', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT l.*, COALESCE(sales.units_sold,0)::int AS units_sold,
              COALESCE(sales.order_count,0)::int AS order_count
       FROM listings l
       LEFT JOIN (
         SELECT oi.listing_id, SUM(oi.quantity)::int AS units_sold, COUNT(DISTINCT oi.order_id)::int AS order_count
         FROM order_items oi GROUP BY oi.listing_id
       ) sales ON sales.listing_id=l.id
       WHERE l.seller_id=$1
       ORDER BY l.created_at DESC LIMIT 100`, [req.user.id]
    );
    res.json({ listings: result.rows });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name AS seller_name FROM listings l JOIN users u ON u.id=l.seller_id
       WHERE l.id=$1 AND l.status <> 'INACTIVE'`, [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Listing not found' });
    const listing = result.rows[0];
    if (listing.expiry_at <= new Date() || listing.quantity_available <= 0) {
      return res.status(410).json({ error: 'Listing is no longer available' });
    }
    res.json({ listing });
  } catch (e) { next(e); }
});

router.post('/', authenticate, requireRole('seller', 'admin'), async (req, res, next) => {
  try {
    const parsed = listingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid listing data', details: parsed.error.flatten() });
    const d = parsed.data;
    if (d.image_key) d.image_url = await verifyListingImage(d.image_key, req.user.id);
    if (new Date(d.expiry_at) <= new Date()) return res.status(400).json({ error: 'Expiry must be in the future' });
    if (d.original_price_cents != null && d.original_price_cents < d.price_cents) {
      return res.status(400).json({ error: 'Original price cannot be lower than sale price' });
    }
    const result = await pool.query(
      `INSERT INTO listings
       (seller_id,title,description,category,image_key,image_url,price_cents,original_price_cents,
        quantity_available,quantity_unit,expiry_at,prepared_at,storage_conditions,allergens,
        pickup_address,pickup_area,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        CASE WHEN $9=0 THEN 'SOLD_OUT' ELSE 'AVAILABLE' END)
       RETURNING *`,
      [req.user.id,d.title,d.description,d.category,d.image_key || null,d.image_url || null,
       d.price_cents,d.original_price_cents ?? null,d.quantity_available,d.quantity_unit,d.expiry_at,
       d.prepared_at ?? null,d.storage_conditions ?? null,d.allergens,d.pickup_address,d.pickup_area]
    );
    await pool.query(
      `INSERT INTO audit_logs(actor_id,action,entity_type,entity_id) VALUES($1,'LISTING_CREATED','listing',$2)`,
      [req.user.id,result.rows[0].id]
    );
    res.status(201).json({ listing: result.rows[0] });
  } catch (e) { next(e); }
});

router.patch('/:id', authenticate, requireRole('seller', 'admin'), async (req, res, next) => {
  try {
    const current = await pool.query('SELECT * FROM listings WHERE id=$1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Listing not found' });
    if (req.user.role !== 'admin' && current.rows[0].seller_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this listing' });
    }
    const editable = listingSchema.partial().safeParse(req.body);
    if (!editable.success) return res.status(400).json({ error: 'Invalid listing data', details: editable.error.flatten() });
    if (editable.data.image_key) editable.data.image_url = await verifyListingImage(editable.data.image_key, req.user.id);
    const allowed = ['title','description','category','image_key','image_url','price_cents','original_price_cents',
      'quantity_available','quantity_unit','expiry_at','prepared_at','storage_conditions','allergens','pickup_address','pickup_area'];
    const entries = Object.entries(editable.data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ error: 'No editable fields supplied' });
    const values = entries.map(([,v]) => v);
    const sets = entries.map(([k], i) => `${k}=$${i+2}`);
    sets.push(`updated_at=NOW()`);
    const result = await pool.query(
      `UPDATE listings SET ${sets.join(', ')} WHERE id=$1 AND seller_id=$${values.length+2} RETURNING *`,
      [req.params.id, ...values, req.user.role === 'admin' ? current.rows[0].seller_id : req.user.id]
    );
    if (!result.rowCount) return res.status(409).json({ error: 'Listing could not be updated' });
    res.json({ listing: result.rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', authenticate, requireRole('seller', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE listings SET status='INACTIVE', updated_at=NOW()
       WHERE id=$1 AND ($2='admin' OR seller_id=$3) RETURNING id`,
      [req.params.id, req.user.role, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Listing not found or not owned by you' });
    res.json({ message: 'Listing deactivated' });
  } catch (e) { next(e); }
});

export default router;
