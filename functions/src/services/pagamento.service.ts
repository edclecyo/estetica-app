import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';
import { defineSecret } from 'firebase-functions/params';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

// ðŸ” SECRET
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

// =====================================================
// HELPERS
// =====================================================

function parseValor(valor: any): number {

  if (typeof valor === 'number') {
    return valor;
  }

  const n = Number(
    String(valor || 0)
      .replace(/\./g, '')
      .replace(',', '.')
  );

  return isNaN(n) ? 0 : n;
}

function tlv(id: string, valor: string) {
  const tamanho = String(valor.length).padStart(2, '0');
  return `${id}${tamanho}${valor}`;
}

function limparTextoPix(valor: any, max: number) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, max) || 'ESTABELECIMENTO';
}

function crc16(payload: string) {
  let crc = 0xffff;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;

    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000)
        ? (crc << 1) ^ 0x1021
        : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function gerarPixCopiaECola(params: {
  chave: string;
  nome: string;
  cidade?: string;
  valor: number;
  txid: string;
}) {
  const merchantAccount =
    tlv('00', 'br.gov.bcb.pix') +
    tlv('01', params.chave.trim());

  const txid = limparTextoPix(params.txid, 25).replace(/\s/g, '') || 'APP';

  const payload =
    tlv('00', '01') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', params.valor.toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', limparTextoPix(params.nome, 25)) +
    tlv('60', limparTextoPix(params.cidade || 'BRASIL', 15)) +
    tlv('62', tlv('05', txid));

  const payloadSemCrc = `${payload}6304`;
  return `${payloadSemCrc}${crc16(payloadSemCrc)}`;
}

const axiosInstance = axios.create({
  timeout: 20000,
});

// =====================================================
// 1. PIX CLIENTE
// =====================================================

export const criarPagamentoCliente = onCall(
  { region: REGION },

  async (req) => {

    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado'
      );
    }

    const { agendamentoId } = req.data || {};

    if (!agendamentoId) {
      throw new HttpsError(
        'invalid-argument',
        'ID obrigatÃ³rio'
      );
    }

    const agRef =
      db.collection('agendamentos')
        .doc(agendamentoId);

    const agSnap = await agRef.get();

    if (!agSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Agendamento nÃ£o encontrado'
      );
    }

    const ag = agSnap.data()!;

    const expiraPagamentoMs =
      ag.pagamentoExpiraEm?.toMillis?.() || 0;

    if (
      ag.status === 'cancelado' ||
      ag.statusPagamento === 'expired' ||
      (
        expiraPagamentoMs > 0 &&
        expiraPagamentoMs <= Date.now() &&
        ag.statusPagamento !== 'approved'
      )
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Esta reserva expirou. Escolha um novo horario para tentar novamente.'
      );
    }

    if (ag.clienteUid !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissÃ£o'
      );
    }

    const estabSnap =
      await db
        .collection('estabelecimentos')
        .doc(ag.estabelecimentoId)
        .get();

    const estab = estabSnap.data();

    if (!estab) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento nÃ£o encontrado'
      );
    }

    const formaPagamento =
      String(ag.formaPagamento || 'local');

    const pagamentoCompleto =
      formaPagamento === 'app';

    const pagamentoSinal =
      formaPagamento === 'sinal';

    if (!pagamentoCompleto && !pagamentoSinal) {
      throw new HttpsError(
        'failed-precondition',
        'Este agendamento nÃ£o possui pagamento online'
      );
    }

    if (
      pagamentoCompleto &&
      (
        !estab?.plano ||
        !['pro', 'elite'].includes(estab.plano)
      )
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Este estabelecimento nÃ£o aceita pagamento pelo app'
      );
    }

    if (
      pagamentoCompleto &&
      estab?.pagamentoAppAtivo !== true
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Pagamento pelo app indisponÃ­vel. O estabelecimento precisa configurar os dados PIX.'
      );
    }

    if (!estab?.pixChave) {
      throw new HttpsError(
        'failed-precondition',
        'Estabelecimento sem PIX cadastrado'
      );
    }

    if (!estab?.telefone) {
      throw new HttpsError(
        'failed-precondition',
        'Estabelecimento sem WhatsApp cadastrado'
      );
    }

    if (
      pagamentoSinal &&
      estab?.sinalFestivoAtivo !== true
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Sinal de reserva indisponÃ­vel para este estabelecimento'
      );
    }

    const valorServico =
      Number(ag.servicoPreco || 0);

    const valor =
      pagamentoSinal
        ? Number(ag.valorPagamento || valorServico * 0.5)
        : valorServico;

    const valorFinal = parseValor(valor);
    const valorRestante =
      pagamentoSinal
        ? Math.max(valorServico - valorFinal, 0)
        : 0;

    if (valorFinal <= 0) {
      throw new HttpsError(
        'failed-precondition',
        'Valor do pagamento invalido'
      );
    }

    const labelPagamento =
      pagamentoSinal
        ? 'Sinal de reserva de 50%'
        : 'PIX manual pelo app';

    const resumo =
