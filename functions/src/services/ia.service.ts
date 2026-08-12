import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import OpenAI, { toFile } from 'openai';
import fetch from 'node-fetch';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

const gerarPromptIA = (
  categoria: string,
  opcoes: {
    estilo?: string | null;
    formato?: string | null;
    cor?: string | null;
  } = {}
) => {
  const estilo = String(opcoes.estilo || '').trim();
  const formato = String(opcoes.formato || '').trim();
  const cor = String(opcoes.cor || '').trim();

  const base = `
Edite a fotografia fornecida de maneira localizada e extremamente realista.

REGRA MAIS IMPORTANTE:
A pessoa da imagem final deve continuar sendo exatamente a mesma pessoa
da fotografia original.

Preserve:
- identidade
- formato do rosto
- olhos
- nariz
- boca
- mandíbula
- idade aparente
- tom e textura da pele
- expressão
- pose
- corpo
- roupas
- acessórios
- iluminação
- cenário
- enquadramento

Não recrie a pessoa.
Não substitua o rosto.
Não transforme em desenho.
Não altere partes que não fazem parte do procedimento.
Não crie nudez.
Não sexualize a imagem.

Faça SOMENTE a alteração estética solicitada.
O resultado deve parecer uma fotografia real após um procedimento profissional.
`;

  if (categoria === 'cabelo') {
    return `${base}

PROCEDIMENTO: CABELO

Edite SOMENTE o cabelo existente.

Faça um acabamento profissional:
- fios tratados
- alinhamento natural
- brilho realista
- aparência saudável
- acabamento profissional de salão

Não altere rosto, pele, olhos, nariz, boca, sobrancelhas,
corpo, roupa ou cenário.
`;
  }

  if (categoria === 'maquiagem') {
    return `${base}

PROCEDIMENTO: MAQUIAGEM

Aplique maquiagem SOBRE o rosto existente.

Faça:
- maquiagem profissional natural
- acabamento elegante
- pele levemente uniformizada
- olhos valorizados
- lábios harmoniosos

Não altere a estrutura facial.
Não altere olhos, nariz, boca, mandíbula ou idade.
Não altere cabelo, corpo, roupa ou cenário.
`;
  }

  if (categoria === 'sobrancelha') {
    return `${base}

PROCEDIMENTO: SOBRANCELHA

Edite SOMENTE as sobrancelhas existentes.

Faça:
- design natural
- alinhamento
- definição profissional
- formato harmonioso

Não modifique nenhuma outra região da fotografia.
`;
  }

  if (categoria === 'unhas_maos') {
    return `${base}

PROCEDIMENTO: UNHAS DAS MÃOS

Edite SOMENTE as unhas visíveis.

Estilo: ${estilo || 'esmalte'}
Formato: ${formato || 'natural'}
Cor: ${cor || 'natural'}

Preserve exatamente:
- mãos
- dedos
- quantidade de dedos
- posição dos dedos
- pele
- anéis
- pulseiras
- objetos
- cenário

NUNCA crie dedos extras.
NUNCA remova dedos.
NUNCA altere a anatomia da mão.

Se estilo = gel:
simule unhas em gel profissionais e realistas.

Se estilo = fibra:
simule alongamento em fibra de vidro.

Se estilo = francesinha:
faça francesinha profissional.

Se estilo = nail_art:
adicione nail art elegante.

Se estilo = esmalte:
aplique apenas esmaltação profissional.

Modifique comprimento e formato SOMENTE das unhas.
`;
  }

  if (categoria === 'unhas_pes') {
    return `${base}

PROCEDIMENTO: UNHAS DOS PÉS

Edite SOMENTE as unhas visíveis dos pés.

Estilo: ${estilo || 'esmalte'}
Cor: ${cor || 'natural'}

Preserve exatamente:
- pés
- dedos
- quantidade de dedos
- anatomia
- posição
- pele
- acessórios
- cenário

NUNCA crie ou remova dedos.
Não altere a anatomia dos pés.

Faça somente a pedicure/esmaltação solicitada.
`;
  }

  return base;
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
      throw new HttpsError(
        'unauthenticated',
        'Faça login novamente.'
      );
    }

   const {
  estabelecimentoId,
  categoria,
  imagemUrl,
  estilo,
  formato,
  cor,
} = req.data || {};

if (
  !estabelecimentoId ||
  !categoria ||
  !imagemUrl
) {
  throw new HttpsError(
    'invalid-argument',
    'Dados obrigatórios ausentes.'
  );
}

const CATEGORIAS_VALIDAS = [
  'cabelo',
  'maquiagem',
  'sobrancelha',
  'unhas_maos',
  'unhas_pes',
];

