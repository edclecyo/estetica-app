import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, Platform, RefreshControl, Alert,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

const GOLD = '#C9A96E';
const DARK = '#0A0A0A';
const CARD = '#111';

export default function SuperAdminDashScreen() {
  const navigation = useNavigation<any>();
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalEstabs: 0,
    estabsAtivos: 0,
    totalAdmins: 0,
    totalClientes: 0,
    totalAgendamentos: 0,
    agendamentosHoje: 0,
    receitaEstimada: 0,
    planos: { free: 0, trial: 0, essencial: 0, pro: 0, elite: 0 },
    destaques: 0,
    verificados: 0,
  });
  const [estabsRecentes, setEstabsRecentes] = useState<any[]>([]);

  const carregar = async () => {
    try {
      const [estabsSnap, adminsSnap, clientesSnap, agendSnap] = await Promise.all([
        firestore().collection('estabelecimentos').get(),
        firestore().collection('admins').get(),
        firestore().collection('clientes').get(),
        firestore().collection('agendamentos').get(),
      ]);

      const hoje = new Date().toLocaleDateString('pt-BR');
      const estabs = estabsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const agends = agendSnap.docs.map(d => d.data()) as any[];

      const planos = { free: 0, trial: 0, essencial: 0, pro: 0, elite: 0 };
      let receitaEstimada = 0;
      let destaques = 0;
      let verificados = 0;
      let estabsAtivos = 0;

      estabs.forEach(e => {
        const plano = e.plano || 'free';
        if (planos.hasOwnProperty(plano)) (planos as any)[plano]++;
        if (plano === 'essencial') receitaEstimada += 30;
        if (plano === 'pro') receitaEstimada += 70;
        if (plano === 'elite') receitaEstimada += 150;
        if (e.destaqueAtivo) destaques++;
        if (e.verificado) verificados++;
        if (e.ativo) estabsAtivos++;
      });

      setStats({
        totalEstabs: estabs.length,
        estabsAtivos,
        totalAdmins: adminsSnap.size,
        totalClientes: clientesSnap.size,
        totalAgendamentos: agends.length,
        agendamentosHoje: agends.filter(a => a.data === hoje).length,
        receitaEstimada,
        planos,
        destaques,
        verificados,
      });

      // Últimos 5 estabelecimentos criados
      const recentes = estabs
        .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0))
        .slice(0, 5);
      setEstabsRecentes(recentes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const onRefresh = () => { setRefreshing(true); carregar(); };

  const handleLogout = () => {
    Alert.alert('Sair', 'Sair do painel master?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={s.loadingText}>Carregando painel master...</Text>
      </View>
    );
  }

  const planosData = [
    { label: 'Free', value: stats.planos.free, cor: '#666' },
    { label: 'Trial', value: stats.planos.trial, cor: '#FF9800' },
    { label: 'Essencial', value: stats.planos.essencial, cor: '#4CAF50' },
    { label: 'Pro', value: stats.planos.pro, cor: GOLD },
    { label: 'Elite', value: stats.planos.elite, cor: '#9C27B0' },
  ];

  const totalPagantes = stats.planos.essencial + stats.planos.pro + stats.planos.elite;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK} />

      {/* HEADER */}
      <View style={s.header}>
        <View>
          <Text style={s.headerEyebrow}>⚡ SUPER ADMIN</Text>
          <Text style={s.headerTitulo}>Painel Master</Text>
        </View>
        <View style={s.headerAcoes}>
          <TouchableOpacity
            style={s.notifBtn}
            onPress={() => navigation.navigate('SuperAdminNotif')}
          >
            <Text style={{ fontSize: 20 }}>📢</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.sairBtn} onPress={handleLogout}>
            <Text style={s.sairText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >

        {/* RECEITA ESTIMADA */}
        <View style={s.receitaCard}>
          <Text style={s.receitaLabel}>RECEITA MENSAL ESTIMADA</Text>
          <Text style={s.receitaValor}>
            R$ {stats.receitaEstimada.toLocaleString('pt-BR')}
          </Text>
          <Text style={s.receitaSub}>
            {totalPagantes} estabelecimentos pagantes
          </Text>
          <View style={s.receitaBarWrap}>
            {planosData.filter(p => p.value > 0).map(p => (
              <View
                key={p.label}
                style={[
                  s.receitaBarSegment,
                  {
                    flex: p.value,
                    backgroundColor: p.cor,
                  }
                ]}
              />
            ))}
          </View>
          <View style={s.receitaLegenda}>
            {planosData.filter(p => p.value > 0).map(p => (
              <View key={p.label} style={s.legendaItem}>
                <View style={[s.legendaDot, { backgroundColor: p.cor }]} />
                <Text style={s.legendaText}>{p.label}: {p.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* STATS GRID */}
        <View style={s.statsGrid}>
          {[
            { ic: '🏪', v: stats.totalEstabs, l: 'Estabelecimentos', sub: `${stats.estabsAtivos} ativos` },
            { ic: '👥', v: stats.totalClientes, l: 'Clientes', sub: 'cadastrados' },
            { ic: '🧑‍💼', v: stats.totalAdmins, l: 'Admins', sub: 'registrados' },
            { ic: '📅', v: stats.agendamentosHoje, l: 'Hoje', sub: `${stats.totalAgendamentos} total` },
            { ic: '⭐', v: stats.destaques, l: 'Destaques', sub: 'ativos' },
            { ic: '✅', v: stats.verificados, l: 'Verificados', sub: 'estabelecimentos' },
          ].map(({ ic, v, l, sub }) => (
            <View key={l} style={s.statCard}>
              <Text style={s.statIc}>{ic}</Text>
              <Text style={s.statV}>{v}</Text>
              <Text style={s.statL}>{l}</Text>
              <Text style={s.statSub}>{sub}</Text>
            </View>
          ))}
        </View>

        {/* DISTRIBUIÇÃO DE PLANOS */}
        <View style={s.section}>
          <Text style={s.sectionTitulo}>Distribuição de Planos</Text>
          {planosData.map(p => {
            const pct = stats.totalEstabs > 0
              ? Math.round((p.value / stats.totalEstabs) * 100)
              : 0;
            return (
              <View key={p.label} style={s.planoRow}>
                <View style={s.planoInfo}>
                  <View style={[s.planoDot, { backgroundColor: p.cor }]} />
                  <Text style={s.planoLabel}>{p.label}</Text>
                  <Text style={s.planoCount}>{p.value}</Text>
                </View>
                <View style={s.planoBarBg}>
                  <View style={[s.planoBarFill, { width: `${pct}%`, backgroundColor: p.cor }]} />
                </View>
                <Text style={s.planoPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>

        {/* AÇÕES RÁPIDAS */}
        <View style={s.section}>
          <Text style={s.sectionTitulo}>Ações</Text>
          <View style={s.acoesGrid}>
            {[
              { ic: '🏪', l: 'Estabelecimentos', onPress: () => navigation.navigate('SuperAdminEstabs') },
              { ic: '📢', l: 'Comunicados', onPress: () => navigation.navigate('SuperAdminNotif') },
              { ic: '⭐', l: 'Destaques', onPress: () => navigation.navigate('SuperAdminEstabs', { filtro: 'destaque' }) },
              { ic: '✅', l: 'Verificações', onPress: () => navigation.navigate('SuperAdminEstabs', { filtro: 'verificar' }) },
            ].map(({ ic, l, onPress }) => (
              <TouchableOpacity key={l} style={s.acaoCard} onPress={onPress}>
                <Text style={s.acaoIc}>{ic}</Text>
                <Text style={s.acaoLabel}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ÚLTIMOS ESTABELECIMENTOS */}
        <View style={s.section}>
          <Text style={s.sectionTitulo}>Cadastros Recentes</Text>
          {estabsRecentes.map(e => (
            <TouchableOpacity
              key={e.id}
              style={s.estabRow}
              onPress={() => navigation.navigate('SuperAdminEstabs')}
            >
              <View style={[s.estabDot, { backgroundColor: e.assinaturaAtiva ? '#4CAF50' : '#FF5252' }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.estabNome}>{e.nome}</Text>
                <Text style={s.estabMeta}>{e.tipo} • {e.plano || 'free'}</Text>
              </View>
              <View style={[s.planoPill, { backgroundColor: e.assinaturaAtiva ? 'rgba(76,175,80,0.15)' : 'rgba(255,82,82,0.15)' }]}>
                <Text style={[s.planoPillText, { color: e.assinaturaAtiva ? '#4CAF50' : '#FF5252' }]}>
                  {e.assinaturaAtiva ? (e.plano || 'ativo').toUpperCase() : 'INATIVO'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DARK, gap: 12 },
  loadingText: { color: '#555', fontSize: 13 },
  scroll: { padding: 16 },

  header: {
    backgroundColor: DARK,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 56,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerEyebrow: { color: GOLD, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  headerTitulo: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  headerAcoes: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifBtn: { backgroundColor: '#1A1A1A', width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  sairBtn: { backgroundColor: 'rgba(201,169,110,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  sairText: { color: GOLD, fontSize: 13, fontWeight: '700' },

  receitaCard: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  receitaLabel: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  receitaValor: { color: '#FFF', fontSize: 32, fontWeight: '900', marginBottom: 4 },
  receitaSub: { color: '#555', fontSize: 12, marginBottom: 16 },
  receitaBarWrap: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
  receitaBarSegment: { height: '100%' },
  receitaLegenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendaDot: { width: 8, height: 8, borderRadius: 4 },
  legendaText: { color: '#888', fontSize: 11 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    width: '31%',
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  statIc: { fontSize: 20, marginBottom: 6 },
  statV: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  statL: { color: '#888', fontSize: 10, fontWeight: '700', marginTop: 2 },
  statSub: { color: '#444', fontSize: 9, marginTop: 2, textAlign: 'center' },

  section: { marginBottom: 20 },
  sectionTitulo: { color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14 },

  planoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  planoInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 100 },
  planoDot: { width: 8, height: 8, borderRadius: 4 },
  planoLabel: { color: '#AAA', fontSize: 12, flex: 1 },
  planoCount: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  planoBarBg: { flex: 1, height: 6, backgroundColor: '#1A1A1A', borderRadius: 3, overflow: 'hidden' },
  planoBarFill: { height: '100%', borderRadius: 3 },
  planoPct: { color: '#555', fontSize: 11, width: 30, textAlign: 'right' },

  acoesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  acaoCard: {
    width: '47.5%',
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    gap: 8,
  },
  acaoIc: { fontSize: 28 },
  acaoLabel: { color: '#AAA', fontSize: 13, fontWeight: '600' },

  estabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  estabDot: { width: 8, height: 8, borderRadius: 4 },
  estabNome: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  estabMeta: { color: '#555', fontSize: 11, marginTop: 2 },
  planoPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  planoPillText: { fontSize: 10, fontWeight: '800' },
});