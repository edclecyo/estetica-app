import * as crypto from 'crypto';

type SignatureMap = Record<string, string>;

function parseSignature(header?: string | string[]): SignatureMap {
  const map: SignatureMap = {};

  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || typeof raw !== 'string') return map;

  const parts = raw.split(',');

  for (const part of parts) {
    const [key, value] = part.split('=');

    if (!key || !value) continue;

    map[key.trim()] = value.trim();
  }

  return map;
}

export function validarAssinaturaMercadoPago(
  signatureHeader: string | string[] | undefined,
  requestId: string | string[] | undefined,
  dataId: string | number,
  secret: string,
  options?: {
    toleranceSeconds?: number;
  }
): boolean {

  try {
    const tolerance = options?.toleranceSeconds ?? 300;

    const sig = parseSignature(signatureHeader);

    const ts = sig.ts;
    const receivedSignature = sig.v1;

    if (!ts || !receivedSignature || !secret) {
      return false;
    }

    const timestampMs = Number(ts);
    if (!Number.isFinite(timestampMs)) {
      return false;
    }

    // ⏱️ TIME WINDOW
    const now = Date.now();
    if (Math.abs(now - timestampMs) > tolerance * 1000) {
      return false;
    }

    // 📦 NORMALIZAÇÃO
    const reqId = Array.isArray(requestId) ? requestId[0] : requestId;
    if (!reqId) return false;

    const id = String(dataId);

    // 🧾 PAYLOAD OFICIAL (EXATO)
    const payload = `id:${id};request-id:${reqId};ts:${ts};`;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // 🔐 SAFE COMPARE
    const a = Buffer.from(expected);
    const b = Buffer.from(receivedSignature);

    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(a, b);

  } catch (err) {
    console.error('Erro validação MP:', err);
    return false;
  }
}