`*COMPROVANTE DE AGENDAMENTO*

*Estabelecimento:* ${estab.nome || ag.estabelecimentoNome || ''}
*Cliente:* ${ag.clienteNome || ''}
*ServiÃ§o:* ${ag.servicoNome || ''}
*Data:* ${ag.data || ''}
*HorÃ¡rio:* ${ag.horario || ''}
*Valor do serviÃ§o:* R$ ${valorServico.toFixed(2).replace('.', ',')}
${pagamentoSinal
  ? `*Sinal pago agora (50%):* R$ ${valorFinal.toFixed(2).replace('.', ',')}
*Restante no dia:* R$ ${valorRestante.toFixed(2).replace('.', ',')}`
  : `*Valor pago:* R$ ${valorFinal.toFixed(2).replace('.', ',')}
*Restante:* R$ 0,00`}
*Forma de pagamento:* ${labelPagamento}

*ID do agendamento:* ${agendamentoId}

${pagamentoSinal
  ? 'O sinal confirma a reserva. Se precisar cancelar ou remarcar, avise o estabelecimento com antecedÃªncia. Em caso de ausÃªncia no dia, o sinal pode ficar com o estabelecimento pelo horÃ¡rio reservado.'
  : 'Pagamento completo realizado pelo app.'}

Ola, realizei o pagamento ${pagamentoSinal ? 'do sinal de reserva' : 'do agendamento'} via PIX direto para o estabelecimento. Segue o resumo; estou enviando o comprovante em anexo.`;

    const telefone =
      String(estab.telefone || '')
        .replace(/\D/g, '');

    const numeroFinal =
      telefone.startsWith('55')
        ? telefone
        : `55${telefone}`;

    const whatsappUrl =
      telefone
        ? `https://wa.me/${numeroFinal}?text=${encodeURIComponent(resumo)}`
        : '';

    const userSnap =
      await db.collection('users')
        .doc(req.auth.uid)
        .get();

    const user = userSnap.data() || {};

    const pixCopiaECola = gerarPixCopiaECola({
      chave: String(estab.pixChave || '').trim(),
      nome: estab.nome || ag.estabelecimentoNome || 'Estabelecimento',
      cidade: estab.cidade || 'Brasil',
      valor: valorFinal,
      txid: agendamentoId,
    });

    // âœ… marca geraÃ§Ã£o do pagamento
    await agRef.update({

      pixManualGerado: true,

      pixManualGeradoEm:
        FieldValue.serverTimestamp(),

      pixPagamentoId:
        FieldValue.delete(),

      pixChavePagamento:
        String(estab.pixChave || ''),

      pixQrCode: pixCopiaECola,

      pixQrCodeBase64:
        FieldValue.delete(),

      pixValor: valorFinal,

      statusPagamento:
        'aguardando_comprovante',

      atualizadoEm:
        FieldValue.serverTimestamp(),
    });

    await db.collection('pagamentos')
      .doc(`agendamento_${agendamentoId}`)
      .set({
      tipo: pagamentoSinal ? 'sinal_agendamento' : 'agendamento',
      agendamentoId,
      estabelecimentoId: ag.estabelecimentoId,
      adminId: ag.adminId || estab.adminId || null,
      clienteId: req.auth.uid,
      clienteEmail: req.auth.token.email || null,
      clienteNome: ag.clienteNome || user?.nome || '',
      valor: valorFinal,
      valorServico,
      percentualPagamento: pagamentoSinal ? 50 : 100,
      formaPagamento,
      status: 'aguardando_comprovante',
      metodo: 'pix',
      mercadoPagoId: null,
      pixChave: String(estab.pixChave || ''),
      pixCopiaECola,
      atualizadoEm: FieldValue.serverTimestamp(),
      criadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {

      ok: true,

      agendamentoId,

      pixChave: estab.pixChave || '',

      pixTipo:
        estab.pixTipo || 'aleatoria',

      valor: valorFinal,
      valorServico,
      percentualPagamento:
        pagamentoSinal ? 50 : 100,
      formaPagamento,

      estabelecimentoNome:
        estab.nome || '',

      servicoNome:
        ag.servicoNome || '',

      clienteNome:
        ag.clienteNome || '',

      data:
        ag.data || '',

      horario:
        ag.horario || '',

      resumo,

      whatsappUrl,
      whatsappNumber: numeroFinal,

      qr_code: pixCopiaECola,

      qr_code_base64: null,
    };
  }
);

