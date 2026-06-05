/**
 * Passphrase-based encryption for backup files using Web Crypto.
 *
 * Format: JSON envelope { v: 1, alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iter: N, salt, iv, ct }
 * - PBKDF2-SHA256 with 200K iterations (~OWASP minimum) derives a 256-bit key
 * - AES-GCM with random 12-byte IV
 * - Authenticated encryption (tampering is detected on decrypt)
 *
 * All values base64-encoded for safe JSON transport.
 */

const PBKDF2_ITERATIONS = 200_000

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function b64ToBuf(s: string): ArrayBuffer {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

async function deriveKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export interface EncryptedEnvelope {
  v: 1
  alg: 'AES-GCM-256'
  kdf: 'PBKDF2-SHA256'
  iter: number
  salt: string
  iv: string
  ct: string
}

export async function encryptJson(plain: unknown, passphrase: string): Promise<EncryptedEnvelope> {
  if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt.buffer)
  const enc = new TextEncoder()
  const data = enc.encode(JSON.stringify(plain))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return {
    v: 1,
    alg: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iter: PBKDF2_ITERATIONS,
    salt: bufToB64(salt.buffer),
    iv: bufToB64(iv.buffer),
    ct: bufToB64(ct),
  }
}

export async function decryptJson(envelope: EncryptedEnvelope, passphrase: string): Promise<any> {
  if (envelope?.v !== 1 || envelope.alg !== 'AES-GCM-256') {
    throw new Error('Unsupported encrypted backup format')
  }
  const salt = b64ToBuf(envelope.salt)
  const iv = new Uint8Array(b64ToBuf(envelope.iv))
  const key = await deriveKey(passphrase, salt)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b64ToBuf(envelope.ct))
    return JSON.parse(new TextDecoder().decode(plain))
  } catch {
    throw new Error('Decryption failed — wrong passphrase or corrupt file')
  }
}

export function isEncryptedEnvelope(obj: any): obj is EncryptedEnvelope {
  return !!obj && obj.v === 1 && obj.alg === 'AES-GCM-256' && typeof obj.ct === 'string'
}
