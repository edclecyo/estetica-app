import {
  onCall,
  onRequest,
  HttpsError,
  Request,
} from 'firebase-functions/v2/https';

import { auth, db } from '../config/firebase';
import { REGION } from '../config/region';

type Plano = 'free' | 'trial' | 'essencial' | 'pro' | 'elite';

function normalizarPlano(est: any): Plano {
  const candidatos = [
    est?.planoAprovado,
    est?.plano,
    est?.planoPendente,
  ].map(plano => String(plano || '').toLowerCase().trim());

  const plano =
    candidatos.find(item => item.includes('elite')) ? 'elite' :
    candidatos.find(item => item.includes('pro')) ? 'pro' :
    candidatos.find(item => item.includes('essencial')) ? 'essencial' :
    candidatos.find(item => item.includes('trial') || item.includes('teste')) ? 'trial' :
    'free';

  return plano as Plano;
}

function assinaturaPagaAtiva(est: any) {
  const statusPagamento = String(est?.paymentStatus || '').toLowerCase();
  const statusPlano = String(est?.statusPlano || '').toLowerCase();

  return (
    est?.assinaturaAtiva === true ||
    statusPlano === 'ativo' ||
    ['approved', 'authorized', 'accredited'].includes(statusPagamento)
  );
}

function planoAtivo(est: any) {
  const agora = Date.now();
  const expira = est?.expiraEm?.toMillis?.() || 0;
  const plano = normalizarPlano(est);

  if (plano === 'trial') {
    return expira > agora;
  }

  return (
    assinaturaPagaAtiva(est) &&
    ['essencial', 'pro', 'elite'].includes(plano)
  );
}

function getLimites(plano: Plano) {
  switch (plano) {
    case 'trial':
      return {
        podeFoto: true,
        podeVideo: false,
        maxFotos: 5,
        maxMidias: 5,
        maxVideoSegundos: 0,
        maxArquivoMB: 10,
      };

    case 'essencial':
      return {
        podeFoto: true,
        podeVideo: false,
        maxFotos: 5,
        maxMidias: 5,
        maxVideoSegundos: 0,
        maxArquivoMB: 10,
      };

    case 'pro':
      return {
        podeFoto: true,
        podeVideo: true,
        maxFotos: 10,
        maxMidias: 10,
        maxVideoSegundos: 15,
        maxArquivoMB: 30,
      };

    case 'elite':
      return {
        podeFoto: true,
        podeVideo: true,
        maxFotos: 10,
        maxMidias: 10,
        maxVideoSegundos: 30,
        maxArquivoMB: 60,
      };

    default:
      return {
        podeFoto: false,
        podeVideo: false,
        maxFotos: 0,
        maxMidias: 0,
        maxVideoSegundos: 0,
        maxArquivoMB: 0,
      };
  }
}

function getBearerToken(req: Request) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1] || '';
}

function getHttpsStatus(code: string) {
  switch (code) {
    case 'invalid-argument':
      return 400;
    case 'unauthenticated':
      return 401;
    case 'permission-denied':
      return 403;
    case 'not-found':
      return 404;
    case 'failed-precondition':
      return 412;
    default:
      return 500;
  }
}

export const validarPostagemStory = onCall(
  {
    region: REGION,
    invoker: 'public',
  },

  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Faça login');
    }

    const {
      estabelecimentoId,
      type,
      duration = 0,
      sizeMB = 0,
      totalFotos = type === 'image' ? 1 : 0,
      totalVideos = type === 'video' ? 1 : 0,
      quantidade = Number(totalFotos || 0) + Number(totalVideos || 0),
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

    const plano = normalizarPlano(est);
    const limites = getLimites(plano);
    const qtdFotos = Number(totalFotos || 0);
    const qtdVideos = Number(totalVideos || 0);
    const qtdMidias = Number(quantidade || (qtdFotos + qtdVideos));

    if (qtdMidias > limites.maxMidias) {
      throw new HttpsError(
        'failed-precondition',
        `Seu plano permite ate ${limites.maxMidias} midia(s) por postagem.`
      );
    }

    if (qtdFotos > limites.maxFotos) {
      throw new HttpsError(
        'failed-precondition',
        `Seu plano permite ate ${limites.maxFotos} foto(s) por postagem.`
      );
    }

    if (qtdVideos > 0 && !limites.podeVideo) {
      throw new HttpsError(
        'failed-precondition',
        'Seu plano permite apenas fotos. Faca upgrade para postar videos.'
      );
    }

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

export const validarPostagemStoryHttp = onRequest(
  {
    cors: true,
    invoker: 'public',
    region: REGION,
  },

  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({
        code: 'invalid-argument',
        message: 'Use POST',
      });
      return;
    }

    try {
      const token = getBearerToken(req);

      if (!token) {
        throw new HttpsError('unauthenticated', 'Faca login');
      }

      const decodedToken = await auth.verifyIdToken(token);
      const result = await validarPostagemStory.run({
        auth: {
          uid: decodedToken.uid,
          token: decodedToken,
        },
        data: req.body,
        rawRequest: req,
      } as any);

      res.status(200).json(result);
    } catch (error: any) {
      const code =
        error instanceof HttpsError
          ? error.code
          : 'unauthenticated';

      res.status(getHttpsStatus(code)).json({
        code,
        message:
          error instanceof HttpsError
            ? error.message
            : 'Token invalido. Faca login novamente.',
      });
    }
  }
);