export const confirmarPagamentoManual = onCall(
  { region: REGION },

  async req => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { agendamentoId } = req.data || {};

    if (!agendamentoId) {
      throw new HttpsError('invalid-argument', 'Agendamento obrigatÃ³rio');
    }

    const agRef = db.collection('agendamentos').doc(agendamentoId);
    const agSnap = await agRef.get();

    if (!agSnap.exists) {
      throw new HttpsError('not-found', 'Agendamento nÃ£o encontrado');
    }

    const ag = agSnap.data() as any;

    if (ag.adminId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Sem permissÃ£o');
    }

    if (
      ag.formaPagamento !== 'app' &&
      ag.formaPagamento !== 'sinal'
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Este agendamento nÃ£o Ã© pagamento pelo app'
      );
    }

    if (ag.statusPagamento === 'approved') {
      return {
        ok: true,
        status: 'confirmado',
        jaConfirmado: true,
      };
    }

    if (
      ag.status === 'cancelado' ||
      ag.statusPagamento === 'expired'
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Esta reserva ja foi cancelada ou expirou.'
      );
    }

    await agRef.update({
      status: 'confirmado',
      statusPagamento: 'approved',
      pixStatus: 'approved',
      pagamentoAprovadoId:
        ag.pixPagamentoId || agendamentoId,
      reservaTemporaria: false,
      pagamentoExpiraEm: FieldValue.delete(),

      pagamentoConfirmadoManual: true,
      pagamentoConfirmadoPor: req.auth.uid,
      pagamentoConfirmadoEm: FieldValue.serverTimestamp(),

      atualizadoEm: FieldValue.serverTimestamp(),
    });

    await db.collection('pagamentos')
      .doc(`agendamento_${agendamentoId}`)
      .set({
        status: 'approved',
        aprovadoManual: true,
        aprovadoPor: req.auth.uid,
        aprovadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });

    await db.collection('notificacoes').add({
      tipo: 'cliente',
      type: 'PAGAMENTO_CONFIRMADO',

      clienteId: ag.clienteUid,
      userId: ag.clienteUid,
      adminId: ag.adminId,

      agendamentoId,
      estabelecimentoId: ag.estabelecimentoId || '',
      estabelecimentoNome: ag.estabelecimentoNome || '',

      clienteNome: ag.clienteNome || '',
      servicoNome: ag.servicoNome || '',
      formaPagamento: ag.formaPagamento || '',

      titulo: ag.formaPagamento === 'sinal'
        ? 'Sinal confirmado'
        : 'Pagamento confirmado',
      mensagem: ag.formaPagamento === 'sinal'
        ? `Seu sinal de 50% foi confirmado e seu horÃ¡rio de ${ag.servicoNome || 'serviÃ§o'} estÃ¡ liberado. O restante deve ser pago no dia do atendimento.`
        : `Seu pagamento foi confirmado e seu horÃ¡rio de ${ag.servicoNome || 'serviÃ§o'} estÃ¡ liberado.`,

      lida: false,
      apagada: false,

      criadoEm: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      status: 'confirmado',
    };
  }
);
// =====================================================
// 2. PIX ASSINATURA
// =====================================================

