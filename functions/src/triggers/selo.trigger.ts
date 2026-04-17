import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore'; // Importação limpa

import { db } from '../config/firebase';
import { REGION } from '../config/region';

/**
 * ─── 10. VERIFICAÇÃO DE SELO AUTOMÁTICA ───────────────────────────────────────
 * Executa a cada 24 horas para validar quem merece o selo de verificado.
 */
export const verificarSeloAutomatico = onSchedule(
  { region: REGION, schedule: "every 24 hours" },
  async () => {
    // 1. Buscamos todos que SÃO verificados (para checar se devem perder)
    // OU que são ELITE (para checar se devem ganhar)
    // Nota: Removi o filtro de plano na query para garantir que quem mudou para 'free' seja processado.
    const snap = await db.collection('estabelecimentos')
      .where('verificado', '==', true)
      .get();
      
    // Buscamos também quem é Elite mas ainda não é verificado
    const snapElite = await db.collection('estabelecimentos')
      .where('plano', '==', 'elite')
      .where('verificado', '==', false)
      .get();

    // Unificamos os documentos para processamento
    const allDocs = [...snap.docs, ...snapElite.docs];

    const CHUNK_SIZE = 20;
    for (let i = 0; i < allDocs.length; i += CHUNK_SIZE) {
      const chunk = allDocs.slice(i, i + CHUNK_SIZE);
      
      await Promise.allSettled(chunk.map(async (doc) => {
        const e = doc.data();
        const ref = doc.ref;

        // Lógica 1: Ganhar Selo (Apenas Plano Elite Ativo)
        if (e.plano === 'elite' && e.assinaturaAtiva === true) {
          if (!e.verificado) {
            await ref.update({
              verificado: true,
              verificadoAutomatico: true,
              verificadoEm: FieldValue.serverTimestamp(),
              motivoVerificacao: 'Plano Elite — verificação automática',
            });
          }
          return;
        }

        // Lógica 2: Perder Selo (Se era verificado automaticamente)
        if (e.verificado && e.verificadoAutomatico) {
          const perdeuCriterios =
            !e.assinaturaAtiva ||
            (e.plano !== 'elite' && e.plano !== 'pro') ||
            (e.avaliacoesNegativas || 0) >= 10;

          if (perdeuCriterios) {
            await ref.update({
              verificado: false,
              verificadoAutomatico: false,
              motivoRemocaoSelo: 'Critérios não atendidos ou plano alterado',
              seloRemovidoEm: FieldValue.serverTimestamp(),
            });
          }
        }
      }));
    }
    
    console.log(`✅ Verificação de selos concluída para ${allDocs.length} estabelecimentos.`);
  }
);