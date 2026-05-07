import * as crypto from 'crypto';

type SignatureMap = Record<string, string>;

function parseSignature(header?: string | string[]): SignatureMap {
  const map: SignatureMap = {};

  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || typeof raw !== 'string') return map;

  for (const part of raw.split(',')) {
    const [key, ...rest] = part.split('=');
    if (!key || rest.length === 0) continue;

    map[key.trim()] = rest.join('=').trim();
  }

  return map;
}

export function validarAssinaturaMercadoPago(
  signatureHeader: string | string[] | undefined,
  requestId: string | string[] | undefined,
  dataId: string,
  secret: string,
  options?: {
    toleranceSeconds?: number;
    usedEventStore?: Set<string>;
  }
): boolean {

  try {
    const tolerance = options?.toleranceSeconds ?? 300;

    const sig = parseSignature(signatureHeader);

    const ts = sig.ts;
    const receivedSignature = sig.v1;

    // 🔴 Se não tem assinatura → não valida (não quebra webhook)
    if (!ts || !receivedSignature || !secret) {
      return false;
    }

    const timestamp = Number(ts);
    if (!Number.isFinite(timestamp)) return false;

    // ⏱️ valida tempo
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
      return false;
    }

    // 🔥 request-id OPCIONAL (corrigido)
    const reqId = Array.isArray(requestId)
      ? requestId[0]
      : requestId || '';

    // 🔁 replay protection (só se tiver reqId)
    if (reqId && options?.usedEventStore) {
      const eventKey = `${dataId}_${reqId}_${ts}`;

      if (options.usedEventStore.has(eventKey)) {
        return false;
      }

      options.usedEventStore.add(eventKey);
    }

    // 🔐 payload flexível (corrigido)
    let payload = `id:${dataId};ts:${ts};`;

    if (reqId) {
      payload = `id:${dataId};request-id:${reqId};ts:${ts};`;
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(receivedSignature, 'utf8');

    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);

  } catch (e) {
    console.error("Erro validação assinatura:", e);
    return false;
  }
}