export const criarPagamentoPixAssinatura = onCall(
  {
    region: REGION,
    secrets: [MP_ACCESS_TOKEN],
  },

  async (req) => {

    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado'
      );
    }

    const {
  estabelecimentoId,
  plano,
  valor,
} = req.data || {};

    if (
      !estabelecimentoId ||
      !plano ||
      !valor
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Dados invÃ¡lidos'
      );
    }

    const ref =
      db.collection('estabelecimentos')
        .doc(estabelecimentoId);

    const lockRef =
      db.collection('locks')
        .doc(`pix_assinatura_${estabelecimentoId}`);

    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento nÃ£o encontrado'
      );
    }

    const est = snap.data()!;

    if (est.adminId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissÃ£o'
      );
    }

    // ðŸ”¥ REMOVIDO:
    // NÃƒO PRECISA pixChave/pixTipo
    // pois o PIX Ã© da SUA conta Mercado Pago

    if (
      est.assinaturaAtiva &&
      est.plano === plano
    ) {
      throw new HttpsError(
        'already-exists',
        'Plano jÃ¡ ativo'
      );
    }

    // =====================================================
    // LOCK
    // =====================================================

    const lockSnap = await lockRef.get();

    if (lockSnap.exists) {

      const created =
        lockSnap.data()?.createdAt?.toMillis?.() || 0;

      if (Date.now() - created < 60000) {
        throw new HttpsError(
          'resource-exhausted',
          'Em processamento'
        );
      }

      await lockRef.delete();
    }

    await lockRef.set({
      createdAt: FieldValue.serverTimestamp(),
    });

    try {

      const accessToken =
        String(MP_ACCESS_TOKEN.value() || '').trim();

      if (!accessToken) {
        throw new HttpsError(
          'internal',
          'MP nÃ£o configurado'
        );
      }

      // =====================================================
      // USER
      // =====================================================

      const snapUser =
        await db.collection('users')
          .doc(req.auth.uid)
          .get();

      const user = snapUser.data();

      // =====================================================
      // MERCADO PAGO
      // =====================================================

      const response = await axiosInstance.post(
        'https://api.mercadopago.com/v1/payments',

        {
          transaction_amount: parseValor(valor),

          payment_method_id: 'pix',

          description: `Assinatura plano ${plano}`,

          external_reference: estabelecimentoId,

          notification_url:
            'https://webhookmercadopago-eoqa32y7ca-rj.a.run.app',

          payer: {

            email:
              user?.email ||
              req.auth.token.email ||
              'cliente@app.com',

            first_name:
              user?.nome || 'Cliente',

            identification: user?.cpf
              ? {
                  type: 'CPF',
                  number:
                    user.cpf.replace(/\D/g, ''),
                }
              : undefined,

            phone: user?.telefone
              ? {
                  number:
                    user.telefone.replace(/\D/g, ''),
                }
              : undefined,
          },
        },

        {
          headers: {
            Authorization: `Bearer ${accessToken}`,

            'X-Idempotency-Key':
              `pix_${estabelecimentoId}_${Date.now()}`
          },
        }
      );

      const data: any = response.data;

      const qr =
        data?.point_of_interaction
          ?.transaction_data;

      const qrBase64 =
        qr?.qr_code_base64 || null;

      const qrText =
        qr?.qr_code || null;

      if (!qrBase64 && !qrText) {
        throw new HttpsError(
          'internal',
          'PIX invÃ¡lido'
        );
      }

      // =====================================================
      // HISTÃ“RICO
      // =====================================================

      await db.collection('pagamentos').add({

        tipo: 'assinatura',

        estabelecimentoId,
        plano,

        valor: parseValor(valor),

        clienteId: req.auth.uid,

        clienteEmail:
          req.auth.token.email || null,

        clienteNome:
          user?.nome || 'Estabelecimento',

        status: 'pending',

        metodo: 'pix',

        mercadoPagoId: String(data.id),

        criadoEm:
          FieldValue.serverTimestamp(),
      });

      // =====================================================
      // EXPIRAÃ‡ÃƒO
      // =====================================================

      const expira = new Date();

      expira.setMinutes(
        expira.getMinutes() + 30
      );

      // =====================================================
      // FIRESTORE
      // =====================================================

      await ref.update({

  planoPendente: plano,

  paymentStatus: 'pending',

  paymentType: 'pix',

  pixPagamentoId:
    String(data?.id),

  pixQrCode: qrText,

  pixQrCodeBase64: qrBase64,

  pixCriadoEm:
    FieldValue.serverTimestamp(),

  pixExpiraEm:
    Timestamp.fromDate(expira),

  atualizadoEm:
    FieldValue.serverTimestamp(),
});
      await lockRef.delete();

      return {
        qr_code: qrText,
        qr_code_base64: qrBase64,
      };

    } catch (error: any) {

      console.error(
        'ERRO PIX:',
        error?.response?.data || error
      );

      await lockRef.delete();

      throw new HttpsError(
        'internal',
        'Erro ao criar PIX'
      );
    }
  }
);
// =====================================================
// 6. PIX IMPULSIONAMENTO / DESTAQUE
// =====================================================

