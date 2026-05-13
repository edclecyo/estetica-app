import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';

import { db, bucket } from '../config/firebase';
import { REGION } from '../config/region';

export const limparStories = onSchedule(
  {
    schedule: 'every 3 hours',
    region: REGION,
    retryCount: 2,
    memory: '256MiB',
    timeoutSeconds: 120,
  },

  async () => {
    const agora = Timestamp.now();

    const snap = await db
      .collection('stories')
      .where('deletarEm', '<=', agora)
      .limit(100)
      .get();

    if (snap.empty) {
      console.log('✅ Nenhum story para limpar.');
      return;
    }

    const batch = db.batch();
    const storageDeletions: Promise<any>[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();

      let caminho = data.storagePath || '';

      if (!caminho && data.url) {
        try {
          const match = String(data.url).match(/\/o\/(.*?)\?/);

          if (match?.[1]) {
            caminho = decodeURIComponent(match[1]);
          }
        } catch (e) {
          console.error(
            `❌ Erro ao parsear URL do story ${doc.id}:`,
            e
          );
        }
      }

      if (caminho) {
        const file = bucket.file(caminho);

        storageDeletions.push(
          file.delete().catch((err) => {
            if (err?.code !== 404) {
              console.warn(
                `⚠️ erro ao deletar ${caminho}:`,
                err?.message || err
              );
            }

            return null;
          })
        );
      }

      batch.delete(doc.ref);
    }

    await Promise.allSettled(storageDeletions);

    await batch.commit();

    console.log(
      `🧹 ${snap.size} stories removidos com sucesso.`
    );
  }
);