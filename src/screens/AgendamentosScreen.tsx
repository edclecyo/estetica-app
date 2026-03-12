import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useNavigation } from '@react-navigation/native';
import type { Agendamento } from '../types';

export default function AgendamentosScreen() {
  const navigation = useNavigation<any>();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(auth().currentUser);

  useEffect(() => {
    // Escuta mudanças de login/logout em tempo real
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
          navigation.reset({
            index: 0,
            routes: [{ name: 'HomeTabs' }],
          });
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
          onPress={() => navigation.navigate('HomeTabs', { screen: 'Home' })}>
          <Text style={s.btnPrimarioText}>Explorar estabelecimentos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
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

      <FlatList
        data={agendamentos}
        keyExtractor={a => a.id}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyTitulo}>Nenhum agendamento ainda</Text>
            <Text style={s.emptySub}>Explore os estabelecimentos e agende!</Text>
            <TouchableOpacity
              style={s.btnPrimario}
              onPress={() => navigation.navigate('HomeTabs', { screen: 'Home' })}>
              <Text style={s.btnPrimarioText}>Agendar agora</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const st = statusConfig(item.status);
          const podeAvaliar = item.status === 'concluido' && !item.avaliacao;

          return (
            <View style={s.card}>
              <View style={s.cardTopo}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardEstab}>{item.estabelecimentoNome}</Text>
                  <Text style={s.cardServico}>{item.servicoNome}</Text>
                </View>
                <Text style={s.cardPreco}>R${item.servicoPreco}</Text>
              </View>

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

              <View style={s.cardRodape}>
                <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                  <Text style={[s.statusText, { color: st.cor }]}>{st.label}</Text>
                </View>

                {item.avaliacao && (
                  <View style={s.avaliacaoWrap}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <Text key={i} style={[s.estrelinha, i <= item.avaliacao!.estrelas && s.estrelinhaAtiva]}>★</Text>
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
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5', padding: 24 },
  header: { backgroundColor: '#1A1A1A', padding: 20, paddingTop: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerSub: { color: '#C9A96E', fontSize: 10, letterSpacing: 1.5, marginBottom: 2 },
  headerTitulo: { color: '#FAF7F4', fontSize: 20, fontWeight: '700' },
  sairBtn: { backgroundColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  sairText: { color: '#C9A96E', fontSize: 12, fontWeight: '600' },
  lista: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 1 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardEstab: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  cardServico: { fontSize: 12, color: '#888' },
  cardPreco: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  cardInfo: { flexDirection: 'row', gap: 16, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  cardInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardInfoIc: { fontSize: 13 },
  cardInfoTxt: { fontSize: 12, color: '#555', fontWeight: '500' },
  cardRodape: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  avaliacaoWrap: { flexDirection: 'row', gap: 2 },
  estrelinha: { fontSize: 14, color: '#E0E0E0' },
  estrelinhaAtiva: { color: '#F4A261' },
  avaliarBtn: { backgroundColor: '#1A1A1A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  avaliarBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyCard: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitulo: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4, textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#aaa', marginBottom: 4, textAlign: 'center' },
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13, marginTop: 16 },
  btnPrimarioText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});