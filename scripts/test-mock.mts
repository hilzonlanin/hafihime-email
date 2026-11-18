// Full-path test with a local mock Resend server — no real key, no cost.
// Run: node --experimental-strip-types scripts/test-mock.mts
import http from 'node:http'
import crypto from 'node:crypto'

const received: any[] = []
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    received.push({
      method: req.method,
      auth: req.headers.authorization,
      idempotency: req.headers['idempotency-key'],
      body: JSON.parse(body),
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: `mock-${received.length}` }))
  })
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as any).port

const token = 'test-app-token'
process.env.CLIENTS = JSON.stringify([
  {
    id: 'test-app',
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    brandName: 'Test Brand',
    fromAddress: 'test@example.com',
    replyToAddress: 'support@example.com',
  },
])
process.env.RESEND_API_KEY = 'dummy-key'
process.env.RESEND_API_URL = `http://127.0.0.1:${port}`

const { default: handler } = await import('../netlify/functions/send-email.mts')

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name} ${detail}`) }
}

const url = 'http://localhost/api/send-email'
const post = (headers: Record<string, string>, body: unknown) =>
  handler(new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }))

console.log('\n== full path (mock Resend) ==')

const okRes = await post(
  { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'order-123:purchase' },
  { to: 'buyer@example.com', subject: 'Welcome', html: '<p>Hi</p>', text: 'Hi' },
)
const okBody = await okRes.json()
check('valid request → 200', okRes.status === 200, `got ${okRes.status} ${JSON.stringify(okBody)}`)
check('response carries mock id', okBody.id === 'mock-1', JSON.stringify(okBody))
check('mock got exactly 1 Resend call', received.length === 1, `got ${received.length}`)
if (received[0]) {
  check('Resend Bearer key used', received[0].auth === 'Bearer dummy-key')
  check('from locked to client identity', received[0].body.from === 'Test Brand <test@example.com>', received[0].body.from)
  check('replyTo applied from client config', received[0].body.reply_to === 'support@example.com')
  check('idempotency key forwarded to Resend', received[0].idempotency === 'order-123:purchase', String(received[0].idempotency))
}

const noToken = await post({}, { to: 'buyer@example.com', subject: 'Hi', text: 'x' })
check('no token → 401', noToken.status === 401, `got ${noToken.status}`)

const badBody = await post(
  { Authorization: `Bearer ${token}` },
  { to: 'not-an-email', subject: 'Hi', text: 'x' },
)
check('invalid recipient → 400', badBody.status === 400, `got ${badBody.status}`)

server.close()
console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
