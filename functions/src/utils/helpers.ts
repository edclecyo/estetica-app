import { HttpsError } from 'firebase-functions/v2/https';

function assertString(v: any, name: string) {
  if (typeof v !== 'string') {
    throw new HttpsError('invalid-argument', `${name} inválido`);
  }
  return v.trim();
}

export function gerarSlots(horario: string, duracaoMin: number) {
  const [h, m] = horario.split(':').map(Number);

  const inicio = new Date();
  inicio.setHours(h, m, 0, 0);

  const slots: string[] = [];
  const passos = Math.ceil(duracaoMin / 30);

  for (let i = 0; i < passos; i++) {
    const slot = new Date(inicio);
    slot.setMinutes(inicio.getMinutes() + i * 30);
    slots.push(slot.toTimeString().slice(0, 5));
  }

  return slots;
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

  // ✅ cria data local corretamente (Brasil)
  const date = new Date(a, m - 1, d, h, min, 0, 0);

  // valida se data é real
  if (
    date.getFullYear() !== a ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    throw new HttpsError('invalid-argument', 'Data inexistente');
  }

  return date;
}
export function dataKey(data: string) {
  const [d, m, a] = data.split('/');

return `${a}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}
/**
 * Moeda BR segura
 */
const formatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatarMoeda(valor: any): string {
  const num = Number(valor);
  if (!isFinite(num) || num < 0) return 'R$ 0,00';
  return formatter.format(num);
}

/**
 * Data extensa segura
 */
export function formatarDataExtenso(dataBr: any): string {
  if (typeof dataBr !== 'string') return '';

  const parts = dataBr.split('/');
  if (parts.length !== 3) return '';

  const [d, m] = parts.map(Number);

  if (!d || !m || m < 1 || m > 12) return '';

  const meses = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];

  return `${d} de ${meses[m - 1]}`;
}
export function planoAtivo(est: any): boolean {
  if (!est) return false;

  const agora = Date.now();

  const expira = est?.expiraEm?.toDate?.();

  const trialAtivo =
    est?.plano === 'trial' &&
    expira &&
    expira.getTime() > agora;

  const assinaturaAtiva = est?.assinaturaAtiva === true;

  return trialAtivo || assinaturaAtiva;
}
