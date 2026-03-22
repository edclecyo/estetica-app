import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Image,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useNavigation } from '@react-navigation/native';
import type { Agendamento } from '../types';

const FILTROS = ['Todos', 'Confirmado', 'Concluído', 'Cancelado'];

export default function AgendamentosScreen() {
  const navigation = useNavigation<any>();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(auth().currentUser);
  const [filtro, setFiltro] = useState('Todos');

  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged(u => {
      setUser(u);
      if (!u) {
        setAgendamentos([]);
        setLoading(false);
      }
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = firestore()
      .collection('agendamentos')
      .where('clienteUid', '==', user.uid)
      .onSnapshot(
        snap => {
          if (!snap) { setLoading(false); return; }
          const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Agendamento[];
          lista.sort((a, b) => {
            const da = (a.criadoEm as any)?.seconds || 0;
            const db = (b.criadoEm as any)?.seconds || 0;
            return db - da;
          });
          setAgendamentos(lista);
          setLoading(false);
        },
        error => {
          console.log('Erro agendamentos:', error);
          setLoading(false);
        }
      );

    return unsubscribe;
  }, [user?.uid]);

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          try {
            await auth().signOut();
            try { await GoogleSignin.signOut(); } catch {}
          } catch (e) {
            console.log('Erro logout:', e);
          }
          navigation.reset({ index: 0, routes: [{ name: 'HomeTabs' }] });
        },
      },
    ]);
  };

  const statusConfig = (status: string) => {
    switch (status) {
      case 'confirmado': return { cor: '#4CAF50', bg: '#E8F5E9', label: '✓ Confirmado' };
      case 'cancelado': return { cor: '#F44336', bg: '#FFEBEE', label: '✕ Cancelado' };
      case 'concluido': return { cor: '#2196F3', bg: '#E3F2FD', label: '✓ Concluído' };
      default: return { cor: '#FF9800', bg: '#FFF3E0', label: '⏳ Pendente' };
    }
  };

  const filtrados = agendamentos.filter(a => {
    if (filtro === 'Todos') return true;
    if (filtro === 'Confirmado') return a.status === 'confirmado';
    if (filtro === 'Concluído') return a.status === 'concluido';
    if (filtro === 'Cancelado') return a.status === 'cancelado';
    return true;
  });

  const total = agendamentos.length;
  const confirmados = agendamentos.filter(a => a.status === 'confirmado').length;
  const concluidos = agendamentos.filter(a => a.status === 'concluido').length;
  const cancelados = agendamentos.filter(a => a.status === 'cancelado').length;

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1A1A1A" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={s.center}>
        <Text style={s.emptyEmoji}>🔒</Text>
        <Text style={s.emptyTitulo}>Faça login para ver seus horários</Text>
        <Text style={s.emptySub}>Agende um serviço para criar sua conta</Text>
        <TouchableOpacity
          style={s.btnPrimario}
          onPress={() => navigation.navigate('ClienteLogin', {})}>
          <Text style={s.btnPrimarioText}>Entrar / Criar conta</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerSub}>SEUS HORÁRIOS</Text>
          <Text style={s.headerTitulo}>
            Olá, {user.displayName?.split(' ')[0] || user.email?.split('@')[0]} 👋
          </Text>
        </View>
        <TouchableOpacity style={s.sairBtn} onPress={handleLogout}>
          <Text style={s.sairText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* Resumo */}
      <View style={s.resumoWrap}>
        {[
          { ic: '📅', v: total, l: 'Total' },
          { ic: '✓', v: confirmados, l: 'Confirmados', cor: '#4CAF50' },
          { ic: '★', v: concluidos, l: 'Concluídos', cor: '#2196F3' },
          { ic: '✕', v: cancelados, l: 'Cancelados', cor: '#F44336' },
        ].map(({ ic, v, l, cor }) => (
          <View key={l} style={s.resumoCard}>
            <Text style={[s.resumoIc, cor ? { color: cor } : {}]}>{ic}</Text>
            <Text style={s.resumoV}>{v}</Text>
            <Text style={s.resumoL}>{l}</Text>
          </View>
        ))}
      </View>

      {/* Filtros */}
      <View style={s.filtroWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtroScroll}>
          {FILTROS.map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFiltro(f)}
              style={[s.chip, filtro === f && s.chipAtivo]}>
              <Text style={[s.chipText, filtro === f && s.chipTextAtivo]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={a => a.id}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyTitulo}>Nenhum agendamento{filtro !== 'Todos' ? ` ${filtro.toLowerCase()}` : ''}</Text>
            <Text style={s.emptySub}>
              {filtro === 'Todos' ? 'Explore os estabelecimentos e agende!' : `Você não tem agendamentos ${filtro.toLowerCase()}s`}
            </Text>
            {filtro === 'Todos' && (
              <TouchableOpacity
                style={s.btnPrimario}
                onPress={() => navigation.navigate('HomeTabs', { screen: 'Home' })}>
                <Text style={s.btnPrimarioText}>Agendar agora</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const st = statusConfig(item.status);
          const podeAvaliar = item.status === 'concluido' && !item.avaliado;

          return (
            <View style={[s.card, { borderLeftColor: st.cor }]}>
              <View style={s.cardConteudo}>
                {/* Foto/Ícone à esquerda */}
                <View style={s.cardImagemLateral}>
                   <Text style={s.emojiLateral}>🏢</Text>
                </View>

                {/* Info Central */}
                <View style={s.cardCorpo}>
                  <Text style={s.cardEstab}>{item.estabelecimentoNome}</Text>
                  <Text style={s.cardServico}>{item.servicoNome}</Text>
                  
                  <View style={s.cardInfo}>
                    <View style={s.cardInfoItem}>
                      <Text style={s.cardInfoIc}>📅</Text>
                      <Text style={s.cardInfoTxt}>{item.data}</Text>
                    </View>
                    <View style={s.cardInfoItem}>
                      <Text style={s.cardInfoIc}>⏰</Text>
                      <Text style={s.cardInfoTxt}>{item.horario}</Text>
                    </View>
                  </View>
                </View>

                {/* Preço à direita */}
                <View style={s.cardDireita}>
                   <Text style={s.cardPreco}>R${item.servicoPreco}</Text>
                </View>
              </View>

              <View style={s.cardRodape}>
                <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                  <Text style={[s.statusText, { color: st.cor }]}>{st.label}</Text>
                </View>

                {item.avaliado && item.avaliacaoCliente && (
  <View style={s.avaliacaoWrap}>
    {[1, 2, 3, 4, 5].map(i => (
      <Text key={i} style={[s.estrelinha, i <= item.avaliacaoCliente && s.estrelinhaAtiva]}>★</Text>
    ))}
  </View>
)}

                {podeAvaliar && (
                  <TouchableOpacity
                    style={s.avaliarBtn}
                    onPress={() => navigation.navigate('Avaliar', {
                      agendamentoId: item.id,
                      estabelecimentoNome: item.estabelecimentoNome,
                      estabelecimentoId: item.estabelecimentoId,
                    })}>
                    <Text style={s.avaliarBtnText}>⭐ Avaliar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 24 },
  header: { backgroundColor: '#1A1A1A', padding: 20, paddingTop: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerSub: { color: '#C9A96E', fontSize: 10, letterSpacing: 1.5, marginBottom: 2 },
  headerTitulo: { color: '#FAF7F4', fontSize: 20, fontWeight: '700' },
  sairBtn: { backgroundColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  sairText: { color: '#C9A96E', fontSize: 12, fontWeight: '600' },
  resumoWrap: { flexDirection: 'row', backgroundColor: '#1A1A1A', paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  resumoCard: { flex: 1, backgroundColor: '#2A2A2A', borderRadius: 12, padding: 10, alignItems: 'center' },
  resumoIc: { fontSize: 14, color: '#C9A96E', marginBottom: 2 },
  resumoV: { fontSize: 18, fontWeight: '700', color: '#FAF7F4' },
  resumoL: { fontSize: 9, color: '#666', marginTop: 2 },
  filtroWrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filtroScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: 'transparent' },
  chipAtivo: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  chipText: { fontSize: 12, color: '#888', fontWeight: '500' },
  chipTextAtivo: { color: '#fff', fontWeight: '700' },
  lista: { padding: 16, paddingBottom: 32 },
  // Estilo do Card Melhorado
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, elevation: 2, borderLeftWidth: 5 },
  cardConteudo: { flexDirection: 'row', alignItems: 'center' },
  cardImagemLateral: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#F8F9FA', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  emojiLateral: { fontSize: 24 },
  cardCorpo: { flex: 1 },
  cardDireita: { alignItems: 'flex-end', justifyContent: 'center' },
  cardEstab: { fontSize: 12, color: '#999', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  cardServico: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 6 },
  cardPreco: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  cardInfo: { flexDirection: 'row', gap: 12 },
  cardInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardInfoIc: { fontSize: 12 },
  cardInfoTxt: { fontSize: 12, color: '#666', fontWeight: '600' },
  cardRodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  avaliacaoWrap: { flexDirection: 'row', gap: 2 },
  estrelinha: { fontSize: 16, color: '#E0E0E0' },
  estrelinhaAtiva: { color: '#F4A261' },
  avaliarBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  avaliarBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyCard: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitulo: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4, textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#aaa', marginBottom: 4, textAlign: 'center' },
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13, marginTop: 16 },
  btnPrimarioText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});