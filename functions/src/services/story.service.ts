import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

type Plano = 'free' | 'trial' | 'essencial' | 'pro' | 'elite';

function planoAtivo(est: any) {
  const agora = Date.now();
  const expira = est?.expiraEm?.toMillis?.() || 0;

  if (est?.plano === 'trial') {
    return expira > agora;
  }

  return (
    est?.assinaturaAtiva === true &&
    ['essencial', 'pro', 'elite'].includes(est?.plano)
  );
}

function getLimites(plano: Plano) {
  switch (plano) {
    case 'trial':
      return {
        podeFoto: true,
        podeVideo: false,
        maxVideoSegundos: 0,
        maxArquivoMB: 10,
      };

    case 'essencial':
      return {
        podeFoto: true,
        podeVideo: false,
        maxVideoSegundos: 0,
        maxArquivoMB: 10,
      };

    case 'pro':
      return {
        podeFoto: true,
        podeVideo: true,
        maxVideoSegundos: 15,
        maxArquivoMB: 30,
      };

    case 'elite':
      return {
        podeFoto: true,
        podeVideo: true,
        maxVideoSegundos: 30,
        maxArquivoMB: 60,
      };

    default:
      return {
        podeFoto: false,
        podeVideo: false,
        maxVideoSegundos: 0,
        maxArquivoMB: 0,
      };
  }
}

export const validarPostagemStory = onCall(
  { region: REGION },

  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Faça login');
    }

    const {
      estabelecimentoId,
      type,
      duration = 0,
      sizeMB = 0,
    } = req.data || {};

    if (!estabelecimentoId) {
      throw new HttpsError('invalid-argument', 'Estabelecimento obrigatório');
    }

    if (!['image', 'video'].includes(type)) {
      throw new HttpsError('invalid-argument', 'Tipo de mídia inválido');
    }

    const estRef = db
      .collection('estabelecimentos')
      .doc(estabelecimentoId);

    const estSnap = await estRef.get();

    if (!estSnap.exists) {
      throw new HttpsError('not-found', 'Estabelecimento não encontrado');
    }

    const est = estSnap.data();

    if (est?.adminId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Sem permissão');
    }

    if (!planoAtivo(est)) {
      throw new HttpsError(
        'failed-precondition',
        'Ative um plano para postar stories.'
      );
    }

    const plano = (est?.plano || 'free') as Plano;
    const limites = getLimites(plano);

    if (type === 'image' && !limites.podeFoto) {
      throw new HttpsError(
        'failed-precondition',
        'Seu plano não permite postar fotos.'
      );
    }

    if (type === 'video') {
      if (!limites.podeVideo) {
        throw new HttpsError(
          'failed-precondition',
          'Seu plano permite apenas fotos. Faça upgrade para postar vídeos.'
        );
      }

      if (Number(duration) > limites.maxVideoSegundos) {
        throw new HttpsError(
          'failed-precondition',
          `Seu plano permite vídeos de até ${limites.maxVideoSegundos} segundos.`
        );
      }
    }

    if (Number(sizeMB) > limites.maxArquivoMB) {
      throw new HttpsError(
        'failed-precondition',
        `Arquivo muito grande. Seu plano permite até ${limites.maxArquivoMB}MB.`
      );
    }

    return {
      ok: true,
      plano,
      limites,
    };
  }
);
