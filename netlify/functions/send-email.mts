import { authenticate } from '../../lib/clients.mts'
import { validateRequest } from '../../lib/validate.mts'
import { sendViaResend } from '../../lib/resend.mts'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' })
  }

  // 1. Authenticate — every caller must present a per-app bearer token.
  const client = authenticate(req.headers.get('authorization'))
  if (!client) {
    return json(401, { ok: false, error: 'unauthorized' })
  }

  // 2. Validate the payload before any network call.
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'invalid_json' })
  }
  const parsed = validateRequest(body)
  if (!parsed.ok) {
    return json(400, { ok: false, error: parsed.error })
  }

  // 3. Send through Resend with the caller's locked identity.
  const idempotencyKey = req.headers.get('idempotency-key')
  const result = await sendViaResend(client, parsed.value, idempotencyKey)
  if (!result.ok) {
    // Resend 4xx = caller-side problem (bad address etc.) → 400; 5xx/network → 502.
    const status = result.status && result.status >= 400 && result.status < 500 ? 400 : 502
    return json(status, { ok: false, error: result.error || 'provider_error' })
  }

  return json(200, { ok: true, id: result.id })
}

export const config = {
  path: '/api/send-email',
  method: 'POST',
}
