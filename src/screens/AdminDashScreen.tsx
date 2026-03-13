import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import type { Estabelecimento, Agendamento } from '../types';

export default function AdminDashScreen() {
  const navigation = useNavigation<any>();
  const { admin, signOut } = useAuth();
  const [aba, setAba] = useState<'dash' | 'estabs'>('dash');
  const [estabs, setEstabs] = useState<Estabelecimento[]>([]);
  const [agends, setAgends] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifNaoLidas, setNotifNaoLidas] = useState(0);

  useEffect(() => {
  if (!admin?.id) return;

  const u1 = firestore()
    .collection('estabelecimentos')
    .where('adminId', '==', admin.id)
    .onSnapshot(snap => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Estabelecimento[];
      setEstabs(lista);
      setLoading(false);

      if (lista.length > 0) {
        const ids = lista.map(e => e.id);
        firestore()
          .collection('agendamentos')
          .where('estabelecimentoId', 'in', ids)
          .orderBy('criadoEm', 'desc')
          .limit(50)
          .onSnapshot(
  snapA => {
    if (!snapA || !snapA.docs) return;
    const listaA = snapA.docs.map(d => ({ id: d.id, ...d.data() })) as Agendamento[];
    setAgends(listaA);
    const naoLidas = listaA.filter(
      a => !a.notifLida && !a.notifApagada
    ).length;
    setNotifNaoLidas(naoLidas);
  },
  error => console.log('Agendamentos error:', error)
);
      } else {
        setAgends([]);
        setLoading(false);
      }
    });

  return u1;
}, [admin?.id]);
useEffect(() => {
  if (!admin) {
    navigation.reset({
      index: 0,
      routes: [{ name: 'HomeTabs' }],
    });
  }
}, [admin]);
  const receita = agends
    .filter(a => a.status === 'confirmado' || a.status === 'concluido')
    .reduce((acc, a) => acc + (a.servicoPreco || 0), 0);

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja sair do painel?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1A1A1A" />
      </View>
    );
  }

  return (
    <View style={s.container}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerSub}>PAINEL ADMIN</Text>
          <Text style={s.headerTitulo}>Olá, {admin?.nome?.split(' ')[0]} 👋</Text>
        </View>
        <View style={s.headerAcoes}>
          <TouchableOpacity
            onPress={() => navigation.navigate('AdminNotif')}
            style={s.sinoBtn}>
            <Text style={s.sinoIcon}>🔔</Text>
            {notifNaoLidas > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{notifNaoLidas}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={s.sairBtn}>
            <Text style={s.sairText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Abas */}
      <View style={s.abas}>
        {[['dash', '📊 Geral'], ['estabs', '🏪 Meus Locais']].map(([k, l]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setAba(k as any)}
            style={[s.aba, aba === k && s.abaAtiva]}>
            <Text style={[s.abaText, aba === k && s.abaTextAtiva]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* DASH */}
      {aba === 'dash' && (
        <FlatList
          data={agends}
          keyExtractor={a => a.id}
          contentContainerStyle={s.lista}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={s.statsRow}>
                {[
                  { ic: '🏪', v: estabs.length, l: 'Locais' },
                  { ic: '📅', v: agends.length, l: 'Agend.' },
                  { ic: '💰', v: `R$${receita}`, l: 'Receita' },
                  { ic: '⭐', v: estabs.length > 0 ? (estabs.reduce((a, e) => a + (e.avaliacao || 0), 0) / estabs.length).toFixed(1) : '—', l: 'Nota' },
                ].map(({ ic, v, l }) => (
                  <View key={l} style={s.statCard}>
                    <Text style={s.statIc}>{ic}</Text>
                    <Text style={s.statV}>{v}</Text>
                    <Text style={s.statL}>{l}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.secTitulo}>Últimos Agendamentos</Text>
            </>
          }
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <Text style={s.emptyEmoji}>📭</Text>
              <Text style={s.emptyText}>Nenhum agendamento ainda</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[s.agendCard, { borderLeftColor: '#C9A96E' }]}>
              <View style={s.agendTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.agendNome}>{item.clienteNome}</Text>
                  <Text style={s.agendSub}>{item.estabelecimentoNome} · {item.servicoNome}</Text>
                  <Text style={s.agendSub}>{item.data} às {item.horario}</Text>
                </View>
                <Text style={s.agendPreco}>R${item.servicoPreco}</Text>
              </View>
              <View style={s.agendRodape}>
                <Text style={[s.status,
                  item.status === 'confirmado' && s.statusConfirmado,
                  item.status === 'cancelado' && s.statusCancelado,
                  item.status === 'concluido' && s.statusConcluido,
                ]}>
                  {item.status === 'confirmado' ? '✓ Confirmado'
                    : item.status === 'cancelado' ? '✕ Cancelado'
                    : '✓ Concluído'}
                </Text>
                {item.avaliacao && (
                  <View style={s.avaliacaoWrap}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <Text key={i} style={[s.estrelinha, i <= item.avaliacao!.estrelas && s.estrelinhaAtiva]}>★</Text>
                    ))}
                  </View>
                )}
              </View>
              {item.status === 'confirmado' && (
                <View style={s.acoesWrap}>
                  <TouchableOpacity
                    style={s.btnConcluir}
                    onPress={() => Alert.alert('Concluir', 'Marcar como concluído?', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Concluir', onPress: () => firestore().collection('agendamentos').doc(item.id).update({ status: 'concluido' }) },
                    ])}>
                    <Text style={s.btnConcluirText}>✓ Concluído</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.btnCancelar}
                    onPress={() => Alert.alert('Cancelar', 'Deseja cancelar?', [
                      { text: 'Não', style: 'cancel' },
                      { text: 'Cancelar', style: 'destructive', onPress: () => firestore().collection('agendamentos').doc(item.id).update({ status: 'cancelado' }) },
                    ])}>
                    <Text style={s.btnCancelarText}>✕ Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* ESTABS */}
      {aba === 'estabs' && (
        <FlatList
          data={estabs}
          keyExtractor={e => e.id}
          contentContainerStyle={s.lista}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <TouchableOpacity
              style={s.novoBtn}
              onPress={() => navigation.navigate('AdminEstab', { estabelecimentoId: 'novo' })}>
              <Text style={s.novoBtnText}>＋ Novo Estabelecimento</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <Text style={s.emptyEmoji}>🏪</Text>
              <Text style={s.emptyText}>Nenhum estabelecimento cadastrado</Text>
              <Text style={s.emptySub}>Crie seu primeiro estabelecimento!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.estabCard, { borderLeftColor: item.cor }]}
              onPress={() => navigation.navigate('AdminEstab', { estabelecimentoId: item.id })}>
              <View style={[s.estabIcon, { backgroundColor: item.cor + '22' }]}>
                <Text style={s.estabEmoji}>{item.img}</Text>
              </View>
              <View style={s.estabInfo}>
                <Text style={s.estabNome}>{item.nome}</Text>
                <Text style={s.estabTipo}>{item.tipo}</Text>
                <Text style={s.estabSub}>
                  {item.servicos?.filter(sv => sv.ativo).length || 0} serviços ·{' '}
                  {agends.filter(a => a.estabelecimentoId === item.id).length} agend.
                </Text>
              </View>
              <Text style={s.arrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
  header: { backgroundColor: '#1A1A1A', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerSub: { color: '#C9A96E', fontSize: 10, letterSpacing: 1.5, marginBottom: 2 },
  headerTitulo: { color: '#FAF7F4', fontSize: 20, fontWeight: '700' },
  headerAcoes: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sinoBtn: { 
  backgroundColor: '#2A2A2A', 
  borderRadius: 10, 
  width: 38, 
  height: 38, 
  justifyContent: 'center', 
  alignItems: 'center',
  overflow: 'visible', // ← importante
},
badge: { 
  position: 'absolute', 
  top: -6, 
  right: -6, 
  backgroundColor: '#F44336', 
  borderRadius: 10, 
  minWidth: 20, 
  height: 20, 
  justifyContent: 'center', 
  alignItems: 'center', 
  paddingHorizontal: 4,
  borderWidth: 2,
  borderColor: '#1A1A1A', // ← borda para destacar do fundo escuro
},
badgeText: { 
  color: '#fff', 
  fontSize: 11, 
  fontWeight: '700' 
},
  sairBtn: { backgroundColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  sairText: { color: '#C9A96E', fontSize: 12, fontWeight: '600' },
  abas: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderBottomWidth: 1, borderBottomColor: '#282828' },
  aba: { flex: 1, padding: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  abaAtiva: { borderBottomColor: '#C9A96E' },
  abaText: { color: '#666', fontSize: 13, fontWeight: '500' },
  abaTextAtiva: { color: '#C9A96E', fontWeight: '700' },
  lista: { padding: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, alignItems: 'center', elevation: 1 },
  statIc: { fontSize: 18, marginBottom: 4 },
  statV: { color: '#1A1A1A', fontSize: 16, fontWeight: '700' },
  statL: { color: '#999', fontSize: 10, marginTop: 2 },
  secTitulo: { color: '#1A1A1A', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  agendCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 3, elevation: 1 },
  agendTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  agendNome: { color: '#1A1A1A', fontSize: 13, fontWeight: '600' },
  agendSub: { color: '#888', fontSize: 11, marginTop: 2 },
  agendPreco: { color: '#1A1A1A', fontSize: 16, fontWeight: '700' },
  agendRodape: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  status: { fontSize: 11, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, fontWeight: '600', alignSelf: 'flex-start', overflow: 'hidden' },
  statusConfirmado: { backgroundColor: '#E8F5E9', color: '#4CAF50' },
  statusCancelado: { backgroundColor: '#FFEBEE', color: '#F44336' },
  statusConcluido: { backgroundColor: '#E3F2FD', color: '#2196F3' },
  acoesWrap: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnConcluir: { flex: 1, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 8, alignItems: 'center' },
  btnConcluirText: { color: '#4CAF50', fontSize: 12, fontWeight: '700' },
  btnCancelar: { flex: 1, backgroundColor: '#FFEBEE', borderRadius: 8, padding: 8, alignItems: 'center' },
  btnCancelarText: { color: '#F44336', fontSize: 12, fontWeight: '700' },
  avaliacaoWrap: { flexDirection: 'row', gap: 2 },
  estrelinha: { fontSize: 13, color: '#E0E0E0' },
  estrelinhaAtiva: { color: '#F4A261' },
  novoBtn: { backgroundColor: '#1A1A1A', borderRadius: 14, padding: 15, alignItems: 'center', marginBottom: 16 },
  novoBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  estabCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, elevation: 1 },
  estabIcon: { borderRadius: 12, padding: 10, marginRight: 12 },
  estabEmoji: { fontSize: 26 },
  estabInfo: { flex: 1 },
  estabNome: { color: '#1A1A1A', fontSize: 14, fontWeight: '700' },
  estabTipo: { color: '#888', fontSize: 12, marginTop: 2 },
  estabSub: { color: '#aaa', fontSize: 11, marginTop: 2 },
  arrow: { color: '#ccc', fontSize: 22 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 30, alignItems: 'center', elevation: 1 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: '#1A1A1A', fontSize: 14, fontWeight: '600' },
  emptySub: { color: '#aaa', fontSize: 12, marginTop: 4 },
});