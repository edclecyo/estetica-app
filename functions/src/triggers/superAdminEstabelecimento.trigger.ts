import {
  onDocumentCreated,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

type EventoSuperAdmin = {
  key: string;
  type: string;
  titulo: string;
  mensagem: string;
};

const PLANOS_PAGOS = ['essencial', 'pro', 'elite'];

function getMillis(valor: any): number {
  return valor?.toMillis?.() || 0;
}

function getNome(estab: any): string {
  return String(estab?.nome || 'Um estabelecimento').trim();
}

function getPlano(estab: any): string {
  return String(estab?.plano || estab?.planoAprovado || 'free').trim();
}

function pagamentoLabel(estab: any): string {
  const tipo = String(estab?.paymentType || '').toLowerCase();

  if (tipo === 'credit_card') return 'cartao';
  if (tipo === 'pix') return 'PIX';

  return 'pagamento';
}

function planoPagoAtivo(estab: any): boolean {
  return estab?.assinaturaAtiva === true &&
    PLANOS_PAGOS.includes(getPlano(estab));
}

async function notificarSuperAdmins(
  estabelecimentoId: string,
  estab: any,
  evento: EventoSuperAdmin
) {
  const superAdmins = await db
    .collection('admins')
    .where('cargo', '==', 'Super Admin')
    .get();

  const destinatarios = superAdmins.docs.filter(
    doc => doc.data()?.ativo !== false
  );

  if (destinatarios.length === 0) return;

  const batch = db.batch();
  const expiraEm = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

  destinatarios.forEach(doc => {
    const notifRef = db
      .collection('notificacoes')
      .doc(`superadmin_${doc.id}_${evento.key}`);

    batch.set(notifRef, {
      tipo: 'admin',
      type: evento.type,
      eventoSuperAdmin: true,

      adminId: doc.id,
      userId: doc.id,
      clienteId: null,

      estabelecimentoId,
      estabelecimentoNome: getNome(estab),
      plano: getPlano(estab),
      paymentType: estab?.paymentType || null,

      titulo: evento.titulo,
      mensagem: evento.mensagem,

      lida: false,
      apagada: false,
      dedupeKey: `${evento.key}:${doc.id}`,

      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      expiraEm,
    }, { merge: true });
  });

  await batch.commit();
}

export const onEstabelecimentoCriadoSuperAdmin = onDocumentCreated(
  {
    document: 'estabelecimentos/{estabelecimentoId}',
    region: REGION,
  },
  async event => {
    const estab = event.data?.data();
    const estabelecimentoId = event.params.estabelecimentoId;

    if (!estab || estab.ativo === false) return;

    await notificarSuperAdmins(estabelecimentoId, estab, {
      key: `estab_${estabelecimentoId}_criado`,
      type: 'SUPERADMIN_ESTAB_CRIADO',
      titulo: 'Novo estabelecimento ativo',
      mensagem:
        `${getNome(estab)} foi cadastrado e entrou como ` +
        'estabelecimento ativo no app.',
    });
  }
);

export const onEstabelecimentoAtualizadoSuperAdmin = onDocumentUpdated(
  {
    document: 'estabelecimentos/{estabelecimentoId}',
    region: REGION,
  },
  async event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const estabelecimentoId = event.params.estabelecimentoId;

    if (!before || !after) return;

    const eventos: EventoSuperAdmin[] = [];
    const expiraAntes = getMillis(before.expiraEm);
    const expiraDepois = getMillis(after.expiraEm);
    const destaqueAntes = getMillis(before.destaqueExpira);
    const destaqueDepois = getMillis(after.destaqueExpira);
    const planoAntes = getPlano(before);
    const planoDepois = getPlano(after);
    const mudancaId = String(event.id || 'mudanca')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    if (before.ativo !== true && after.ativo === true) {
      eventos.push({
        key: `estab_${estabelecimentoId}_ativado_${mudancaId}`,
        type: 'SUPERADMIN_ESTAB_ATIVADO',
        titulo: 'Estabelecimento ativado',
        mensagem: `${getNome(after)} foi ativado no app.`,
      });
    }

    if (before.ativo === true && after.ativo === false) {
      eventos.push({
        key: `estab_${estabelecimentoId}_desativado_${mudancaId}`,
        type: 'SUPERADMIN_ESTAB_DESATIVADO',
        titulo: 'Estabelecimento desativado',
        mensagem: `${getNome(after)} foi desativado no app.`,
      });
    }

    if (before.plano !== 'trial' && after.plano === 'trial') {
      eventos.push({
        key: `estab_${estabelecimentoId}_trial_${expiraDepois}`,
        type: 'SUPERADMIN_TRIAL_ATIVADO',
        titulo: 'Trial ativado',
        mensagem:
          `${getNome(after)} ativou o periodo de teste do app.`,
      });
    }

    if (
      planoPagoAtivo(after) &&
      expiraDepois > expiraAntes &&
      after.paymentStatus === 'approved'
    ) {
      const renovacao =
        planoPagoAtivo(before) &&
        planoAntes === planoDepois;

      const trocouPlano =
        planoPagoAtivo(before) &&
        planoAntes !== planoDepois;

      eventos.push({
        key:
          `estab_${estabelecimentoId}_plano_` +
          `${planoDepois}_${expiraDepois}`,
        type: renovacao
          ? 'SUPERADMIN_PLANO_RENOVADO'
          : 'SUPERADMIN_PLANO_ASSINADO',
        titulo: renovacao
          ? 'Plano renovado'
          : trocouPlano
            ? 'Plano alterado'
            : 'Novo plano assinado',
        mensagem:
          `${getNome(after)} ${renovacao ? 'renovou' : 'ativou'} ` +
          `o plano ${planoDepois.toUpperCase()} via ` +
          `${pagamentoLabel(after)}.`,
      });
    }

    if (
      after.destaqueAtivo === true &&
      destaqueDepois > destaqueAntes &&
      after.destaqueOrigem === 'impulsionamento'
    ) {
      eventos.push({
        key:
          `estab_${estabelecimentoId}_impulsionamento_` +
          `${destaqueDepois}`,
        type: 'SUPERADMIN_IMPULSIONAMENTO_ATIVADO',
        titulo: 'Impulsionamento ativado',
        mensagem:
          `${getNome(after)} ativou ` +
          `${String(after.destaquePacoteNome || 'um impulsionamento')}.`,
      });
    }

    for (const evento of eventos) {
      await notificarSuperAdmins(estabelecimentoId, after, evento);
    }
  }
);
