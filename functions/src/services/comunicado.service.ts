import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

export const enviarComunicadoSuperAdmin = onCall(
  { region: REGION },

  async req => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const {
      titulo,
      mensagem,
      destino = 'todos',
      planoFiltro,
    } = req.data || {};

    const tituloFinal = String(titulo || '').trim();
    const mensagemFinal = String(mensagem || '').trim();

    if (!tituloFinal || !mensagemFinal) {
      throw new HttpsError(
        'invalid-argument',
        'Título e mensagem obrigatórios'
      );
    }

    const adminSnap = await db
      .collection('admins')
      .doc(req.auth.uid)
      .get();

    if (adminSnap.data()?.cargo !== 'Super Admin') {
      throw new HttpsError(
        'permission-denied',
        'Apenas Super Admin pode enviar comunicados'
      );
    }

    if (destino === 'plano' && !planoFiltro) {
      throw new HttpsError(
        'invalid-argument',
        'Plano obrigatório'
      );
    }

    const estabsSnap = await db
      .collection('estabelecimentos')
      .get();

    const adminIds = new Set<string>();

    estabsSnap.docs.forEach(doc => {
      const e = doc.data() as any;

      const planoAtual =
        e.plano || e.planoAprovado || 'free';

      const estabelecimentoValido =
        e.ativo !== false &&
        !!e.adminId;

      if (!estabelecimentoValido) {
        return;
      }

      if (destino === 'plano') {
        if (planoAtual === planoFiltro) {
          adminIds.add(String(e.adminId));
        }

        return;
      }

      adminIds.add(String(e.adminId));
    });

    const destinatarios = Array.from(adminIds);

    if (destinatarios.length === 0) {
      throw new HttpsError(
        'not-found',
        destino === 'plano'
          ? `Nenhum estabelecimento válido encontrado no plano ${String(planoFiltro || '').toUpperCase()}`
          : 'Nenhum estabelecimento válido encontrado'
      );
    }

    const batch = db.batch();

    let total = 0;

    for (const adminId of destinatarios) {
      const notifRef = db.collection('notificacoes').doc();

      batch.set(notifRef, {
        tipo: 'admin',
        type: 'COMUNICADO',

        adminId,
        userId: adminId,
        clienteId: null,

        titulo: tituloFinal,
        mensagem: mensagemFinal,

        lida: false,
        apagada: false,

        criadoEm: FieldValue.serverTimestamp(),
      });

      total++;
    }

    const comunicadoRef = db.collection('comunicados').doc();

    batch.set(comunicadoRef, {
      titulo: tituloFinal,

      // mantém só um campo principal correto
      mensagem: mensagemFinal,

      destino,
      planoFiltro: destino === 'plano' ? planoFiltro : null,

      totalEnviados: total,
      criadoPor: req.auth.uid,
      criadoEm: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return {
      ok: true,
      totalEnviados: total,
    };
  }
);