import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, StatusBar, Platform, Switch,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';

const GOLD = '#C9A96E';
const DARK = '#0A0A0A';

export default function SuperAdminEstabsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const filtroInicial = route.params?.filtro || 'todos';

  const [estabs, setEstabs] = useState<any[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState(filtroInicial);

  // ✅ Listener de estabelecimentos
  useEffect(() => {
    const unsub = firestore()
      .collection('estabelecimentos')
      .onSnapshot(snap => {
        setEstabs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    return unsub;
  }, []);

  // ✅ Listener de solicitações de selo pendentes
  useEffect(() => {
    const unsub = firestore()
      .collection('solicitacoesSelo')
      .where('status', '==', 'pendente')
      .onSnapshot(
        snap => setSolicitacoes(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        err => console.log('Erro solicitações:', err)
      );
    return unsub;
  }, []);

  const filtrados = estabs.filter(e => {
  // Esta é a linha que você deve alterar:
  const buscaOk = 
    e.nome?.toLowerCase().includes(busca.toLowerCase()) || 
    e.email?.toLowerCase().includes(busca.toLowerCase());

  if (filtro === 'destaque')  return buscaOk && e.destaqueAtivo;
  if (filtro === 'verificar') return buscaOk && !e.verificado;
  if (filtro === 'pagantes')  return buscaOk && e.assinaturaAtiva && e.plano !== 'free' && e.plano !== 'trial';
  if (filtro === 'inativos')  return buscaOk && !e.assinaturaAtiva;
  
  return buscaOk;
});

  const toggleVerificado = async (id: string, atual: boolean) => {
    try {
      await firestore().collection('estabelecimentos').doc(id).update({
        verificado: !atual,
        verificadoEm: firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert('✅', `Estabelecimento ${!atual ? 'verificado' : 'não verificado'}!`);
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar.');
    }
  };

  const toggleDestaque = async (id: string, atual: boolean) => {
    try {
      const fim = new Date();
      fim.setDate(fim.getDate() + 7);
      await firestore().collection('estabelecimentos').doc(id).update({
        destaqueAtivo: !atual,
        destaqueExpira: !atual ? fim : null,
        destaqueAdminForced: !atual,
      });
      Alert.alert('⭐', `Destaque ${!atual ? 'ativado por 7 dias' : 'removido'}!`);
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar.');
    }
  };

  const toggleAtivo = async (id: string, atual: boolean) => {
    Alert.alert(
      atual ? 'Desativar' : 'Ativar',
      `Deseja ${atual ? 'desativar' : 'ativar'} este estabelecimento?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            await firestore().collection('estabelecimentos').doc(id).update({ ativo: !atual });
          },
        },
      ]
    );
  };

  // ✅ Aprovar ou rejeitar solicitação de selo
  const responderSelo = (solicitacaoId: string, aprovado: boolean, nomeEstab: string) => {
    Alert.alert(
      aprovado ? '✅ Aprovar Selo' : '❌ Rejeitar Selo',
      aprovado
        ? `Aprovar o selo verificado para "${nomeEstab}"?`
        : `Rejeitar a solicitação de "${nomeEstab}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: aprovado ? 'Aprovar' : 'Rejeitar',
          style: aprovado ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await functions().httpsCallable('responderSolicitacaoSelo')({
                solicitacaoId,
                aprovado,
                motivo: aprovado ? 'Aprovado pelo Super Admin' : 'Não atende os critérios necessários',
              });
              Alert.alert('✅', aprovado ? 'Selo aprovado com sucesso!' : 'Solicitação rejeitada.');
            } catch (e: any) {
              Alert.alert('Erro', e?.message || 'Não foi possível responder.');
            }
          },
        },
      ]
    );
  };

  const FILTROS = [
    { k: 'todos',    l: 'Todos' },
    { k: 'pagantes', l: '💰 Pagantes' },
    { k: 'destaque', l: '⭐ Destaque' },
    { k: 'verificar',l: '✅ A verificar' },
    { k: 'inativos', l: '❌ Inativos' },
    { k: 'selos',    l: `🔔 Selos${solicitacoes.length > 0 ? ` (${solicitacoes.length})` : ''}` },
  ];

  const corPlano = (plano: string) => {
    if (plano === 'elite')    return '#9C27B0';
    if (plano === 'pro')      return GOLD;
    if (plano === 'essencial')return '#4CAF50';
    if (plano === 'trial')    return '#FF9800';
    return '#555';
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={GOLD} size="large" /></View>;
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitulo}>
          {filtro === 'selos' ? 'Solicitações de Selo' : 'Estabelecimentos'}
        </Text>
        <View style={s.headerCountWrap}>
          <Text style={s.headerCount}>
            {filtro === 'selos' ? solicitacoes.length : filtrados.length}
          </Text>
          {solicitacoes.length > 0 && filtro !== 'selos' && (
            <View style={s.seloBadge}>
              <Text style={s.seloBadgeText}>{solicitacoes.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* BUSCA — só aparece fora da aba selos */}
      {filtro !== 'selos' && (
        <View style={s.buscaWrap}>
          <Text style={s.buscaIcon}>🔍</Text>
          <TextInput
            style={s.buscaInput}
            placeholder="Buscar..."
            placeholderTextColor="#444"
            value={busca}
            onChangeText={setBusca}
          />
        </View>
      )}

      {/* FILTROS */}
      <View style={s.filtrosWrap}>
        {FILTROS.map(f => (
          <TouchableOpacity
            key={f.k}
            onPress={() => setFiltro(f.k)}
            style={[s.filtroChip, filtro === f.k && s.filtroChipAtivo]}
          >
            <Text style={[s.filtroText, filtro === f.k && s.filtroTextAtivo]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── ABA SELOS PENDENTES ─── */}
      {filtro === 'selos' ? (
        <FlatList
          data={solicitacoes}
          keyExtractor={item => item.id}
          contentContainerStyle={s.lista}
          ListEmptyComponent={
            <View style={s.vazio}>
              <Text style={s.vazioEmoji}>✅</Text>
              <Text style={s.vazioText}>Nenhuma solicitação pendente</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.seloCard}>
              <View style={s.seloCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.seloNome}>{item.estabelecimentoNome}</Text>
                  <View style={[s.planoBadge, { backgroundColor: corPlano(item.plano || 'free') + '22', alignSelf: 'flex-start', marginTop: 4 }]}>
                    <Text style={[s.planoBadgeText, { color: corPlano(item.plano || 'free') }]}>
                      {(item.plano || 'FREE').toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={s.pendenteBadge}>
                  <Text style={s.pendenteBadgeText}>⏳ Pendente</Text>
                </View>
              </View>

              {/* Stats da solicitação */}
              <View style={s.seloStatsRow}>
                <View style={s.seloStatItem}>
                  <Text style={s.seloStatV}>📅 {item.totalAtendimentos || 0}</Text>
                  <Text style={s.seloStatL}>Atendimentos</Text>
                </View>
                <View style={s.seloStatItem}>
                  <Text style={s.seloStatV}>⭐ {item.avaliacao?.toFixed(1) || '—'}</Text>
                  <Text style={s.seloStatL}>Avaliação</Text>
                </View>
                <View style={s.seloStatItem}>
                  <Text style={s.seloStatV}>📉 {item.avaliacoesNegativas || 0}</Text>
                  <Text style={s.seloStatL}>Negativas</Text>
                </View>
              </View>

              {/* Critérios */}
              <View style={s.criteriosRow}>
                <View style={[s.criterioPill, { backgroundColor: (item.totalAtendimentos >= 1000) ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)' }]}>
                  <Text style={[s.criterioPillText, { color: (item.totalAtendimentos >= 1000) ? '#4CAF50' : '#F44336' }]}>
                    {item.totalAtendimentos >= 1000 ? '✅' : '❌'} 1000+ atend.
                  </Text>
                </View>
                <View style={[s.criterioPill, { backgroundColor: (item.avaliacoesNegativas === 0) ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)' }]}>
                  <Text style={[s.criterioPillText, { color: (item.avaliacoesNegativas === 0) ? '#4CAF50' : '#F44336' }]}>
                    {item.avaliacoesNegativas === 0 ? '✅' : '❌'} Sem negativas
                  </Text>
                </View>
              </View>

              {/* Data da solicitação */}
              <Text style={s.seloData}>
                Solicitado em:{' '}
                {item.criadoEm?.toDate?.()?.toLocaleDateString('pt-BR') || 'Processando...'}
              </Text>

              {/* Ações */}
              <View style={s.seloAcoes}>
                <TouchableOpacity
                  style={s.btnAprovar}
                  onPress={() => responderSelo(item.id, true, item.estabelecimentoNome)}
                >
                  <Text style={s.btnAprovarText}>✅ Aprovar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.btnRejeitar}
                  onPress={() => responderSelo(item.id, false, item.estabelecimentoNome)}
                >
                  <Text style={s.btnRejeitarText}>❌ Rejeitar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />

      ) : (
        // ─── LISTA DE ESTABELECIMENTOS ───
        <FlatList
          data={filtrados}
          keyExtractor={e => e.id}
          contentContainerStyle={s.lista}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <View style={s.cardNomeRow}>
                    <Text style={s.cardNome}>{item.nome}</Text>
                    {item.verificado && <Text style={s.verificadoBadge}>✅</Text>}
                    {item.destaqueAtivo && <Text style={s.verificadoBadge}>⭐</Text>}
                  </View>
                  <Text style={s.cardMeta}>{item.tipo} • {item.cidade || 'Sem cidade'}</Text>
                  <Text style={s.cardEmail}>{item.email || 'Sem email'}</Text>
                  {item.solicitacaoSeloStatus === 'pendente' && (
                    <View style={s.seloSolicitadoBadge}>
                      <Text style={s.seloSolicitadoText}>🔔 Selo solicitado</Text>
                    </View>
                  )}
                </View>
                <View style={[s.planoBadge, { backgroundColor: corPlano(item.plano || 'free') + '22' }]}>
                  <Text style={[s.planoBadgeText, { color: corPlano(item.plano || 'free') }]}>
                    {(item.plano || 'FREE').toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={s.statV}>⭐ {item.avaliacao?.toFixed(1) || '—'}</Text>
                  <Text style={s.statL}>Avaliação</Text>
                </View>
                <View style={s.statItem}>
                  <Text style={s.statV}>📅 {item.quantidadeAvaliacoes || 0}</Text>
                  <Text style={s.statL}>Avaliações</Text>
                </View>
                <View style={s.statItem}>
                  <Text style={s.statV}>📉 {item.avaliacoesNegativas || 0}</Text>
                  <Text style={s.statL}>Negativas</Text>
                </View>
              </View>

              <View style={s.togglesRow}>
                <View style={s.toggleItem}>
                  <Text style={s.toggleLabel}>Ativo</Text>
                  <Switch
                    value={item.ativo || false}
                    onValueChange={() => toggleAtivo(item.id, item.ativo || false)}
                    trackColor={{ false: '#333', true: GOLD + '55' }}
                    thumbColor={item.ativo ? GOLD : '#555'}
                  />
                </View>
                <View style={s.toggleItem}>
                  <Text style={s.toggleLabel}>Verificado ✅</Text>
                  <Switch
                    value={item.verificado || false}
                    onValueChange={() => toggleVerificado(item.id, item.verificado || false)}
                    trackColor={{ false: '#333', true: '#4CAF5055' }}
                    thumbColor={item.verificado ? '#4CAF50' : '#555'}
                  />
                </View>
                <View style={s.toggleItem}>
                  <Text style={s.toggleLabel}>Destaque ⭐</Text>
                  <Switch
                    value={item.destaqueAtivo || false}
                    onValueChange={() => toggleDestaque(item.id, item.destaqueAtivo || false)}
                    trackColor={{ false: '#333', true: '#FF980055' }}
                    thumbColor={item.destaqueAtivo ? '#FF9800' : '#555'}
                  />
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={s.vazio}>
              <Text style={s.vazioEmoji}>🏪</Text>
              <Text style={s.vazioText}>Nenhum resultado</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DARK },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 56,
    paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
  },
  backBtn: { backgroundColor: '#1A1A1A', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: GOLD, fontSize: 20 },
  headerTitulo: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  headerCountWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerCount: { color: GOLD, fontSize: 15, fontWeight: '900', backgroundColor: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  seloBadge: { backgroundColor: '#FF5252', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  seloBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },

  buscaWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', margin: 16, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#1A1A1A' },
  buscaIcon: { marginRight: 8, fontSize: 16 },
  buscaInput: { flex: 1, color: '#FFF', paddingVertical: 12, fontSize: 14 },

  filtrosWrap: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  filtroChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#111', borderWidth: 1, borderColor: '#1A1A1A' },
  filtroChipAtivo: { backgroundColor: GOLD, borderColor: GOLD },
  filtroText: { color: '#666', fontSize: 12, fontWeight: '600' },
  filtroTextAtivo: { color: '#000', fontWeight: '800' },

  lista: { padding: 16, gap: 12 },

  // Card estabelecimento
  card: { backgroundColor: '#111', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1A1A1A' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cardNomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  cardNome: { color: '#FFF', fontSize: 15, fontWeight: '700', flex: 1 },
  verificadoBadge: { fontSize: 14 },
  cardMeta: { color: '#555', fontSize: 11, marginBottom: 2 },
  cardEmail: { color: '#444', fontSize: 11 },
  seloSolicitadoBadge: { backgroundColor: 'rgba(255,152,0,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start', marginTop: 4 },
  seloSolicitadoText: { color: '#FF9800', fontSize: 10, fontWeight: '700' },

  planoBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  planoBadgeText: { fontSize: 10, fontWeight: '900' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  statItem: { flex: 1, alignItems: 'center' },
  statV: { color: '#AAA', fontSize: 12, fontWeight: '700' },
  statL: { color: '#444', fontSize: 9, marginTop: 2 },

  togglesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  toggleItem: { alignItems: 'center', gap: 6 },
  toggleLabel: { color: '#666', fontSize: 10, fontWeight: '600' },

  // Card solicitação de selo
  seloCard: { backgroundColor: '#111', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(201,169,110,0.3)' },
  seloCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  seloNome: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  pendenteBadge: { backgroundColor: 'rgba(255,152,0,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  pendenteBadgeText: { color: '#FF9800', fontSize: 11, fontWeight: '700' },

  seloStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  seloStatItem: { flex: 1, alignItems: 'center' },
  seloStatV: { color: '#AAA', fontSize: 12, fontWeight: '700' },
  seloStatL: { color: '#444', fontSize: 9, marginTop: 2 },

  criteriosRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  criterioPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  criterioPillText: { fontSize: 11, fontWeight: '700' },

  seloData: { color: '#333', fontSize: 10, marginBottom: 14 },

  seloAcoes: { flexDirection: 'row', gap: 10 },
  btnAprovar: { flex: 1, backgroundColor: 'rgba(76,175,80,0.15)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#4CAF50' },
  btnAprovarText: { color: '#4CAF50', fontSize: 13, fontWeight: '800' },
  btnRejeitar: { flex: 1, backgroundColor: 'rgba(244,67,54,0.15)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F44336' },
  btnRejeitarText: { color: '#F44336', fontSize: 13, fontWeight: '800' },

  vazio: { alignItems: 'center', paddingVertical: 60 },
  vazioEmoji: { fontSize: 40, marginBottom: 10 },
  vazioText: { color: '#444', fontSize: 14 },
});