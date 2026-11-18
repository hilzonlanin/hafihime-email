# hafihime-email

Centralized transactional email service for hafihime web apps, deployed as a
Netlify Function. Every user-facing email (registration/welcome, password reset,
purchase confirmation + owner alert, contact-form replies) is delegated here so
calling apps don't carry a Resend SDK or key.

## Endpoint

`POST https://hafihime-email.netlify.app/api/send-email`

Headers:
- `Authorization: Bearer <app-token>` — per-app token; maps to a locked identity
- `Idempotency-Key: <optional>` — dedupe key passed through to Resend

Body:
```json
{
  "to": "customer@example.com",
  "subject": "Pembayaran diterima",
  "html": "<p>…</p>",
  "text": "plain text fallback",
  "replyTo": "support@hafihime.com"
}
```

Responses: `200 {ok:true, id}` · `400` validation · `401` bad token ·
`405` wrong method · `502` provider failure.

## Calling from a web app (server-side only)

```ts
await fetch('https://hafihime-email.netlify.app/api/send-email', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.EMAIL_SERVICE_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ to, subject, html, text }),
})
```

Never expose the token to the browser.

## Setup / config

Secrets live in Netlify environment variables (never in code or git):
- `RESEND_API_KEY` — Resend key on the verified `hafihime.com` domain
- `RESEND_API_URL` — optional, default `https://api.resend.com`
- `CLIENTS` — JSON array of per-app identities (see `.env.example`)

Set them with `netlify env:set KEY value` or in the Netlify dashboard. A push is
required for env changes to take effect on the deployment.

Local dev: `netlify dev` (uses a git-ignored `.env`).

## Deployment

Git-based: pushes to `master` on `hilzonlanin/hafihime-email` trigger automatic
Netlify builds. Do not deploy from a local machine.