if (
  !CATEGORIAS_VALIDAS.includes(
    String(categoria)
  )
) {
  throw new HttpsError(
    'invalid-argument',
    'Categoria de Prévia IA inválida.'
  );
}

if (
  !String(imagemUrl).includes(
    'firebasestorage.googleapis.com'
  )
) {
  throw new HttpsError(
    'permission-denied',
    'Imagem inválida. Envie uma imagem do Firebase Storage.'
  );
}

const ESTILOS_VALIDOS = [
  'esmalte',
  'gel',
  'fibra',
  'francesinha',
  'nail_art',
];

const FORMATOS_VALIDOS = [
  'natural',
  'quadrada',
  'almond',
  'bailarina',
  'stiletto',
];

let estiloSeguro: string | null = null;
let formatoSeguro: string | null = null;
let corSegura: string | null = null;

if (
  categoria === 'unhas_maos' ||
  categoria === 'unhas_pes'
) {
  const valor = String(
    estilo || 'esmalte'
  )
    .toLowerCase()
    .trim();

  if (
    !ESTILOS_VALIDOS.includes(valor)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Estilo de unha inválido.'
    );
  }

  estiloSeguro = valor;

  const corRecebida = String(
    cor || ''
  )
    .trim()
    .toUpperCase();

  if (
    corRecebida &&
    !/^#[0-9A-F]{6}$/.test(
      corRecebida
    )
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Cor inválida.'
    );
  }

  corSegura =
    corRecebida || null;
}

if (
  categoria === 'unhas_maos'
) {
  const valor = String(
    formato || 'natural'
  )
    .toLowerCase()
    .trim();

  if (
    !FORMATOS_VALIDOS.includes(
      valor
    )
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Formato de unha inválido.'
    );
  }

  formatoSeguro = valor;
}
    // =====================================================
    // RATE LIMIT
    // =====================================================

    const rateRef = db
      .collection('rateLimitIA')
      .doc(req.auth.uid);

    const rateSnap =
      await rateRef.get();

    const agoraMs =
      Date.now();

    if (
      rateSnap.exists &&
      agoraMs -
        Number(
          rateSnap.data()?.last || 0
        ) <
        15000
    ) {
      throw new HttpsError(
        'resource-exhausted',
        'Espere alguns segundos antes de gerar outra simulação IA.'
      );
    }

    await rateRef.set(
      {
        last: agoraMs,
        atualizadoEm:
          FieldValue.serverTimestamp(),
      },
      {
        merge: true,
      }
    );

    // =====================================================
    // ESTABELECIMENTO
    // =====================================================

    const estRef = db
      .collection('estabelecimentos')
      .doc(estabelecimentoId);

    const estSnap =
      await estRef.get();

    if (!estSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento não encontrado.'
      );
    }

    const est =
      estSnap.data() as any;

    const agora =
      new Date();

    const plano = String(
      est.planoAprovado ||
      est.plano ||
      ''
    )
      .toLowerCase()
      .trim();

    const assinaturaExpira =
      est.expiraEm?.toDate?.() ||
      null;

    const planoValido =
      plano === 'trial'
        ? assinaturaExpira instanceof Date &&
          assinaturaExpira > agora
        : est.assinaturaAtiva === true &&
          ['pro', 'elite'].includes(plano) &&
          (
            !assinaturaExpira ||
            assinaturaExpira > agora
          );

    const iaExpira =
      est.iaSimulacaoExpiraEm
        ?.toDate?.() ||
      null;

    const iaValida =
      est.iaSimulacaoAtiva === true &&
      (
        !iaExpira ||
        iaExpira > agora
      );

    if (
      !planoValido ||
      !iaValida
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Prévia IA disponível somente para estabelecimentos com plano ativo e pacote IA válido.'
      );
    }

    // =====================================================
    // LIMITE MENSAL
    // =====================================================

    const mesKey =
      `${agora.getFullYear()}-${String(
        agora.getMonth() + 1
      ).padStart(2, '0')}`;

    // =====================================================
// LIMITE REAL DA IA PELO PLANO/PACOTE
// =====================================================

const pacoteIA = String(
  est.iaSimulacaoPacote || ''
)
  .toLowerCase()
  .trim();

let limite = 0;

// Elite = 100 imagens / 30 dias
if (
  plano === 'elite' ||
  pacoteIA === 'elite_ia_100'
) {
  limite = 100;
}

// Pro = 20 imagens / 30 dias
else if (
  plano === 'pro' ||
  pacoteIA === 'pro_ia_20'
) {
  limite = 20;
}

if (limite <= 0) {
  throw new HttpsError(
    'failed-precondition',
    'Não foi possível determinar o limite da Prévia IA deste estabelecimento.'
  );
}

