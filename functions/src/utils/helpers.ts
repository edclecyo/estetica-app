import { HttpsError } from 'firebase-functions/v2/https';

function assertString(v: any, name: string) {
  if (typeof v !== 'string') {
    throw new HttpsError('invalid-argument', `${name} inválido`);
  }
  return v.trim();
}

/**
 * Converte DD/MM/AAAA + HH:mm em Date seguro
 */
export function parseDataHoraBR(data: string, horario: string): Date {
  data = assertString(data, 'Data');
  horario = assertString(horario, 'Horário');

  const partsDate = data.split('/');
  const partsTime = horario.split(':');

  if (partsDate.length !== 3 || partsTime.length !== 2) {
    throw new HttpsError('invalid-argument', 'Formato inválido');
  }

  const [d, m, a] = partsDate.map(Number);
  const [h, min] = partsTime.map(Number);

  if ([d, m, a, h, min].some(v => !Number.isInteger(v))) {
    throw new HttpsError('invalid-argument', 'Data ou horário inválido');
  }

  const date = new Date(Date.UTC(a, m - 1, d, h - 3, min));
  // -3 = Brasilia fixo (produção controlada)

  if (
    date.getUTCFullYear() !== a ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new HttpsError('invalid-argument', 'Data inexistente');
  }

  return date;
}
export function dataKey(data: string) {
  const [d, m, a] = data.split('/');
  return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
/**
 * Moeda BR segura
 */
export function formatarMoeda(valor: any): string {
  const num = Number(valor);

  if (!isFinite(num) || num < 0) {
    return 'R$ 0,00';
  }

  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Data extensa segura
 */
export function formatarDataExtenso(dataBr: any): string {
  if (typeof dataBr !== 'string') return '';

  const parts = dataBr.split('/');
  if (parts.length !== 3) return '';

  const [d, m] = parts.map(Number);

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  if (m < 1 || m > 12) return '';

  return `${d} de ${meses[m - 1]}`;
}
export function planoAtivo(est: any): boolean {
  if (!est) return false;

  const agora = new Date();

  // 🔥 protege contra expiraEm inválido
  const expira = est?.expiraEm?.toDate?.() || null;

  const trialAtivo =
    est?.plano === 'trial' &&
    expira &&
    expira.getTime() > agora.getTime();

  const assinaturaAtiva =
    est?.assinaturaAtiva === true;

  // ✅ REGRA FINAL
  return trialAtivo || assinaturaAtiva;
}
