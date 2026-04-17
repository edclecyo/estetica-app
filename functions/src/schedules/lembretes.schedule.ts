import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore'; // Importação limpa
import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { enviarPush } from '../services/notificacao.service';

export const lembreteAgendamento = onSchedule(
  { 
    region: REGION, 
    schedule: "every 2 hours",
    memory: "256MiB" // Otimização de custo para funções simples
  },
  async () => {
    // Usando o Timestamp importado diretamente
    const agora = Timestamp.now(); 

    const snap = await db.collection('agendamentos')
      .where('notificado', '==', false)
      .where('notificarEm', '<=', agora)
      .where('status', '==', 'confirmado')
      .limit(200)
      .get();

    if (snap.empty) {
      console.log("Subprocesso de lembretes: Nenhum agendamento para notificar.");
      return;
    }

    const batch = db.batch();
    const promises: Promise<any>[] = [];
    
    // Calculando expiração (30 dias à frente)
    const expiraData = new Date();
    expiraData.setDate(expiraData.getDate() + 30);
    const expiraNotificacao = Timestamp.fromDate(expiraData);

    for (const doc of snap.docs) {
      const agend = doc.data();
      const notifRef = db.collection('notificacoes').doc();

      batch.set(notifRef, {
        clienteId: agend.clienteUid,
        titulo: '⏰ Horário chegando!',
        mensagem: `Lembrete: ${agend.servicoNome} às ${agend.horario}`,
        agendamentoId: doc.id,
        collection: 'agendamentos',
        lida: false,
        criadoEm: FieldValue.serverTimestamp(), // Usando FieldValue limpo
        expiraEm: expiraNotificacao
      });

      batch.update(doc.ref, { notificado: true });

      if (agend.fcmTokenCliente) {
        promises.push(
          enviarPush(
            agend.fcmTokenCliente,
            '⏰ Horário chegando!',
            `${agend.servicoNome} às ${agend.horario}`
          )
        );
      }
    }

    // Executa as operações de banco
    await batch.commit();
    
    // Aguarda os envios de push (allSettled garante que se um falhar, os outros continuam)
    await Promise.allSettled(promises);

    console.log(`✅ ${snap.size} lembretes processados.`);
  }
);