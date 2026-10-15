import { S3Client, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { detectImageType } from './imageType.js';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const MAX_BYTES = 5 * 1024 * 1024;
const bad = message => Object.assign(new Error(message), { status: 400 });

// Presigned uploads go browser -> S3 and never pass through the API, so the API checks the stored object
// when a listing refers to it. A bad object is deleted. Returns the public image URL for the key.
export async function verifyListingImage(key, userId) {
  const Bucket = process.env.S3_BUCKET;
  if (!Bucket) throw bad('Image upload is not configured.');
  if (!key.startsWith(`listings/${userId}/`)) throw bad('That image does not belong to your account.');
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
    const first = await s3.send(new GetObjectCommand({ Bucket, Key: key, Range: 'bytes=0-11' }));
    const type = detectImageType(Buffer.from(await first.Body.transformToByteArray()));
    if (head.ContentLength > MAX_BYTES || !type || type !== head.ContentType) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
      throw bad('The uploaded file is not a valid JPEG, PNG or WebP image under 5 MB.');
    }
  } catch (error) {
    if (error.status === 400) throw error;
    if (error.name === 'NotFound' || error.name === 'NoSuchKey') throw bad('Uploaded image not found. Please upload it again.');
    throw error;
  }
  const base = process.env.S3_PUBLIC_BASE_URL;
  return base ? `${base.replace(/\/$/, '')}/${key}` : null;
}