// =====================================================
// CORRIGE AUTOMATICAMENTE VALORES ANTIGOS DO FIRESTORE
// =====================================================

const limiteSalvo = Number(
  est.iaSimulacaoLimiteMensal || 0
);

if (limiteSalvo !== limite) {
  console.log(
    'CORRIGINDO LIMITE IA:',
    {
      estabelecimentoId,
      plano,
      pacoteIA,
      limiteAntigo: limiteSalvo,
      limiteNovo: limite,
    }
  );

  await estRef.update({
    iaSimulacaoLimiteMensal: limite,
    atualizadoEm:
      FieldValue.serverTimestamp(),
  });
}

    const limiteRef = db
      .collection('limitesIA')
      .doc(
        `${estabelecimentoId}_${mesKey}`
      );

    let totalUsado = 0;
    let usouCreditoExtra = false;

    // =====================================================
    // RESERVA 1 GERAÇÃO
    // =====================================================

    await db.runTransaction(
      async transaction => {
        const limiteSnap =
          await transaction.get(
            limiteRef
          );

        const totalAtual =
          limiteSnap.exists
            ? Number(
                limiteSnap
                  .data()
                  ?.total || 0
              )
            : 0;

        // Acabou mensal → tenta extra
        if (
          totalAtual >= limite
        ) {
          const estAtualSnap =
            await transaction.get(
              estRef
            );

          const creditos =
            Number(
              estAtualSnap
                .data()
                ?.iaCreditosDisponiveis ||
              0
            );

          if (creditos > 0) {
            usouCreditoExtra = true;

            totalUsado =
              totalAtual;

            transaction.update(
              estRef,
              {
                iaCreditosDisponiveis:
                  FieldValue.increment(
                    -1
                  ),

                iaCreditosUsados:
                  FieldValue.increment(
                    1
                  ),

                atualizadoEm:
                  FieldValue.serverTimestamp(),
              }
            );

            return;
          }

          throw new HttpsError(
            'resource-exhausted',
            `Este estabelecimento atingiu o limite mensal de ${limite} simulações IA e não possui créditos extras.`
          );
        }

        // Usa mensal
        totalUsado =
          totalAtual + 1;

        transaction.set(
          limiteRef,
          {
            estabelecimentoId,
            mes: mesKey,
            total: totalUsado,
            limite,

            atualizadoEm:
              FieldValue.serverTimestamp(),
          },
          {
            merge: true,
          }
        );
      }
    );

    try {
      // =====================================================
      // OPENAI
      // =====================================================

      const apiKey =
        OPENAI_API_KEY.value();

      if (
        !apiKey ||
        !apiKey
          .trim()
          .startsWith('sk-')
      ) {
        throw new HttpsError(
          'unavailable',
          'A Prévia IA está temporariamente indisponível.'
        );
      }

      const openai =
        new OpenAI({
          apiKey,
        });

      const {
        buffer,
        contentType,
      } =
        await baixarImagem(
          String(imagemUrl)
        );

      const extensaoOriginal =
        contentType.includes('png')
          ? 'png'
          : contentType.includes('webp')
            ? 'webp'
            : 'jpg';

      const resposta =
        await openai.images.edit({
          model: 'gpt-image-1',

          image: await toFile(
            buffer,
            `imagem-original.${extensaoOriginal}`,
            {
              type: contentType,
            }
          ),

          prompt:
  gerarPromptIA(
    String(categoria),
    {
      estilo: estiloSeguro,
      formato: formatoSeguro,
      cor: corSegura,
    }
  ),

          size: '1024x1024',
          quality: 'low',
        });

      const base64 =
        resposta.data?.[0]?.b64_json;

      if (!base64) {
        throw new Error(
          'A IA não retornou uma imagem.'
        );
      }

      // =====================================================
      // STORAGE
      // =====================================================

      const imagemGeradaBuffer =
        Buffer.from(
          base64,
          'base64'
        );

      const bucket =
        admin.storage().bucket();

      const storagePath =
        `simulacoesIA/` +
        `${estabelecimentoId}/` +
        `${mesKey}/` +
        `${req.auth.uid}_` +
        `${Date.now()}.png`;

      const file =
        bucket.file(
          storagePath
        );

      await file.save(
        imagemGeradaBuffer,
        {
          resumable: false,

          metadata: {
            contentType:
              'image/png',
          },
        }
      );

      const [imagemGerada] =
        await file.getSignedUrl({
          action: 'read',
          expires: '01-01-2035',
        });

      // =====================================================
      // HISTÓRICO
      // =====================================================

      const simRef =
        await db
          .collection(
            'simulacoesIA'
          )
          .add({
            clienteUid:
              req.auth.uid,

            estabelecimentoId,

            categoria,

estilo:
  estiloSeguro,

formato:
  formatoSeguro,

cor:
  corSegura,

imagemOriginal:
  imagemUrl,

            imagemGerada,

            storagePath,

            modeloIA:
              'gpt-image-1',

            qualidadeIA:
              'low',

            mesKey,

            usouCreditoExtra,

            criadoEm:
              FieldValue.serverTimestamp(),
          });

      // =====================================================
      // SALDO EXTRA ATUAL
      // =====================================================

      const estFinalSnap =
        await estRef.get();

      const creditosExtras =
        Number(
          estFinalSnap
            .data()
            ?.iaCreditosDisponiveis ||
          0
        );

      const restantesMensais =
        Math.max(
          0,
          limite -
            totalUsado
        );

      return {
        ok: true,

        simulacaoId:
          simRef.id,

        imagemGerada,

        limiteMensal:
          limite,

        totalUsado,

        restantesMensais,

        creditosExtras,

        usouCreditoExtra,
      };
    } catch (error: any) {
      // =====================================================
      // DEVOLVE O CRÉDITO SE A GERAÇÃO FALHAR
      // =====================================================

      try {
        await db.runTransaction(
          async transaction => {
            if (
              usouCreditoExtra
            ) {
              transaction.update(
                estRef,
                {
                  iaCreditosDisponiveis:
                    FieldValue.increment(
                      1
                    ),

                  iaCreditosUsados:
                    FieldValue.increment(
                      -1
                    ),

                  atualizadoEm:
                    FieldValue.serverTimestamp(),
                }
              );

              return;
            }

            const snap =
              await transaction.get(
                limiteRef
              );

            const atual =
              snap.exists
                ? Number(
                    snap
                      .data()
                      ?.total || 0
                  )
                : 0;

            transaction.set(
              limiteRef,
              {
                estabelecimentoId,
                mes: mesKey,

                total:
                  Math.max(
                    0,
                    atual - 1
                  ),

                limite,

                atualizadoEm:
                  FieldValue.serverTimestamp(),
              },
              {
                merge: true,
              }
            );
          }
        );
      } catch (
        rollbackError
      ) {
        console.error(
          'Erro ao devolver crédito IA:',
          rollbackError
        );
      }

      // =====================================================
      // LOG REAL
      // =====================================================

      console.error(
        'Erro gerarSimulacaoIA:',
        error
      );

      if (
        error instanceof HttpsError
      ) {
        throw error;
      }

      const status =
        Number(
          error?.status || 0
        );

      const code =
        String(
          error?.code || ''
        ).toLowerCase();

      const type =
        String(
          error?.type || ''
        ).toLowerCase();

      const message =
        String(
          error?.message || ''
        ).toLowerCase();

      // =====================================================
      // MODERAÇÃO / SAFETY
      // =====================================================

      if (
        code ===
          'moderation_blocked' ||
        type ===
          'image_generation_user_error' ||
        message.includes(
          'safety system'
        ) ||
        message.includes(
          'safety_violations'
        )
      ) {
        throw new HttpsError(
          'invalid-argument',
          'Não foi possível gerar a Prévia IA com esta foto. Tente outra imagem com o rosto bem visível, boa iluminação e enquadramento adequado.'
        );
      }

      // =====================================================
      // SEM CRÉDITOS NA CONTA OPENAI
      // =====================================================

      if (
        code ===
          'credit_balance_exhausted' ||
        type ===
          'insufficient_quota' ||
        message.includes(
          'no credits remaining'
        ) ||
        message.includes(
          'insufficient_quota'
        )
      ) {
        throw new HttpsError(
          'unavailable',
          'A Prévia IA está temporariamente indisponível. Tente novamente mais tarde.'
        );
      }

      // =====================================================
      // CHAVE REALMENTE INVÁLIDA
      // =====================================================

      if (
        status === 401 ||
        code ===
          'invalid_api_key' ||
        message.includes(
          'incorrect api key'
        ) ||
        message.includes(
          'invalid api key'
        )
      ) {
        throw new HttpsError(
          'unavailable',
          'A Prévia IA está temporariamente indisponível.'
        );
      }

      // =====================================================
      // RATE LIMIT OPENAI
      // =====================================================

      if (
        status === 429 ||
        message.includes(
          'rate limit'
        )
      ) {
        throw new HttpsError(
          'resource-exhausted',
          'Muitas simulações estão sendo processadas. Aguarde alguns segundos e tente novamente.'
        );
      }

      throw new HttpsError(
        'internal',
        'Não foi possível gerar a simulação. Tente novamente.'
      );
    }
  }
);