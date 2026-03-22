import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, StatusBar, Platform, Switch,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation, useRoute } from '@react-navigation/native';

const GOLD = '#C9A96E';
const DARK = '#0A0A0A';

export default function SuperAdminEstabsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const filtroInicial = route.params?.filtro || 'todos';

  const [estabs, setEstabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState(filtroInicial);

  useEffect(() => {
    const unsub = firestore()
      .collection('estabelecimentos')
      .onSnapshot(snap => {
        setEstabs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    return unsub;
  }, []);

  const filtrados = estabs.filter(e => {
    const buscaOk = e.nome?.toLowerCase().includes(busca.toLowerCase());
    if (filtro === 'destaque') return buscaOk && e.destaqueAtivo;
    if (filtro === 'verificar') return buscaOk && !e.verificado;
    if (filtro === 'pagantes') return buscaOk && e.assinaturaAtiva && e.plano !== 'free' && e.plano !== 'trial';
    if (filtro === 'inativos') return buscaOk && !e.assinaturaAtiva;
    return buscaOk;
  });

  const toggleVerificado = async (id: string, atual: boolean) => {
    try {
      await firestore().collection('estabelecimentos').doc(id).update({
        verificado: !atual,
        verificadoEm: firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert('✅', `Estabelecimento ${!atual ? 'verificado' : 'não verificado'}!`);
    } catch (e) {
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
    } catch (e) {
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

  const FILTROS = [
    { k: 'todos', l: 'Todos' },
    { k: 'pagantes', l: '💰 Pagantes' },
    { k: 'destaque', l: '⭐ Destaque' },
    { k: 'verificar', l: '✅ A verificar' },
    { k: 'inativos', l: '❌ Inativos' },
  ];

  const corPlano = (plano: string) => {
    if (plano === 'elite') return '#9C27B0';
    if (plano === 'pro') return GOLD;
    if (plano === 'essencial') return '#4CAF50';
    if (plano === 'trial') return '#FF9800';
    return '#555';
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={GOLD} size="large" /></View>;
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitulo}>Estabelecimentos</Text>
        <Text style={s.headerCount}>{filtrados.length}</Text>
      </View>

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
  headerCount: { color: GOLD, fontSize: 15, fontWeight: '900', backgroundColor: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  buscaWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', margin: 16, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#1A1A1A' },
  buscaIcon: { marginRight: 8, fontSize: 16 },
  buscaInput: { flex: 1, color: '#FFF', paddingVertical: 12, fontSize: 14 },
  filtrosWrap: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  filtroChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#111', borderWidth: 1, borderColor: '#1A1A1A' },
  filtroChipAtivo: { backgroundColor: GOLD, borderColor: GOLD },
  filtroText: { color: '#666', fontSize: 12, fontWeight: '600' },
  filtroTextAtivo: { color: '#000', fontWeight: '800' },
  lista: { padding: 16, gap: 12 },
  card: { backgroundColor: '#111', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1A1A1A' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cardNomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  cardNome: { color: '#FFF', fontSize: 15, fontWeight: '700', flex: 1 },
  verificadoBadge: { fontSize: 14 },
  cardMeta: { color: '#555', fontSize: 11, marginBottom: 2 },
  cardEmail: { color: '#444', fontSize: 11 },
  planoBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  planoBadgeText: { fontSize: 10, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  statItem: { flex: 1, alignItems: 'center' },
  statV: { color: '#AAA', fontSize: 12, fontWeight: '700' },
  statL: { color: '#444', fontSize: 9, marginTop: 2 },
  togglesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  toggleItem: { alignItems: 'center', gap: 6 },
  toggleLabel: { color: '#666', fontSize: 10, fontWeight: '600' },
  vazio: { alignItems: 'center', paddingVertical: 60 },
  vazioEmoji: { fontSize: 40, marginBottom: 10 },
  vazioText: { color: '#444', fontSize: 14 },
});