export const criarPagamentoPixImpulsionamento = onCall(
  {
    region: REGION,
    secrets: [MP_ACCESS_TOKEN],
  },

  async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado'
      );
    }

    const {
      estabelecimentoId,
      pacoteId,
    } = req.data || {};

    if (!estabelecimentoId || !pacoteId) {
      throw new HttpsError(
        'invalid-argument',
        'Dados invÃ¡lidos'
      );
    }

    const PACOTES: Record<string, {
      nome: string;
      valor: number;
      dias: number;
    }> = {
      destaque_1d: {
        nome: 'Destaque 24 horas',
        valor: 5,
        dias: 1,
      },
      destaque_3d: {
        nome: 'Destaque 3 dias',
        valor: 12,
        dias: 3,
      },
      destaque_7d: {
        nome: 'Destaque 7 dias',
        valor: 25,
        dias: 7,
      },
    };

    const pacote = PACOTES[pacoteId];

    if (!pacote) {
      throw new HttpsError(
        'invalid-argument',
        'Pacote invÃ¡lido'
      );
    }

    const ref = db
      .collection('estabelecimentos')
      .doc(estabelecimentoId);

    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento nÃ£o encontrado'
      );
    }

    const est = snap.data()!;

    if (est.adminId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissÃ£o'
      );
    }

    const agora = new Date();
    const destaqueExpira =
      est.destaqueExpira?.toDate?.() || null;

    const destaqueAtivo =
      est.destaqueAtivo === true &&
      destaqueExpira instanceof Date &&
      destaqueExpira > agora;

    const destaqueRenovavel =
      destaqueAtivo &&
      destaqueExpira.getTime() - agora.getTime() <=
        2 * 60 * 60 * 1000;

    const pacoteAtivoId = String(
      est.destaquePacoteId || ''
    ).trim();

    if (
      destaqueAtivo &&
      !destaqueRenovavel &&
      pacoteAtivoId === pacoteId
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Este pacote de impulsionamento ja esta ativo.'
      );
    }

    const pendente = est.impulsionamentoPendente || null;
    const pendenteExpira =
      pendente?.expiraEm?.toDate?.() || null;

    if (
      pendente?.status === 'pending' &&
      pendente?.pacoteId === pacoteId &&
      pendenteExpira instanceof Date &&
      pendenteExpira > agora
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Ja existe um PIX valido para este pacote.'
      );
    }

    const lockRef = db
      .collection('locks')
      .doc(`pix_impulsionamento_${estabelecimentoId}`);

    const lockSnap = await lockRef.get();

    if (lockSnap.exists) {
      const created =
        lockSnap.data()?.createdAt?.toMillis?.() || 0;

      if (Date.now() - created < 60000) {
        throw new HttpsError(
          'resource-exhausted',
          'Em processamento'
        );
      }

      await lockRef.delete();
    }

    await lockRef.set({
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      const accessToken =
        String(MP_ACCESS_TOKEN.value() || '').trim();

      if (!accessToken) {
        throw new HttpsError(
          'internal',
          'MP nÃ£o configurado'
        );
      }

      const userSnap = await db
        .collection('users')
        .doc(req.auth.uid)
        .get();

      const user = userSnap.data();

      const response = await axiosInstance.post(
        'https://api.mercadopago.com/v1/payments',
        {
          transaction_amount: pacote.valor,
          payment_method_id: 'pix',
          description: `Impulsionamento - ${pacote.nome}`,
          external_reference: estabelecimentoId,
          notification_url:
            'https://webhookmercadopago-eoqa32y7ca-rj.a.run.app',

          payer: {
            email:
              user?.email ||
              req.auth.token.email ||
              est.responsavelEmail ||
              'cliente@app.com',

            first_name:
              user?.nome ||
              est.responsavelNome ||
              'Cliente',

            identification: user?.cpf
              ? {
                  type: 'CPF',
                  number: String(user.cpf).replace(/\D/g, ''),
                }
              : est.responsavelCpf
              ? {
                  type: 'CPF',
                  number: String(est.responsavelCpf).replace(/\D/g, ''),
                }
              : undefined,

            phone: user?.telefone
              ? {
                  number: String(user.telefone).replace(/\D/g, ''),
                }
              : est.responsavelTelefone
              ? {
                  number: String(est.responsavelTelefone).replace(/\D/g, ''),
                }
              : undefined,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Idempotency-Key':
              `imp_${estabelecimentoId}_${pacoteId}_${Date.now()}`,
          },
        }
      );

      const data: any = response.data;

      const qr =
        data?.point_of_interaction
          ?.transaction_data;

      const qrBase64 =
        qr?.qr_code_base64 || null;

      const qrText =
        qr?.qr_code || null;

      if (!qrBase64 && !qrText) {
        throw new HttpsError(
          'internal',
          'PIX invÃ¡lido'
        );
      }

      const expira = new Date();
      expira.setMinutes(expira.getMinutes() + 30);

      const pagamentoRef = await db
        .collection('pagamentos')
        .add({
          tipo: 'impulsionamento',

          estabelecimentoId,
          pacoteId,
          pacoteNome: pacote.nome,
          dias: pacote.dias,

          valor: pacote.valor,

          clienteId: req.auth.uid,
          clienteEmail: req.auth.token.email || null,
          clienteNome:
            user?.nome ||
            est.responsavelNome ||
            'Estabelecimento',

          status: 'pending',
          metodo: 'pix',
          mercadoPagoId: String(data.id),

          qrCode: qrText,
          qrCodeBase64: qrBase64,

          criadoEm: FieldValue.serverTimestamp(),
          expiraEm: Timestamp.fromDate(expira),
        });

      await ref.update({
        impulsionamentoPendente: {
          pagamentoDocId: pagamentoRef.id,
          mercadoPagoId: String(data.id),
          pacoteId,
          pacoteNome: pacote.nome,
          dias: pacote.dias,
          valor: pacote.valor,
          status: 'pending',
          criadoEm: FieldValue.serverTimestamp(),
          expiraEm: Timestamp.fromDate(expira),
        },

        atualizadoEm: FieldValue.serverTimestamp(),
      });

      await lockRef.delete();

      return {
        qr_code: qrText,
        qr_code_base64: qrBase64,
        pagamentoId: pagamentoRef.id,
        mercadoPagoId: String(data.id),
      };
    } catch (error: any) {
      console.error(
        'ERRO PIX IMPULSIONAMENTO:',
        error?.response?.data || error
      );

      await lockRef.delete();

      throw new HttpsError(
        'internal',
        'Erro ao criar PIX de impulsionamento'
      );
    }
  }
);
// =====================================================
// 5. PIX TAXA SELO VERIFICADO
// =====================================================

