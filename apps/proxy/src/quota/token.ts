/**
 * Helper to encode an ArrayBuffer to base64url string without external dependencies.
 */
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Helper to decode a base64url string to Uint8Array.
 */
function base64UrlToBuffer(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Constant-time comparison of two Uint8Arrays to prevent timing attacks.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const secretKeyData = encoder.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    secretKeyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Signs a device ID using HMAC-SHA256 via Web Crypto API.
 * Token format: base64url(payloadJson) + "." + base64url(signature)
 */
export async function signDeviceToken(deviceId: string, secret: string): Promise<string> {
  const payload = JSON.stringify({ deviceId, iat: Date.now() });
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  const payloadB64 = bufferToBase64Url(payloadBytes.buffer);

  const key = await getHmacKey(secret);
  const dataToSign = encoder.encode(payloadB64);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, dataToSign);
  const signatureB64 = bufferToBase64Url(signatureBuffer);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies a device token signed with HMAC-SHA256 and returns the deviceId,
 * or null if invalid or tampered.
 */
export async function verifyDeviceToken(token: string, secret: string): Promise<string | null> {
  if (typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) {
    return null;
  }

  try {
    const key = await getHmacKey(secret);
    const encoder = new TextEncoder();
    const dataToVerify = encoder.encode(payloadB64);
    const signatureBytes = base64UrlToBuffer(signatureB64);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes.buffer as ArrayBuffer,
      dataToVerify
    );

    if (!isValid) {
      return null;
    }

    const payloadJson = new TextDecoder().decode(base64UrlToBuffer(payloadB64));
    const parsed = JSON.parse(payloadJson);
    if (!parsed || typeof parsed.deviceId !== "string" || !parsed.deviceId) {
      return null;
    }

    return parsed.deviceId;
  } catch {
    return null;
  }
}
