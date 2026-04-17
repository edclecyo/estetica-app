import * as crypto from 'crypto';
import { signatureHeaderToMap } from './mercadoPagoSignature';

/**
 * Valida a assinatura (HMAC SHA256) do Mercado Pago.
 * Essencial para garantir que o aviso de "Pagamento Aprovado" é real.
 */
export function validarAssinaturaMercadoPago(
  assinaturaHeader: string | undefined,
  requestIdHeader: string | undefined,
  dataId: string, // O ID do recurso (pagamento/assinatura)
  segredo: string // O seu Client Secret ou Webhook Secret
): boolean {
  if (!assinaturaHeader || !requestIdHeader || !dataId || !segredo) {
    return false;
  }

  const parts = signatureHeaderToMap(assinaturaHeader);
  const ts = parts.ts;
  const v1 = parts.v1;

  if (!ts || !v1) return false;

  // 1. Montagem do Manifesto (Template oficial do Mercado Pago)
  // Certifique-se de que não há espaços extras entre os pontos e vírgulas.
  const manifesto = `id:${dataId};request-id:${requestIdHeader};ts:${ts};`;

  try {
    // 2. Gerar Hash HMAC SHA256
    const expectedHash = crypto
      .createHmac('sha256', segredo)
      .update(manifesto)
      .digest('hex');

    // 3. Comparação segura (Timing Safe)
    const receivedBuf = Buffer.from(v1, 'hex');
    const expectedBuf = Buffer.from(expectedHash, 'hex');

    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch (error) {
    console.error("❌ Falha crítica na validação de segurança do Webhook:", error);
    return false;
  }
}