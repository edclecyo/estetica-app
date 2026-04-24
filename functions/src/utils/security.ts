import * as crypto from 'crypto';

type SignatureMap = Record<string, string>;

/**
 * Parse seguro do header x-signature do Mercado Pago
 */
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

/**
 * 🔐 VALIDADOR OFICIAL HARDENED (PRODUÇÃO)
 */
export function validarAssinaturaMercadoPago(
  signatureHeader: string | string[] | undefined,
  requestId: string | string[] | undefined,
  dataId: string,
  secret: string,
  options?: {
    toleranceSeconds?: number;
    usedEventStore?: Set<string>; // opcional (memória / redis)
  }
): boolean {
  const tolerance = options?.toleranceSeconds ?? 300;

  const sig = parseSignature(signatureHeader);

  const ts = sig.ts;
  const receivedSignature = sig.v1;

  if (!ts || !receivedSignature || !secret) return false;

  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) return false;

  // ⏱️ PROTEÇÃO DE TEMPO (anti replay atrasado)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return false;
  }

  // 📦 request id normalizado
  const reqId = Array.isArray(requestId) ? requestId[0] : requestId;
  if (!reqId) return false;

  // 🔁 chave única do evento
  const eventKey = `${dataId}_${reqId}_${ts}`;

  // 🔒 replay protection (opcional em memória)
  if (options?.usedEventStore?.has(eventKey)) {
    return false;
  }

  // 🧾 manifesto oficial
  const payload = `id:${dataId};request-id:${reqId};ts:${ts};`;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // 🔐 comparação segura
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(receivedSignature, 'utf8');

  if (a.length !== b.length) return false;

  const valid = crypto.timingSafeEqual(a, b);

  // 🧠 marca como usado (se estiver usando store)
  if (valid && options?.usedEventStore) {
    options.usedEventStore.add(eventKey);
  }

  return valid;
}