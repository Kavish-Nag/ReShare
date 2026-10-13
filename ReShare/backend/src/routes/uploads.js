import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate, requireRole } from '../middleware/verifyJwt.js';

const router = Router();
const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const schema = z.object({
  contentType: z.enum(['image/jpeg','image/png','image/webp']),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024)
});

router.post('/presign', authenticate, requireRole('seller','admin'), async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Only JPEG, PNG or WebP images up to 5 MB are allowed' });
    if (!process.env.S3_BUCKET) return res.status(503).json({ error: 'Image upload is not configured' });

    const ext = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }[parsed.data.contentType];
    const key = `listings/${req.user.id}/${randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: parsed.data.contentType,
      Metadata: { uploader: req.user.id }
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const imageUrl = process.env.S3_PUBLIC_BASE_URL
      ? `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
      : null;
    res.json({ uploadUrl, key, imageUrl, expiresInSeconds: 300 });
  } catch (e) { next(e); }
});

export default router;
