import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

const AVISO_ANTECEDENCIA_MS = 2 * 60 * 60 * 1000;

export const avisarDestaqueVencendo = onSchedule(
  {
    region: REGION,
    schedule: 'every 30 minutes',
    timeZone: 'America/Sao_Paulo',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const agora = new Date();
    const limiteAviso = new Date(
      agora.getTime() + AVISO_ANTECEDENCIA_MS
    );

    const snap = await db
      .collection('estabelecimentos')
      .where('destaqueAtivo', '==', true)
      .limit(200)
      .get();

    if (snap.empty) {
      console.log('Nenhum destaque ativo para avisar.');
      return;
    }

    const batch = db.batch();
    const expiraNotificacao = Timestamp.fromDate(
      new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000)
    );

    let total = 0;
    let expirados = 0;

    for (const doc of snap.docs) {
      const est = doc.data() as any;
      const destaqueExpira = est.destaqueExpira?.toDate?.();

      if (destaqueExpira && destaqueExpira <= agora) {
        batch.update(doc.ref, {
          destaqueAtivo: false,
          atualizadoEm: FieldValue.serverTimestamp(),
        });

        expirados++;
        continue;
      }

      if (
        !destaqueExpira ||
        destaqueExpira > limiteAviso ||
        !est.adminId
      ) {
        continue;
      }

      const vencimentoAvisado =
        est.destaqueAvisoVencimentoExpiraEm?.toMillis?.() || 0;

      if (vencimentoAvisado === destaqueExpira.getTime()) {
        continue;
      }

      const nomeEstabelecimento =
        String(est.nome || 'Seu estabelecimento').trim();

      batch.set(db.collection('notificacoes').doc(), {
        tipo: 'admin',
        adminId: est.adminId,
        userId: est.adminId,
        clienteId: null,

        titulo: 'Seu destaque esta chegando ao fim',
        mensagem:
          `${nomeEstabelecimento} segue em evidencia no BeautyHub. ` +
          'Renove seu impulsionamento para continuar aparecendo ' +
          'com prioridade para novos clientes.',

        estabelecimentoId: doc.id,
        estabelecimentoNome: nomeEstabelecimento,
        pacoteId: est.destaquePacoteId || '',
        tela: 'impulsionar',
        type: 'IMPULSIONAMENTO_VENCENDO',

        lida: false,
        apagada: false,
        dedupeKey:
          `impulsionamento:${doc.id}:vencendo:${destaqueExpira.getTime()}`,

        criadoEm: FieldValue.serverTimestamp(),
        expiraEm: expiraNotificacao,
      });

      batch.update(doc.ref, {
        destaqueAvisoVencimentoEm: FieldValue.serverTimestamp(),
        destaqueAvisoVencimentoExpiraEm:
          Timestamp.fromDate(destaqueExpira),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      total++;
    }

    if (total > 0 || expirados > 0) {
      await batch.commit();
    }

    console.log(
      `${total} avisos de vencimento de destaque criados; ` +
      `${expirados} destaques expirados desativados`
    );
  }
);
