import type { EmailClient } from './clients.mts'
import type { SendRequest } from './validate.mts'

// The only transport: Resend's HTTP API on the verified sending domain. No SDK,
// just fetch. Never throws to the caller — failures are returned as a result
// object so the function can map them to an HTTP status without leaking a stack.

export interface SendResult {
  ok: boolean
  id?: string
  status?: number
  error?: string
}

export async function sendViaResend(
  client: EmailClient,
  req: SendRequest,
  idempotencyKey?: string | null,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[mail] RESEND_API_KEY is not set — email skipped')
    return { ok: false, error: 'not_configured' }
  }
  const apiBase = (process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/+$/, '')

  const from = `${client.brandName} <${client.fromAddress}>`
  const replyTo = req.replyTo || client.replyToAddress

  try {
    const response = await fetch(`${apiBase}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 200) } : {}),
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(req.to) ? req.to : [req.to],
        subject: req.subject,
        html: req.html,
        text: req.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(`[mail] Resend ${response.status} ${detail.slice(0, 300)}`)
      return { ok: false, status: response.status, error: 'provider_error' }
    }

    const payload = (await response.json().catch(() => ({}))) as { id?: string }
    console.log(`[mail] sent "${req.subject}" to ${Array.isArray(req.to) ? req.to.join(',') : req.to}`)
    return { ok: true, id: payload.id }
  } catch (error) {
    console.error('[mail] send failed:', error instanceof Error ? error.message : error)
    return { ok: false, error: 'provider_unavailable' }
  }
}
