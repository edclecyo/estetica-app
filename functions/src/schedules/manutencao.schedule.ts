import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db, bucket } from '../config/firebase'; // Garanta que 'bucket' é exportado aqui
import { REGION } from '../config/region';

// ... (todo o seu código de verificarAssinaturas, manutencaoDiaria, etc)

export const limparStories = onSchedule(
  { schedule: "every 3 hours", region: REGION },
  async () => {
    const agora = Timestamp.now();
    const snap = await db.collection("stories")
      .where("deletarEm", "<=", agora)
      .limit(50)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    const storageDeletions: Promise<any>[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      
      // Se você salvar o path direto no banco, use data.path. 
      // Se não, essa lógica de extrair da URL resolve:
      if (data.url) {
        const caminho = decodeURIComponent(data.url.split("/o/")[1]?.split("?")[0] || "");
        if (caminho) {
          storageDeletions.push(bucket.file(caminho).delete().catch(() => {
            console.warn(`Arquivo não encontrado no Storage: ${caminho}`);
            return null;
          }));
        }
      }
      batch.delete(doc.ref);
    }

    await Promise.all(storageDeletions);
    await batch.commit();
    console.log("🧹 Stories e arquivos de mídia limpos.");
  }
);