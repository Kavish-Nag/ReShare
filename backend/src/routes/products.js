import express, { Router } from 'express';
import { authenticate, requireRole } from '../middleware/verifyJwt.js';
import { barcodeLimiter, identifyLimiter } from '../middleware/rateLimits.js';
import { lookupBarcode } from '../services/barcode.js';
import { identifyFood } from '../services/imageRecognition.js';
import { detectImageType } from '../services/imageType.js';

const router = Router();

router.get('/barcode/:code', authenticate, requireRole('seller', 'admin'), barcodeLimiter, async (req, res) => {
  if (!/^\d{8,14}$/.test(req.params.code)) return res.status(400).json({ error: 'Enter the 8 to 14 digit number printed under the barcode' });
  try {
    res.json(await lookupBarcode(req.params.code));
  } catch (e) {
    console.error('Barcode lookup failed:', e.message);
    // The shared error handler hides 5xx messages, but this one is safe and useful to show.
    res.status(502).json({ error: 'Product lookup is not reachable right now. Fill the details in manually.' });
  }
});

// The browser sends the photo as the raw request body (JPEG or PNG, up to 5 MB); Rekognition only reads JPEG and PNG.
router.post('/identify', authenticate, requireRole('seller', 'admin'), identifyLimiter,
  express.raw({ type: ['image/jpeg', 'image/png'], limit: '5mb' }), async (req, res) => {
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || !['image/jpeg', 'image/png'].includes(detectImageType(bytes))) {
      return res.status(400).json({ error: 'Send a JPEG or PNG photo up to 5 MB.' });
    }
    try {
      res.json(await identifyFood(bytes));
    } catch (e) {
      console.error('Photo recognition failed:', e.name, e.message);
      res.status(503).json({ error: 'Photo recognition is not available right now. Fill in the details by hand.' });
    }
  });

export default router;
