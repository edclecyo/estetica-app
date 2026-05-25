import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { REGION } from '../config/region';

const CACHE_MS = 10 * 60 * 1000;

const precosPlano: Record<string, number> = {
  essencial: 29.9,
  pro: 49.9,
  elite: 89.99,
};

function dataBRHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Fortaleza',
  });
}

function toDate(value: any): Date | null {
  const data = value?.toDate?.() || value;
  return data instanceof Date && !Number.isNaN(data.getTime()) ? data : null;
}

async function garantirSuperAdmin(uid: string) {
  const adminSnap = await db.collection('admins').doc(uid).get();

  if (!adminSnap.exists || adminSnap.data()?.cargo !== 'Super Admin') {
    throw new HttpsError('permission-denied', 'Apenas Super Admin');
  }
}

async function calcularMetricasSuperAdmin() {
  const hoje = dataBRHoje();
  const agora = new Date();

  const [estabsSnap, adminsCountSnap, clientesCountSnap, agendHojeCountSnap, agendTotalCountSnap] =
    await Promise.all([
      db.collection('estabelecimentos').get(),
      (db.collection('admins') as any).count().get(),
      (db.collection('clientes') as any).count().get(),
      (db.collection('agendamentos').where('data', '==', hoje) as any).count().get(),
      (db.collection('agendamentos') as any).count().get(),
    ]);

  const planos = {
    free: 0,
    trial: 0,
    essencial: 0,
    pro: 0,
    elite: 0,
  };

  let receitaEstimada = 0;
  let destaques = 0;
  let verificados = 0;
  let estabsAtivos = 0;

  const estabs = estabsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as any[];

  for (const e of estabs) {
    const plano = e.plano || 'free';

    if (Object.prototype.hasOwnProperty.call(planos, plano)) {
      (planos as any)[plano]++;
    }

    if (e.assinaturaAtiva && precosPlano[plano]) {
      receitaEstimada += precosPlano[plano];
    }

    const destaqueExpira = toDate(e.destaqueExpira);
    const destaquePagoValido =
      e.destaqueAtivo === true &&
      !!destaqueExpira &&
      destaqueExpira > agora;
    const destaqueBasicoElite =
      e.destaqueBasicoAtivo === true &&
      plano === 'elite' &&
      e.assinaturaAtiva === true;

    if (destaquePagoValido || destaqueBasicoElite) {
      destaques++;
    }

    if (
      e.verificado === true ||
      e.verificadoAutomatico === true ||
      (plano === 'elite' && e.assinaturaAtiva === true)
    ) {
      verificados++;
    }

    if (e.ativo) {
      estabsAtivos++;
    }
  }

  const recentes = estabs
    .sort((a, b) => {
      const aTime = a.criadoEm?.toDate?.()?.getTime?.() || a.criadoEm?.seconds || 0;
      const bTime = b.criadoEm?.toDate?.()?.getTime?.() || b.criadoEm?.seconds || 0;
      return bTime - aTime;
    })
    .slice(0, 5)
    .map(e => ({
      id: e.id,
      nome: e.nome || '',
      tipo: e.tipo || '',
      plano: e.plano || 'free',
      assinaturaAtiva: e.assinaturaAtiva === true,
      criadoEm: e.criadoEm || null,
    }));

  const metricas = {
    totalEstabs: estabsSnap.size,
    estabsAtivos,
    totalAdmins: Number(adminsCountSnap.data().count || 0),
    totalClientes: Number(clientesCountSnap.data().count || 0),
    totalAgendamentos: Number(agendTotalCountSnap.data().count || 0),
    agendamentosHoje: Number(agendHojeCountSnap.data().count || 0),
    receitaEstimada,
    planos,
    destaques,
    verificados,
    estabsRecentes: recentes,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoEmMs: Date.now(),
  };

  await db.collection('metricas').doc('superAdmin').set(metricas, { merge: true });

  return {
    ...metricas,
    atualizadoEm: null,
  };
}

export const obterMetricasSuperAdmin = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    await garantirSuperAdmin(req.auth.uid);

    const force = req.data?.force === true;
    const ref = db.collection('metricas').doc('superAdmin');
    const snap = await ref.get();
    const cached = snap.data() as any;
    const cacheValido =
      !force &&
      cached?.atualizadoEmMs &&
      Date.now() - Number(cached.atualizadoEmMs) < CACHE_MS;

    if (cacheValido) {
      return {
        ...cached,
        atualizadoEm: null,
      };
    }

    return calcularMetricasSuperAdmin();
  }
);
