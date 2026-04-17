import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Converte strings de data (DD/MM/AAAA) e horário (HH:mm) em um objeto Date.
 * Garante que a data seja tratada corretamente no fuso horário de Brasília.
 */
export function parseDataHoraBR(data: string, horario: string): Date {
  const [d, m, a] = data.split('/').map(Number);
  const [h, min] = horario.split(':').map(Number);

  const invalid =
    isNaN(d) || isNaN(m) || isNaN(a) ||
    isNaN(h) || isNaN(min);

  if (invalid) {
    throw new HttpsError('invalid-argument', 'Formato de data ou horário inválido.');
  }

  // Criamos a data usando o fuso local (que no servidor será UTC)
  const date = new Date(a, m - 1, d, h, min);

  /**
   * Validação de data lógica estrita:
   * Evita que o JS converta "31/04" em "01/05" automaticamente.
   */
  if (
    date.getFullYear() !== a ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    throw new HttpsError('invalid-argument', 'A data fornecida é inexistente no calendário.');
  }

  if (isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'Data ou horário inválidos.');
  }

  return date;
}

/**
 * Formata um valor numérico para Moeda Brasileira (R$).
 */
export function formatarMoeda(valor: number): string {
  // Garantimos que o valor seja tratado como número
  const num = typeof valor === 'number' ? valor : Number(valor || 0);
  
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Utilitário extra: Formata data para exibição amigável (Ex: 15 de Abril)
 */
export function formatarDataExtenso(dataBr: string): string {
  const [d, m, a] = dataBr.split('/').map(Number);
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return `${d} de ${meses[m - 1]}`;
}