import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordProblem } from '../src/services/passwordPolicy.js';
import { detectImageType } from '../src/services/imageType.js';

test('rejects short, common and decorated-common passwords', () => {
  assert.match(passwordProblem('short1!'), /at least 10/);
  assert.match(passwordProblem('1234567890'), /too common/);
  assert.match(passwordProblem('Password123!'), /too common/);
  assert.match(passwordProblem('Qwerty2026!!'), /too common/);
  assert.match(passwordProblem('aaaaaaaaaaaa'), /repeat/);
  assert.match(passwordProblem('aarav.mehta.2026', 'aarav.mehta@x.com'), /email/);
});

test('accepts a long unusual passphrase', () => {
  assert.equal(passwordProblem('maple-river-lantern-42', 'a@b.com'), null);
});

test('detects images by magic bytes, not by claimed type', () => {
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(detectImageType(Buffer.from('<?php echo 1; ?>')), null);
  assert.equal(detectImageType(Buffer.from('GIF89a......')), null);
  assert.equal(detectImageType(Buffer.alloc(0)), null);
});