export const criarPagamentoPixSelo = onCall(
  {
    region: REGION,
    secrets: [MP_ACCESS_TOKEN],
  },

  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { solicitacaoId } = req.data || {};

    if (!solicitacaoId) {
      throw new HttpsError('invalid-argument', 'Solicitacao obrigatoria');
    }

    const solicitacaoRef = db
      .collection('solicitacoesVerificacao')
      .doc(solicitacaoId);

    const solicitacaoSnap = await solicitacaoRef.get();

    if (!solicitacaoSnap.exists) {
      throw new HttpsError('not-found', 'Solicitacao nao encontrada');
    }

    const solicitacao = solicitacaoSnap.data()!;

    if (solicitacao.adminId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Sem permissao');
    }

    if (solicitacao.status !== 'aprovado') {
      throw new HttpsError('failed-precondition', 'Solicitacao ainda nao aprovada');
    }

    if (solicitacao.pago === true) {
      throw new HttpsError('failed-precondition', 'Taxa ja paga');
    }

    const estabelecimentoId = solicitacao.estabelecimentoId;

    if (!estabelecimentoId) {
      throw new HttpsError('invalid-argument', 'Estabelecimento invalido');
    }

    const estRef = db
      .collection('estabelecimentos')
      .doc(estabelecimentoId);

    const estSnap = await estRef.get();

    if (!estSnap.exists) {
      throw new HttpsError('not-found', 'Estabelecimento nao encontrado');
    }

    const est = estSnap.data()!;

    if (est.adminId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Sem permissao');
    }

    const pendenteExpira =
      solicitacao.pixExpiraEm?.toDate?.() || null;

    if (
      solicitacao.pagamentoStatus === 'pending' &&
      solicitacao.pixQrCode &&
      pendenteExpira instanceof Date &&
      pendenteExpira > new Date()
    ) {
      return {
        qr_code: solicitacao.pixQrCode,
        qr_code_base64: solicitacao.pixQrCodeBase64 || null,
      };
    }

    const accessToken = String(MP_ACCESS_TOKEN.value() || '').trim();

    if (!accessToken) {
      throw new HttpsError('internal', 'MP nao configurado');
    }

    try {
      const response = await axiosInstance.post(
        'https://api.mercadopago.com/v1/payments',
        {
          transaction_amount: 14.9,
          payment_method_id: 'pix',
          description: `Taxa selo verificado - ${est.nome || 'BeautyHub'}`,
          external_reference: solicitacaoId,
          notification_url:
            'https://webhookmercadopago-eoqa32y7ca-rj.a.run.app',
          payer: {
            email:
              req.auth.token.email ||
              est.responsavelEmail ||
              'cliente@app.com',
            first_name:
              est.responsavelNome ||
              est.nome ||
              'Cliente',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Idempotency-Key': `selo_${solicitacaoId}_${Date.now()}`,
          },
        }
      );

      const data: any = response.data;
      const qr = data?.point_of_interaction?.transaction_data;
      const qrBase64 = qr?.qr_code_base64 || null;
      const qrText = qr?.qr_code || null;

      if (!qrBase64 && !qrText) {
        throw new HttpsError('internal', 'PIX invalido');
      }

      const expira = new Date();
      expira.setMinutes(expira.getMinutes() + 30);

      const pagamentoRef = await db
        .collection('pagamentos')
        .add({
          tipo: 'selo',
          solicitacaoId,
          estabelecimentoId,
          estabelecimentoNome:
            est.nome || solicitacao.estabelecimentoNome || '',
          valor: 14.9,
          clienteId: req.auth.uid,
          clienteEmail: req.auth.token.email || null,
          status: 'pending',
          metodo: 'pix',
          mercadoPagoId: String(data.id),
          qrCode: qrText,
          qrCodeBase64: qrBase64,
          criadoEm: FieldValue.serverTimestamp(),
          expiraEm: Timestamp.fromDate(expira),
        });

      await solicitacaoRef.update({
        pagamentoDocId: pagamentoRef.id,
        pagamentoStatus: 'pending',
        pixPagamentoId: String(data.id),
        pixQrCode: qrText,
        pixQrCodeBase64: qrBase64,
        pixCriadoEm: FieldValue.serverTimestamp(),
        pixExpiraEm: Timestamp.fromDate(expira),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      return {
        qr_code: qrText,
        qr_code_base64: qrBase64,
      };
    } catch (error: any) {
      console.error('ERRO PIX SELO:', error?.response?.data || error);

      throw new HttpsError('internal', 'Erro ao criar PIX do selo');
    }
  }
);

// =====================================================
// 3. CARTÃƒO ASSINATURA
// =====================================================

export const criarAssinaturaCartao = onCall(
  {
    region: REGION,
    secrets: [MP_ACCESS_TOKEN],
  },

  async (req) => {

    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado.'
      );
    }

    const {
  estabelecimentoId,
  plano,
  email,
  token,
  valor,
  payment_method_id,
} = req.data || {};

    if (
      !estabelecimentoId ||
      !plano ||
      !email ||
      !token
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Dados insuficientes.'
      );
    }

    const ref =
      db.collection('estabelecimentos')
        .doc(estabelecimentoId);

    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento nÃ£o encontrado.'
      );
    }

    const est = snap.data()!;

    if (est.adminId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissÃ£o.'
      );
    }

    if (
      est.assinaturaAtiva &&
      est.plano === plano
    ) {
      throw new HttpsError(
        'already-exists',
        'Plano jÃ¡ ativo.'
      );
    }

    try {

      const accessToken =
        MP_ACCESS_TOKEN.value();

      if (!accessToken) {
        throw new HttpsError(
          'internal',
          'MP nÃ£o configurado.'
        );
      }

      const valorFinal =
        parseValor(valor);

      const response =
        await axiosInstance.post(

          'https://api.mercadopago.com/v1/payments',

          {
            transaction_amount: valorFinal,

            token,

            description:
              `Assinatura Plano ${plano}`,

            installments: 1,

            payment_method_id,

            payer: {

              email:
                est.responsavelEmail || email,

              first_name:
                est.responsavelNome || 'ResponsÃ¡vel',

              identification:
                est.responsavelCpf
                  ? {
                      type: 'CPF',
                      number:
                        est.responsavelCpf
                          .replace(/\D/g, ''),
                    }
                  : undefined,

              phone:
                est.responsavelTelefone
                  ? {
                      number:
                        est.responsavelTelefone
                          .replace(/\D/g, ''),
                    }
                  : undefined,
            },

            external_reference:
              estabelecimentoId,

            notification_url:
              'https://webhookmercadopago-eoqa32y7ca-rj.a.run.app',
          },

          {
            headers: {

              Authorization:
                `Bearer ${accessToken}`,

              'X-Idempotency-Key':
                `card_${estabelecimentoId}_${Date.now()}`,
            },
          }
        );

      const data: any = response.data;

      const aprovado =
        data.status === 'approved' ||
        data.status === 'authorized';

      await db.collection('pagamentos').add({
        tipo: 'assinatura',
        estabelecimentoId,
        plano,
        valor: valorFinal,
        clienteId: req.auth.uid,
        clienteEmail: req.auth.token.email || email,
        clienteNome:
          est.nome ||
          est.responsavelNome ||
          'Estabelecimento',
        status: data.status || 'pending',
        statusDetail: data.status_detail || null,
        metodo: 'credit_card',
        mercadoPagoId: String(data.id),
        criadoEm: FieldValue.serverTimestamp(),
        ...(aprovado && {
          aprovadoEm: FieldValue.serverTimestamp(),
        }),
      });

      // =====================================================
      // FIRESTORE
      // =====================================================

      await ref.update({

  planoPendente: plano,

  paymentStatus:
    data.status || 'pending',

  paymentType: 'credit_card',

  pagamentoId:
    String(data.id),

  atualizadoEm:
    FieldValue.serverTimestamp(),

  statusDetail:
    data.status_detail || null,

  ...(aprovado && {

    plano,

    planoAprovado: plano,

    planoPendente: FieldValue.delete(),

    assinaturaAtiva: true,

    statusPlano: 'ativo',

    paymentStatus: 'approved',

    expiraEm: Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    ),
  }),
});

      return {

        success: true,

        status: data.status,

        id: data.id,

        detail:
          data.status_detail
      };

    } catch (error: any) {

      console.error(
        'ERRO MP:',
        error?.response?.data || error
      );

      throw new HttpsError(
        'internal',
        'Erro ao processar pagamento.'
      );
    }
  }
);
