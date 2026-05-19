import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import PDFDocument from 'pdfkit';

import { db, bucket } from '../config/firebase';
import { REGION } from '../config/region';

const moeda = (v: number) =>
  `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

const dataBR = (d: Date) =>
  d.toLocaleDateString('pt-BR');

function parseDataBR(data: string) {
  const [dia, mes, ano] = String(data).split('/').map(Number);
  return new Date(ano, mes - 1, dia);
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

    const plano = String(est.plano || '');

    if (!['pro', 'elite'].includes(plano) || est.assinaturaAtiva !== true) {
      throw new HttpsError(
        'failed-precondition',
        'Relatório financeiro disponível apenas para planos Pro e Elite ativos'
      );
    }

    const inicio = parseDataBR(dataInicio);
    const fim = parseDataBR(dataFim);
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

    filtrados.forEach(a => {
      const nome = a.servicoNome || 'Serviço';
      if (!porServico[nome]) {
        porServico[nome] = { qtd: 0, total: 0 };
      }

      porServico[nome].qtd += 1;
      porServico[nome].total += Number(a.servicoPreco || 0);
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
      .text(`Período: ${dataInicio} até ${dataFim}`)
      .text(`Gerado em: ${dataBR(new Date())}`);

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

    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
      },
    });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });

    await db.collection('relatoriosFinanceiros').add({
      adminId: req.auth.uid,
      estabelecimentoId,
      estabelecimentoNome: est.nome || '',
      plano,
      dataInicio,
      dataFim,
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
      plano,
    };
  }
);