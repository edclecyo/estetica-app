/**
 * Converte o cabeçalho de assinatura (ex: "ts=123,v1=abc") em um objeto.
 * Útil para validar Webhooks do Mercado Pago e outras APIs de pagamento.
 */
export function signatureHeaderToMap(header?: string | string[]): Record<string, string> {
  const map: Record<string, string> = {};

  // Resolve headers que chegam como arrays (comportamento padrão do Express/Cloud Functions)
  const headerString = Array.isArray(header) ? header[0] : header;

  if (!headerString) return map;

  const parts = headerString.split(',');

  for (const part of parts) {
    const index = part.indexOf('=');
    
    if (index !== -1) {
      const key = part.substring(0, index).trim();
      const value = part.substring(index + 1).trim();
      
      if (key) {
        map[key] = value;
      }
    }
  }

  return map;
}