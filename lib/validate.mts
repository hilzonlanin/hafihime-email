// Request validation. The endpoint spends money and is public, so validate
// hard before any network call to Resend. Keep limits generous enough for real
// HTML emails but bounded against abuse.

export interface SendRequest {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const MAX_RECIPIENTS = 50
const MAX_SUBJECT = 200
const MAX_BODY = 256 * 1024 // 256 KB

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value)
}

export function validateRequest(body: unknown): { ok: true; value: SendRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_body' }
  const b = body as Record<string, unknown>

  const toRaw = b.to
  const to = Array.isArray(toRaw) ? toRaw : [toRaw]
  if (to.length < 1 || to.length > MAX_RECIPIENTS || !to.every(validEmail)) {
    return { ok: false, error: 'invalid_recipient' }
  }

  if (typeof b.subject !== 'string' || !b.subject.trim() || b.subject.length > MAX_SUBJECT) {
    return { ok: false, error: 'invalid_subject' }
  }

  const html = typeof b.html === 'string' ? b.html : undefined
  const text = typeof b.text === 'string' ? b.text : undefined
  if ((!html || !html.trim()) && (!text || !text.trim())) {
    return { ok: false, error: 'empty_body' }
  }
  if ((html && html.length > MAX_BODY) || (text && text.length > MAX_BODY)) {
    return { ok: false, error: 'body_too_large' }
  }
  if (b.replyTo !== undefined && !validEmail(b.replyTo)) {
    return { ok: false, error: 'invalid_reply_to' }
  }

  return {
    ok: true,
    value: {
      to: Array.isArray(toRaw) ? (toRaw as string[]) : (to[0] as string),
      subject: b.subject,
      html,
      text,
      replyTo: typeof b.replyTo === 'string' ? b.replyTo : undefined,
    },
  }
}
