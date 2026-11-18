// Local logic tests — no secrets, no network, no Netlify needed.
// Run: node --experimental-strip-types scripts/test-local.mts
import crypto from 'node:crypto'
import { validateRequest } from '../lib/validate.mts'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`)
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

console.log('\n== validateRequest ==')

test('valid text-only email', () => {
  const r = validateRequest({ to: 'buyer@example.com', subject: 'Hi', text: 'Hello' })
  assert(r.ok, `expected ok, got ${JSON.stringify(r)}`)
})

test('valid html + replyTo + multiple recipients', () => {
  const r = validateRequest({
    to: ['a@example.com', 'b@example.com'],
    subject: 'Order',
    html: '<p>Hi</p>',
    replyTo: 'support@example.com',
  })
  assert(r.ok, `expected ok, got ${JSON.stringify(r)}`)
})

test('rejects missing body', () => {
  const r = validateRequest({ to: 'a@example.com', subject: 'Hi' })
  assert(!r.ok && r.error === 'empty_body', `expected empty_body, got ${JSON.stringify(r)}`)
})

test('rejects bad email', () => {
  const r = validateRequest({ to: 'not-an-email', subject: 'Hi', text: 'x' })
  assert(!r.ok && r.error === 'invalid_recipient', `expected invalid_recipient, got ${JSON.stringify(r)}`)
})

test('rejects too-long subject', () => {
  const r = validateRequest({ to: 'a@example.com', subject: 'x'.repeat(201), text: 'x' })
  assert(!r.ok && r.error === 'invalid_subject', `expected invalid_subject, got ${JSON.stringify(r)}`)
})

test('rejects too many recipients', () => {
  const r = validateRequest({
    to: Array.from({ length: 51 }, (_, i) => `u${i}@example.com`),
    subject: 'Hi',
    text: 'x',
  })
  assert(!r.ok && r.error === 'invalid_recipient', `expected invalid_recipient, got ${JSON.stringify(r)}`)
})

test('rejects bad replyTo', () => {
  const r = validateRequest({ to: 'a@example.com', subject: 'Hi', text: 'x', replyTo: 'bad' })
  assert(!r.ok && r.error === 'invalid_reply_to', `expected invalid_reply_to, got ${JSON.stringify(r)}`)
})

test('rejects oversized body', () => {
  const r = validateRequest({ to: 'a@example.com', subject: 'Hi', text: 'x'.repeat(256 * 1024 + 1) })
  assert(!r.ok && r.error === 'body_too_large', `expected body_too_large, got ${JSON.stringify(r)}`)
})

console.log('\n== token hashing ==')

test('token hash is deterministic sha256 hex', () => {
  const h = crypto.createHash('sha256').update('secret-token').digest('hex')
  assert(h.length === 64 && /^[0-9a-f]+$/.test(h), `bad hash: ${h}`)
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
