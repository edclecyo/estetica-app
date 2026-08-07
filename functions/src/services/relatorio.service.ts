import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import PDFDocument from 'pdfkit';
import { randomUUID } from 'crypto';

import { db, bucket } from '../config/firebase';
import { REGION } from '../config/region';

const moeda = (v: number) =>
  `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

const dataBR = (d: Date) =>
  d.toLocaleDateString('pt-BR');

function parseDataBR(data: any) {
  if (data?.toDate) return data.toDate();
  if (data instanceof Date) return data;

  const texto = String(data || '').trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return new Date(texto);
  }

  const [dia, mes, ano] = texto.split('/').map(Number);
  return new Date(ano, mes - 1, dia);
}

function dataValida(data: Date) {
  return data instanceof Date && !Number.isNaN(data.getTime());
}

function normalizarPlano(est: any) {
  const candidatos = [
    est?.planoAprovado,
    est?.plano,
    est?.planoPendente,
  ].map(plano => String(plano || '').toLowerCase().trim());

  return candidatos.find(item =>
    ['elite', 'pro', 'essencial', 'trial'].includes(item)
  ) || '';
}

function assinaturaRelatorioAtiva(est: any) {
  const statusPagamento = String(est?.paymentStatus || '').toLowerCase();
  const statusPlano = String(est?.statusPlano || '').toLowerCase();

  return (
    est?.assinaturaAtiva === true ||
    statusPlano === 'ativo' ||
    ['approved', 'authorized', 'accredited'].includes(statusPagamento)
  );
}

export const gerarRelatorioFinanceiro = onCall(
  {
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 120,
  },

  async req => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const {
      estabelecimentoId,
      dataInicio,
      dataFim,
      periodoTipo,
    } = req.data || {};

    if (!estabelecimentoId || !dataInicio || !dataFim) {
      throw new HttpsError(
        'invalid-argument',
        'Estabelecimento, data inicial e data final são obrigatórios'
      );
    }

    const estRef = db.collection('estabelecimentos').doc(estabelecimentoId);
    const estSnap = await estRef.get();

    if (!estSnap.exists) {
      throw new HttpsError('not-found', 'Estabelecimento não encontrado');
    }

    const est = estSnap.data() as any;

    if (est.adminId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Sem permissão');
    }

    const plano = normalizarPlano(est);

    if (!['pro', 'elite'].includes(plano) || !assinaturaRelatorioAtiva(est)) {
      throw new HttpsError(
        'failed-precondition',
        'Relatório financeiro disponível apenas para planos Pro e Elite ativos'
      );
    }

    const inicio = parseDataBR(dataInicio);
    const fim = parseDataBR(dataFim);

    if (!dataValida(inicio) || !dataValida(fim)) {
      throw new HttpsError(
        'invalid-argument',
        'Use datas no formato DD/MM/AAAA'
      );
    }

    fim.setHours(23, 59, 59, 999);

    const snap = await db
      .collection('agendamentos')
      .where('adminId', '==', req.auth.uid)
      .where('estabelecimentoId', '==', estabelecimentoId)
      .limit(1000)
      .get();

    const agendamentos = snap.docs
      .map(d => ({ id: d.id, ...d.data() })) as any[];

    const filtrados = agendamentos.filter(a => {
      const dataAg = parseDataBR(a.data);
      if (!dataValida(dataAg)) return false;

      const statusOk =
        a.status === 'confirmado' ||
        a.status === 'concluido';

      return (
        statusOk &&
        dataAg >= inicio &&
        dataAg <= fim
      );
    });

    const cancelados = agendamentos.filter(a => {
      const dataAg = parseDataBR(a.data);
      if (!dataValida(dataAg)) return false;

      return (
        a.status === 'cancelado' &&
        dataAg >= inicio &&
        dataAg <= fim
      );
    });

    const receitaTotal = filtrados.reduce(
      (acc, a) => acc + Number(a.servicoPreco || 0),
      0
    );

    const porServico: Record<string, { qtd: number; total: number }> = {};
    const porDia: Record<string, { qtd: number; total: number }> = {};
    const porStatus: Record<string, number> = {};

    filtrados.forEach(a => {
      const nome = a.servicoNome || 'Serviço';
      if (!porServico[nome]) {
        porServico[nome] = { qtd: 0, total: 0 };
      }

      porServico[nome].qtd += 1;
      porServico[nome].total += Number(a.servicoPreco || 0);

      const dia = String(a.data || 'Sem data');
      if (!porDia[dia]) {
        porDia[dia] = { qtd: 0, total: 0 };
      }

      porDia[dia].qtd += 1;
      porDia[dia].total += Number(a.servicoPreco || 0);
    });

    agendamentos.forEach(a => {
      const dataAg = parseDataBR(a.data);
      if (!dataValida(dataAg)) return;

      if (dataAg < inicio || dataAg > fim) return;

      const status = String(a.status || 'sem_status');
      porStatus[status] = (porStatus[status] || 0) + 1;
    });

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));

    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc
      .fontSize(22)
      .text('Relatório Financeiro BeautyHub', { align: 'center' });

    doc.moveDown();

    doc
      .fontSize(12)
      .text(`Estabelecimento: ${est.nome || ''}`)
      .text(`Plano: ${plano.toUpperCase()}`)
      .text(`Tipo de periodo: ${String(periodoTipo || 'personalizado').toUpperCase()}`)
      .text(`Período: ${dataInicio} até ${dataFim}`)
      .text(`Gerado em: ${dataBR(new Date())}`);

    doc.moveDown();

    doc
      .fontSize(16)
      .text('Resumo por status', { underline: true });

    doc.moveDown(0.5);

    Object.entries(porStatus).forEach(([status, total]) => {
      doc
        .fontSize(11)
        .text(`${status.toUpperCase()} - ${total}`);
    });

    doc.moveDown();

    doc
      .fontSize(16)
      .text('Resumo por dia', { underline: true });

    doc.moveDown(0.5);

    Object.entries(porDia).forEach(([dia, item]) => {
      doc
        .fontSize(11)
        .text(`${dia} - ${item.qtd} atendimento(s) - ${moeda(item.total)}`);
    });

    doc.moveDown();

    doc
      .fontSize(16)
      .text('Resumo financeiro', { underline: true });

    doc.moveDown(0.5);

    doc
      .fontSize(12)
      .text(`Receita bruta no período: ${moeda(receitaTotal)}`)
      .text(`Agendamentos pagos/confirmados: ${filtrados.length}`)
      .text(`Agendamentos cancelados: ${cancelados.length}`)
      .text(`Ticket médio: ${moeda(filtrados.length ? receitaTotal / filtrados.length : 0)}`);

    doc.moveDown();

    doc
      .fontSize(16)
      .text('Resumo por serviço', { underline: true });

    doc.moveDown(0.5);

    Object.entries(porServico).forEach(([nome, item]) => {
      doc
        .fontSize(11)
        .text(`${nome} — ${item.qtd} atendimento(s) — ${moeda(item.total)}`);
    });

    doc.moveDown();

    if (plano === 'elite') {
      doc
        .fontSize(16)
        .text('Detalhamento Elite', { underline: true });

      doc.moveDown(0.5);

      filtrados.forEach(a => {
        doc
          .fontSize(10)
          .text(
            `${a.data} ${a.horario} | ${a.clienteNome || 'Cliente'} | ${a.servicoNome || ''} | ${moeda(a.servicoPreco || 0)} | ${a.formaPagamento || 'local'}`
          );
      });

      doc.moveDown();
    }

    doc
      .fontSize(9)
      .fillColor('#666')
      .text(
        'Este relatório é um resumo financeiro auxiliar gerado pelo BeautyHub. Para fins fiscais e declaração de imposto de renda, consulte seu contador.',
        { align: 'center' }
      );

    doc.end();

    const pdfBuffer = await pdfPromise;

    const nomeArquivo =
      `relatorios/${req.auth.uid}/${estabelecimentoId}_${Date.now()}.pdf`;

    const file = bucket.file(nomeArquivo);

    const downloadToken = randomUUID();

    await file.save(pdfBuffer, {
      resumable: false,
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const url =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
      `/o/${encodeURIComponent(nomeArquivo)}?alt=media&token=${downloadToken}`;

    await db.collection('relatoriosFinanceiros').add({
      adminId: req.auth.uid,
      estabelecimentoId,
      estabelecimentoNome: est.nome || '',
      plano,
      dataInicio,
      dataFim,
      periodoTipo: String(periodoTipo || 'personalizado'),
      receitaTotal,
      totalAgendamentos: filtrados.length,
      totalCancelados: cancelados.length,
      arquivoPath: nomeArquivo,
      criadoEm: FieldValue.serverTimestamp(),
      expiraUrlEm: Timestamp.fromDate(
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      ),
    });

    return {
      ok: true,
      url,
      receitaTotal,
      totalAgendamentos: filtrados.length,
      periodoTipo: String(periodoTipo || 'personalizado'),
      plano,
    };
  }
);
