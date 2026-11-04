import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeRedirect } from '../src/utils/redirect.js';

test('allows employee pages (with query strings and hashes)', () => {
  assert.equal(getSafeRedirect('/dashboard'), '/dashboard');
  assert.equal(getSafeRedirect('/requests/new'), '/requests/new');
  assert.equal(getSafeRedirect('/requests/abc123'), '/requests/abc123');
  assert.equal(getSafeRedirect('/requests/abc?tab=1#top'), '/requests/abc?tab=1#top');
});

test('falls back to /dashboard for missing or non-string values', () => {
  assert.equal(getSafeRedirect(undefined), '/dashboard');
  assert.equal(getSafeRedirect(null), '/dashboard');
  assert.equal(getSafeRedirect(42), '/dashboard');
  assert.equal(getSafeRedirect({}), '/dashboard');
  assert.equal(getSafeRedirect(''), '/dashboard');
});

test('blocks open redirects to other sites', () => {
  assert.equal(getSafeRedirect('https://evil.example'), '/dashboard');
  assert.equal(getSafeRedirect('//evil.example'), '/dashboard');
  assert.equal(getSafeRedirect('/\\evil.example'), '/dashboard');
  assert.equal(getSafeRedirect('javascript:alert(1)'), '/dashboard');
});

test('does not redirect to non-employee pages or lookalike prefixes', () => {
  assert.equal(getSafeRedirect('/login'), '/dashboard');
  assert.equal(getSafeRedirect('/respond/abc'), '/dashboard');
  assert.equal(getSafeRedirect('/dashboardevil'), '/dashboard');
  assert.equal(getSafeRedirect('/requestsfoo'), '/dashboard');
});
