import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { enviarPush } from '../services/notificacao.service'; // Ajuste o path se necessário

export const onAgendamentoUpdate = onDocumentUpdated(
  { document: "agendamentos/{docId}", region: REGION },
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    
    if (!antes || !depois) return;

    // 1. Lógica de Notificação Push
    if (antes.status !== depois.status) {
      let titulo = '';
      if (depois.status === 'concluido') titulo = '✅ Atendimento Concluído!';
      else if (depois.status === 'cancelado') titulo = '❌ Agendamento Cancelado';

      if (titulo && depois.fcmTokenCliente) {
        // Não precisamos de await aqui se não quisermos travar a execução da função
        enviarPush(depois.fcmTokenCliente, titulo, `Serviço: ${depois.servicoNome}`).catch(console.error);
      }
    }

    // 2. Lógica de Ranking e Avaliação (SÓ RODA SE A NOTA MUDAR E NÃO EXISTIA ANTES)
    // Isso evita que edições de comentário dupliquem a contagem no estabelecimento
    const notaNova = depois.avaliacaoCliente;
    const notaAntiga = antes.avaliacaoCliente;

    if (depois.status === 'concluido' && notaNova && notaNova !== notaAntiga) {
      const estRef = db.collection('estabelecimentos').doc(depois.estabelecimentoId);
      
      await db.runTransaction(async (t) => {
        const estDoc = await t.get(estRef);
        if (!estDoc.exists) return;
        
        const d = estDoc.data() || {};
        
        // Se a nota antiga não existia, é uma nova avaliação (+1)
        // Se a nota antiga já existia, estamos apenas corrigindo a soma (-notaAntiga +notaNova)
        const isEdicao = notaAntiga !== undefined && notaAntiga !== null;
        
        const totalAvaliacoes = isEdicao ? (d.quantidadeAvaliacoes || 1) : (d.quantidadeAvaliacoes || 0) + 1;
        const somaNotas = (d.somaNotas || 0) - (notaAntiga || 0) + notaNova;
        
        const novaMedia = somaNotas / totalAvaliacoes;

        t.update(estRef, {
          avaliacao: Math.round(novaMedia * 10) / 10,
          quantidadeAvaliacoes: totalAvaliacoes,
          somaNotas: somaNotas,
          // Peso do ranking: Média tem peso 2, Volume de avaliações tem peso 0.5
          rankingScore: (novaMedia * 2) + (totalAvaliacoes * 0.5),
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      console.log(`⭐ Ranking atualizado para o estabelecimento: ${depois.estabelecimentoId}`);
    }
  }
);