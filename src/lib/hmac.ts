/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/lib/hmac.ts
 * Client-side HMAC-SHA256 request signing utility using Web Crypto API.
 */

export async function createHmacSha256Signature(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await window.crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildHmacHeaders(apiKeyId: string, apiSecret: string, method: string, path: string, bodyObj?: any) {
  const timestamp = Date.now().toString();
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const message = `${method.toUpperCase()}${path}${timestamp}${bodyStr}`;
  const signature = await createHmacSha256Signature(apiSecret, message);

  return {
    'X-DIMONEX-APIKEY': apiKeyId,
    'X-DIMONEX-TIMESTAMP': timestamp,
    'X-DIMONEX-SIGNATURE': signature,
    'Content-Type': 'application/json'
  };
}
