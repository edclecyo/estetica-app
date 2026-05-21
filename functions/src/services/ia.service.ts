import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import OpenAI, { toFile } from 'openai';
import fetch from 'node-fetch';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

const gerarPromptIA = (categoria: string) => {
  const base = `
Crie uma simulação estética realista.
Mantenha a identidade da pessoa, rosto, expressão, idade, pele, iluminação e fundo o mais preservados possível.
Não transforme em desenho.
Não mude a pessoa.
Não exagere.
Resultado deve parecer uma prévia profissional realista.
`;

  if (categoria === 'cabelo') {
    return `${base}
Simule cabelo mais bonito, tratado, alinhado, brilhante e com acabamento profissional de salão.`;
  }

  if (categoria === 'maquiagem') {
    return `${base}
Simule maquiagem profissional elegante, pele uniforme, olhos destacados e acabamento natural.`;
  }

  if (categoria === 'sobrancelha') {
    return `${base}
Simule design de sobrancelha profissional, natural, alinhado e harmonioso com o rosto.`;
  }

  return `${base}
Simule uma melhoria estética profissional para a categoria: ${categoria}.`;
};

async function baixarImagem(imagemUrl: string) {
  const res = await fetch(imagemUrl);

  if (!res.ok) {
    throw new HttpsError(
      'invalid-argument',
      'Não foi possível baixar a imagem original.'
    );
  }

  const contentType = res.headers.get('content-type') || '';

  if (!contentType.startsWith('image/')) {
    throw new HttpsError(
      'invalid-argument',
      'A URL enviada não é uma imagem válida.'
    );
  }

  const arrayBuffer = await res.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

export const gerarSimulacaoIA = onCall(
  {
    region: REGION,
    memory: '1GiB',
    timeoutSeconds: 120,
    secrets: [OPENAI_API_KEY],
  },

  async req => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Faça login');
    }

    const { estabelecimentoId, categoria, imagemUrl } = req.data || {};

    if (!estabelecimentoId || !categoria || !imagemUrl) {
      throw new HttpsError(
        'invalid-argument',
        'Dados obrigatórios ausentes'
      );
    }

    if (!String(imagemUrl).includes('firebasestorage.googleapis.com')) {
      throw new HttpsError(
        'permission-denied',
        'Imagem inválida. Envie uma imagem do Firebase Storage.'
      );
    }

    const rateRef = db.collection('rateLimitIA').doc(req.auth.uid);
    const rateSnap = await rateRef.get();

    const agoraMs = Date.now();

    if (
      rateSnap.exists &&
      agoraMs - Number(rateSnap.data()?.last || 0) < 15000
    ) {
      throw new HttpsError(
        'resource-exhausted',
        'Espere alguns segundos antes de gerar outra simulação IA.'
      );
    }

    await rateRef.set({
      last: agoraMs,
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    const estSnap = await db
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .get();

    if (!estSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento não encontrado'
      );
    }

    const est = estSnap.data() as any;

    if (
      est.plano !== 'elite' ||
      est.assinaturaAtiva !== true ||
      est.iaSimulacaoAtiva !== true
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Prévia IA disponível apenas para Elite com adicional IA ativo.'
      );
    }

    const agora = new Date();

    const mesKey = `${agora.getFullYear()}-${String(
      agora.getMonth() + 1
    ).padStart(2, '0')}`;

    const limite = Number(est.iaSimulacaoLimiteMensal || 100);

    const limiteRef = db
      .collection('limitesIA')
      .doc(`${estabelecimentoId}_${mesKey}`);

    const limiteSnap = await limiteRef.get();
    const totalAtual = limiteSnap.exists
      ? Number(limiteSnap.data()?.total || 0)
      : 0;

    if (totalAtual >= limite) {
      throw new HttpsError(
        'resource-exhausted',
        `Este estabelecimento atingiu o limite mensal de ${limite} simulações IA.`
      );
    }

    try {
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY.value(),
      });

      const { buffer } = await baixarImagem(String(imagemUrl));

      const resposta = await openai.images.edit({
        model: 'gpt-image-1',
        image: await toFile(buffer, 'imagem-original.png', {
          type: 'image/png',
        }),
        prompt: gerarPromptIA(String(categoria)),
        size: '1024x1024',
        quality: 'low',
      });

      const base64 = resposta.data?.[0]?.b64_json;

      if (!base64) {
        throw new Error('A IA não retornou imagem.');
      }

      const imagemGeradaBuffer = Buffer.from(base64, 'base64');

      const bucket = admin.storage().bucket();

      const storagePath =
        `simulacoesIA/${estabelecimentoId}/${mesKey}/${req.auth.uid}_${Date.now()}.png`;

      const file = bucket.file(storagePath);

      await file.save(imagemGeradaBuffer, {
        metadata: {
          contentType: 'image/png',
        },
      });

      const [imagemGerada] = await file.getSignedUrl({
        action: 'read',
        expires: '01-01-2035',
      });

      const simRef = await db.collection('simulacoesIA').add({
        clienteUid: req.auth.uid,
        estabelecimentoId,
        categoria,

        imagemOriginal: imagemUrl,
        imagemGerada,
        storagePath,

        modeloIA: 'gpt-image-1',
        qualidadeIA: 'low',

        mesKey,
        criadoEm: FieldValue.serverTimestamp(),
      });

      await db.runTransaction(async t => {
        const snap = await t.get(limiteRef);

        const atual = snap.exists ? Number(snap.data()?.total || 0) : 0;

        if (atual >= limite) {
          throw new HttpsError(
            'resource-exhausted',
            `Este estabelecimento atingiu o limite mensal de ${limite} simulações IA.`
          );
        }

        t.set(
          limiteRef,
          {
            estabelecimentoId,
            mes: mesKey,
            total: atual + 1,
            limite,
            atualizadoEm: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      return {
        ok: true,
        simulacaoId: simRef.id,
        imagemGerada,
        limiteMensal: limite,
        totalUsado: totalAtual + 1,
      };
    } catch (error: any) {
      console.error('Erro gerarSimulacaoIA:', error);

      throw new HttpsError(
        'internal',
        error?.message || 'Erro ao gerar simulação IA.'
      );
    }
  }
);