import crypto from 'node:crypto'

// Per-client identity config stored in the CLIENTS env var as a JSON array.
// Each web app gets its own token and its own brand/from/owner identity, so one
// deployed function can serve many apps without them being able to spoof one
// another. Tokens are stored as SHA-256 hashes so the env var is not a
// credential dump if the Netlify config is ever read.

export interface EmailClient {
  id: string
  tokenHash: string
  brandName: string
  fromAddress: string
  ownerAddress?: string
  replyToAddress?: string
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export const hashTokenForConfig = hashToken

let cache: { at: number; clients: EmailClient[] } | null = null
const CACHE_MS = 30_000

function parseClients(raw: string | undefined): EmailClient[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (c): c is EmailClient =>
          typeof c?.id === 'string' &&
          typeof c?.tokenHash === 'string' &&
          typeof c?.brandName === 'string' &&
          typeof c?.fromAddress === 'string',
      )
      .map((c) => ({
        id: c.id,
        tokenHash: c.tokenHash,
        brandName: c.brandName,
        fromAddress: c.fromAddress,
        ownerAddress: c.ownerAddress,
        replyToAddress: c.replyToAddress,
      }))
  } catch {
    return []
  }
}

/** Read clients from the CLIENTS env var, cached briefly. */
export function getClients(): EmailClient[] {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.clients
  const clients = parseClients(process.env.CLIENTS)
  cache = { at: Date.now(), clients }
  return clients
}

/** Constant-time bearer token check. Returns the matching client or null. */
export function authenticate(header: string | null): EmailClient | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return null
  const provided = hashToken(match[1])
  const clients = getClients()
  let found: EmailClient | null = null
  for (const client of clients) {
    const a = Buffer.from(provided)
    const b = Buffer.from(client.tokenHash)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) found = client
  }
  return found
}
