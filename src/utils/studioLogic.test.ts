import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAMA_INSPIRATION_PRESETS,
  IMAGE_ASPECT_RATIOS,
  IMAGE_SIZES,
  buildPosterSvgDataUri,
  isValidFirestoreId,
  normalizeSupportedImageAspectRatio,
  sanitizeProjectDraft,
  validateProjectPayload,
  validateUserProfilePayload,
} from './studioLogic';

test('DRAMA_INSPIRATION_PRESETS includes all 6 Movie City inspiration titles', () => {
  assert.equal(DRAMA_INSPIRATION_PRESETS.length, 6);
  const titles = DRAMA_INSPIRATION_PRESETS.map((d) => d.title.toUpperCase());
  assert.ok(titles.includes('VAMPIRE: THE INVITATION'));
  assert.ok(titles.includes("THE ALPHA'S DESTINY"));
  assert.ok(titles.includes("THE WOMAN'S REVENGE"));
  assert.ok(titles.includes("THE RANCHER'S SECRET"));
  assert.ok(titles.includes("THE FAT CAT'S BIG ADVENTURE"));
  assert.ok(titles.includes('WHEN DESTINY CALLS'));
});

test('IMAGE_ASPECT_RATIOS and IMAGE_SIZES expose all required studio options', () => {
  assert.deepEqual(IMAGE_ASPECT_RATIOS, [
    '1:1',
    '2:3',
    '3:2',
    '3:4',
    '4:3',
    '9:16',
    '16:9',
    '21:9',
  ]);
  assert.deepEqual(IMAGE_SIZES, ['1K', '2K', '4K']);
  assert.equal(normalizeSupportedImageAspectRatio('21:9'), '16:9');
  assert.equal(normalizeSupportedImageAspectRatio('2:3'), '3:4');
  assert.equal(normalizeSupportedImageAspectRatio('9:16'), '9:16');
});

test('sanitizeProjectDraft and validateProjectPayload work end-to-end', () => {
  const sanitized = sanitizeProjectDraft({
    ownerId: 'director_01',
    title: '  Midnight Vampire Overture  ',
    category: 'drama',
    genre: 'Romance',
    prompt: 'Gothic castle romance',
    scriptText: 'INT. CASTLE - NIGHT',
  });
  const check = validateProjectPayload(sanitized);
  assert.equal(check.valid, true);
  assert.equal(sanitized.title, 'Midnight Vampire Overture');
});

test('isValidFirestoreId rejects invalid characters and overly long strings', () => {
  assert.equal(isValidFirestoreId('valid_id-123'), true);
  assert.equal(isValidFirestoreId('invalid/id'), false);
  assert.equal(isValidFirestoreId(''), false);
  assert.equal(isValidFirestoreId('a'.repeat(130)), false);
});

test('validateUserProfilePayload enforces non-PII keys', () => {
  const withEmail = validateUserProfilePayload({
    uid: 'user_1',
    displayName: 'Director One',
    studioRole: 'Director',
    email: 'secret@example.com',
  });
  assert.equal(withEmail.valid, false);
});

test('buildPosterSvgDataUri generates valid SVG data URI', () => {
  const uri = buildPosterSvgDataUri({
    title: 'Vampire: The Invitation',
    genre: 'Romance',
    category: 'drama',
    prompt: 'A gothic castle scene',
  });
  assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'));
});
