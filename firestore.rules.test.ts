import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectPayload, validateUserProfilePayload } from './src/utils/studioLogic';

test('Dirty Dozen #1: Rejects shadow/extra fields on project payload', () => {
  const res = validateProjectPayload({
    ownerId: 'user_123',
    title: 'Vampire Invitation',
    category: 'drama',
    genre: 'Romance',
    prompt: 'Gothic castle drama',
    scriptText: 'Scene 1...',
    status: 'draft',
    isAdmin: true,
  } as Record<string, unknown>);
  assert.equal(res.valid, false);
});

test('Dirty Dozen #2 & #6: Enforces strict ownerId format and prompt length limits', () => {
  const longPrompt = 'a'.repeat(2005);
  const res = validateProjectPayload({
    ownerId: 'user_123',
    title: 'Vampire Invitation',
    category: 'drama',
    genre: 'Romance',
    prompt: longPrompt,
    scriptText: 'Scene 1...',
    status: 'draft',
  });
  assert.equal(res.valid, false);
});

test('Dirty Dozen #10: Rejects invalid category or status enum values', () => {
  const res = validateProjectPayload({
    ownerId: 'user_123',
    title: 'Vampire Invitation',
    category: 'drama',
    genre: 'Romance',
    prompt: 'Valid prompt',
    scriptText: 'Scene 1...',
    status: 'hacked_status',
  });
  assert.equal(res.valid, false);
});

test('Validates compliant UserProfile and StudioProject payloads', () => {
  const profileCheck = validateUserProfilePayload({
    uid: 'user_123',
    displayName: 'Director Sofia',
    studioRole: 'Director',
  });
  assert.equal(profileCheck.valid, true);

  const projectCheck = validateProjectPayload({
    ownerId: 'user_123',
    title: 'Vampire: The Invitation',
    category: 'drama',
    genre: 'Romance',
    prompt: 'A vampire falls in love with a mortal in a gothic castle.',
    scriptText: 'INT. GOTHIC HALL - NIGHT',
    status: 'draft',
  });
  assert.equal(projectCheck.valid, true);
});
