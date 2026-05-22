import { HttpsError } from 'firebase-functions/v2/https';

function assertString(v: any, name: string) {
  if (typeof v !== 'string') {
    throw new HttpsError('invalid-argument', `${name} inválido`);
  }
  return v.trim();
}

export function gerarSlots(
  horarioInicial: string,
  duracaoMin: number,
  intervaloMin = 30
) {

  const slots: string[] = [];

  const [h, m] = horarioInicial.split(':').map(Number);

  let atual = h * 60 + m;

  const fim = atual + duracaoMin;

  while (atual < fim) {

    const hh = Math.floor(atual / 60);
    const mm = atual % 60;

    slots.push(
      `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    );

    atual += intervaloMin;
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

  const dataBase = new Date(Date.UTC(a, m - 1, d, 0, 0, 0, 0));

  if (
    dataBase.getUTCFullYear() !== a ||
    dataBase.getUTCMonth() !== m - 1 ||
    dataBase.getUTCDate() !== d
  ) {
    throw new HttpsError('invalid-argument', 'Data inexistente');
  }

  // Appointment dates are entered in Brazilian time (UTC-3).
  return new Date(Date.UTC(a, m - 1, d, h + 3, min, 0, 0));
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
