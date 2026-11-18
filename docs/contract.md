# The contract

One endpoint, one resource:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/send-email` | send one transactional email |

Anything else answers `405 method_not_allowed` — the path is fixed, there are
no sub-resources and no query parameters.

Everything is JSON. No CORS: the bearer token is a sending credential, so
browsers never call this service directly — a server does.

## Authentication

```
Authorization: Bearer <token>
```

The token resolves to a **client** (see `CLIENTS`), and the client locks the
sending identity:

| Locked per client | Why |
|---|---|
| `brandName` + `fromAddress` | one app cannot spoof another's From line |
| `ownerAddress` (optional) | where owner alerts go for that app |
| `replyToAddress` (default) | per-request `replyTo` may override it |

Only SHA-256 hashes of tokens are stored in `CLIENTS`, compared in constant
time. The request body cannot choose an identity — it only picks recipients,
subject and content.

## Request

```json
{
  "to": "buyer@example.com",
  "subject": "Pembayaran diterima",
  "html": "<p>Terima kasih, pesanan kamu sedang disiapkan.</p>",
  "text": "Terima kasih, pesanan kamu sedang disiapkan.",
  "replyTo": "support@hafihime.com"
}
```

| Field | Type | Required | Limits |
|---|---|---|---|
| `to` | string or string[] | yes | 1–50 recipients, each a valid address ≤ 254 chars |
| `subject` | string | yes | non-empty, ≤ 200 chars |
| `html` | string | one of `html`/`text` | ≤ 256 KB |
| `text` | string | one of `html`/`text` | ≤ 256 KB |
| `replyTo` | string | no | valid address; falls back to the client's `replyToAddress` |

At least one of `html` or `text` must be non-empty — an empty body is refused
before any network call. Send both when you can: `text` is what a mail client
shows when it blocks HTML.

### Headers

| Header | Required | Purpose |
|---|---|---|
| `Authorization` | yes | `Bearer <token>` — whose identity is used |
| `Idempotency-Key` | no | passed through to Resend (truncated to 200 chars); retrying with the same key does not double-send |

## Response (200)

```json
{ "ok": true, "id": "0e6f5b0c-…-b2e1" }
```

`id` is Resend's message id — quote it in support tickets and in the caller's
own logs; it is the only handle on a message once it has left.

## Errors

Every failure is `{ "ok": false, "error": "<code>" }` — the codes are stable,
listed in [`errors.md`](errors.md). Validation happens **before** any network
call, so a bad payload costs no provider request.

| Status | Meaning |
|---|---|
| `400` | the request is wrong (bad JSON, bad recipient, empty body, …) — fix the call |
| `401` | missing or unknown bearer token |
| `405` | not a `POST` |
| `502` | Resend refused or did not answer — retry later; the caller's request was fine |

## Timeouts and failure posture

- The Resend call is bounded at **20 s** (`AbortSignal.timeout`).
- The function **never throws**: every failure becomes a status + code, so a
  caller's payment flow or sign-in never dies because mail failed.
- Mail failure is not payment failure: a caller that can afford to lose the
  email (a welcome note) should log and continue; a caller that cannot (a
  purchase confirmation the owner must see) should alert — but never block the
  buyer on it.

## Units and conventions

- Bodies are UTF-8 JSON.
- Addresses are validated by shape (`local@domain.tld`), not by existence —
  deliverability is Resend's problem, syntax is ours.
- No attachments, no templates, no threading in v1. The caller renders HTML.

## Versioning

The path carries no version: the contract only grows (new optional fields, new
error codes). A breaking change would arrive as `/api/v2/send-email` with this
endpoint kept alive.
