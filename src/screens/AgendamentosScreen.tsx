import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Image,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useNavigation } from '@react-navigation/native';
import type { Agendamento } from '../types';

const FILTROS = [
  { label: 'Todos', value: 'todos' },
  { label: 'Pagamento', value: 'aguardando_pagamento' },
  { label: 'Confirmado', value: 'confirmado' },
  { label: 'Concluído', value: 'concluido' },
  { label: 'Cancelado', value: 'cancelado' },
];

export default function AgendamentosScreen() {
  const navigation = useNavigation<any>();

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(auth().currentUser);
  const [filtro, setFiltro] = useState('todos');
  const [apagandoId, setApagandoId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged(u => {
      setUser(u);
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
  if (!user?.uid) {
    setAgendamentos([]);
    setLoading(false);
    return;
  }

  setLoading(true);

  const unsub = firestore()
    .collection('agendamentos')
    .where('clienteUid', '==', user.uid)
    .onSnapshot(
      snap => {
        const dados = snap.docs
          .map(d => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((a: any) => a.deletado !== true && a.deletadoCliente !== true)
          .sort((a: any, b: any) => {
            const aTime = a.criadoEm?.toMillis?.() || 0;
            const bTime = b.criadoEm?.toMillis?.() || 0;
            return bTime - aTime;
          });

        setAgendamentos(dados as Agendamento[]);
        setLoading(false);
      },
      error => {
        console.log('Erro agendamentos cliente:', error);
        setLoading(false);
      }
    );

  return () => unsub();
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
            try {
              await GoogleSignin.signOut();
            } catch {}

            navigation.reset({
              index: 0,
              routes: [{ name: 'HomeTabs' }],
            });
          } catch (e) {
            console.log('Erro logout:', e);
          }
        },
      },
    ]);
  };

  const statusConfig = (status: string) => {
    switch (status) {
      case 'confirmado':
        return { cor: '#4CAF50', bg: '#E8F5E9', label: '✓ Confirmado' };
      case 'aguardando_pagamento':
        return { cor: '#FF9800', bg: '#FFF3E0', label: 'Aguardando pagamento' };
      case 'cancelado':
        return { cor: '#F44336', bg: '#FFEBEE', label: '✕ Cancelado' };
      case 'concluido':
        return { cor: '#2196F3', bg: '#E3F2FD', label: '✓ Concluído' };
      default:
        return { cor: '#FF9800', bg: '#FFF3E0', label: '⏳ Pendente' };
    }
  };

  const formatarDataConclusao = (timestamp: any) => {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    return date.toLocaleDateString('pt-BR');
  };

  const getTimestampMs = (timestamp: any) => {
    if (!timestamp) return 0;
    if (timestamp.toMillis) return timestamp.toMillis();
    if (timestamp.toDate) return timestamp.toDate().getTime();

    return new Date(timestamp).getTime() || 0;
  };

  const apagarAgendamento = (item: Agendamento) => {
    Alert.alert(
      'Apagar agendamento',
      'Este card sera removido de vez. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              setApagandoId(item.id);

              const fn = httpsCallable(
                getFunctions(getApp(), 'southamerica-east1'),
                'apagarAgendamentoCliente'
              );

              await fn({
                agendamentoId: item.id,
              });
            } catch (e: any) {
              Alert.alert(
                'Erro',
                e?.message || 'Nao foi possivel apagar este agendamento.'
              );
            } finally {
              setApagandoId(null);
            }
          },
        },
      ]
    );
  };

  const filtrados = agendamentos.filter(a => {
    if (filtro === 'todos') return true;
    return a.status === filtro;
  });

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={s.center}>
        <Text style={s.emptyEmoji}>🔒</Text>
        <Text style={s.emptyTitulo}>Faça login para ver seus horários</Text>

        <TouchableOpacity
          style={s.btnPrimario}
          onPress={() => navigation.navigate('ClienteLogin')}
        >
          <Text style={s.btnPrimarioText}>Entrar / Criar conta</Text>
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
            Olá, {user.displayName?.split(' ')[0] || 'Cliente'} 👋
          </Text>
        </View>

        <TouchableOpacity style={s.sairBtn} onPress={handleLogout}>
          <Text style={s.sairText}>Sair</Text>
        </TouchableOpacity>
      </View>

      <View style={s.filtroWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filtroScroll}
        >
          {FILTROS.map(f => (
            <TouchableOpacity
              key={f.value}
              onPress={() => setFiltro(f.value)}
              style={[
                s.chip,
                filtro === f.value && s.chipAtivo,
              ]}
            >
              <Text
                style={[
                  s.chipText,
                  filtro === f.value && s.chipTextAtivo,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={item => item.id}
        contentContainerStyle={s.lista}
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyTitulo}>Nenhum agendamento encontrado</Text>
          </View>
        }
        renderItem={({ item }) => {
          const st = statusConfig(item.status);
          const aguardandoPagamento =
            item.status === 'aguardando_pagamento' &&
            (item.formaPagamento === 'app' || item.formaPagamento === 'sinal') &&
            item.statusPagamento !== 'approved';
          const expiraMs = getTimestampMs(item.pagamentoExpiraEm);
          const reservaExpirada =
            aguardandoPagamento &&
            expiraMs > 0 &&
            expiraMs <= Date.now();
          const podeApagar =
            item.status === 'cancelado' ||
            item.statusPagamento === 'expired' ||
            reservaExpirada;
          const valorPagamento =
            Number(
              item.valorPagamento ||
              (item.formaPagamento === 'sinal'
                ? Number(item.servicoPreco || 0) * 0.5
                : item.servicoPreco || 0)
            );

          const jaAvaliado =
            (item as any).avaliacao ||
            (item as any).avaliacaoCliente ||
            (item as any).avaliadoPeloCliente === true;

          const podeAvaliar =
            item.status === 'concluido' &&
            !jaAvaliado;

          return (
            <View style={[s.card, { borderLeftColor: st.cor }]}>
              <View style={s.cardConteudo}>
                <View style={s.cardImagemLateral}>
                  {(item as any).estabelecimentoFoto ? (
                    <Image
                      source={{ uri: (item as any).estabelecimentoFoto }}
                      style={s.fotoReal}
                    />
                  ) : (
                    <Text style={s.emojiLateral}>🏢</Text>
                  )}
                </View>

                <View style={s.cardCorpo}>
                  <Text style={s.cardEstab}>
                    {item.estabelecimentoNome}
                  </Text>

                  <Text style={s.cardServico}>
                    {item.servicoNome}
                  </Text>

                  <View style={s.cardInfo}>
                    <Text style={s.cardInfoTxt}>📅 {item.data}</Text>
                    <Text style={s.cardInfoTxt}>⏰ {item.horario}</Text>
                  </View>

                  {item.formaPagamento === 'app' && (
                    <Text style={s.pagoApp}>
                      {item.statusPagamento === 'approved'
                        ? 'Pago pelo app'
                        : 'Pagamento aguardando PIX'}
                    </Text>
                  )}

                  {item.formaPagamento === 'sinal' && (
                    <Text style={s.pagoApp}>
                      {item.statusPagamento === 'approved'
                        ? 'Sinal de 50% pago'
                        : 'Sinal de 50% aguardando PIX'}
                    </Text>
                  )}

                  {item.formaPagamento === 'local' && (
                    <Text style={s.pagoLocal}>
                      🏢 Pagamento no local
                    </Text>
                  )}

                  {item.status === 'concluido' && item.concluidoEm && (
                    <Text style={s.concluidoData}>
                      Finalizado em: {formatarDataConclusao(item.concluidoEm)}
                    </Text>
                  )}

                  {reservaExpirada && (
                    <Text style={s.expiradoText}>
                      Reserva expirada. Escolha um novo horario.
                    </Text>
                  )}
                </View>

                <View style={s.cardDireita}>
                  <Text style={s.cardPreco}>R${item.servicoPreco}</Text>
                </View>
              </View>

              <View style={s.cardRodape}>
                <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                  <Text style={[s.statusText, { color: st.cor }]}>
                    {st.label}
                  </Text>
                </View>

                {podeAvaliar && (
                  <TouchableOpacity
                    style={s.avaliarBtn}
                    onPress={() => {
                      navigation.navigate('Avaliar', {
                        agendamentoId: item.id,
                        estabelecimentoId: item.estabelecimentoId,
                        estabelecimentoNome: item.estabelecimentoNome,
                      });
                    }}
                  >
                    <Text style={s.avaliarBtnText}>⭐ Avaliar</Text>
                  </TouchableOpacity>
                )}

                {aguardandoPagamento && !reservaExpirada && (
                  <TouchableOpacity
                    style={s.pagarBtn}
                    onPress={() => {
                      navigation.navigate('PagamentoCliente', {
                        agendamentoId: item.id,
                        estabelecimentoId: item.estabelecimentoId,
                        servicoNome: item.servicoNome,
                        valor: valorPagamento,
                        nomeEstabelecimento: item.estabelecimentoNome,
                        formaPagamento: item.formaPagamento,
                      });
                    }}
                  >
                    <Text style={s.pagarBtnText}>Pagar agora</Text>
                  </TouchableOpacity>
                )}

                {podeApagar && (
                  <TouchableOpacity
                    style={s.apagarBtn}
                    disabled={apagandoId === item.id}
                    onPress={() => apagarAgendamento(item)}
                  >
                    <Text style={s.apagarBtnText}>
                      {apagandoId === item.id ? 'Apagando...' : 'Apagar'}
                    </Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { backgroundColor: '#1A1A1A', padding: 20, paddingTop: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerSub: { color: '#D4AF37', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  headerTitulo: { color: '#FAF7F4', fontSize: 20, fontWeight: '700' },
  sairBtn: { backgroundColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  sairText: { color: '#D4AF37', fontSize: 12, fontWeight: '600' },
  filtroWrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filtroScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F5F5F5' },
  chipAtivo: { backgroundColor: '#1A1A1A' },
  chipText: { fontSize: 12, color: '#888' },
  chipTextAtivo: { color: '#fff', fontWeight: '700' },
  lista: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, elevation: 3, borderLeftWidth: 5 },
  cardConteudo: { flexDirection: 'row', alignItems: 'center' },
  cardImagemLateral: { width: 55, height: 55, borderRadius: 12, backgroundColor: '#F0F0F0', marginRight: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#EAEAEA', justifyContent: 'center', alignItems: 'center' },
  fotoReal: { width: '100%', height: '100%' },
  emojiLateral: { fontSize: 26 },
  cardCorpo: { flex: 1 },
  cardEstab: { fontSize: 11, color: '#999', fontWeight: '700', textTransform: 'uppercase' },
  cardServico: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginVertical: 2 },
  cardInfo: { flexDirection: 'row', gap: 10 },
  cardInfoTxt: { fontSize: 12, color: '#666' },
  pagoApp: { fontSize: 11, color: '#C9A96E', marginTop: 4 },
  pagoLocal: { fontSize: 11, color: '#999', marginTop: 4 },
  concluidoData: { fontSize: 10, color: '#2196F3', marginTop: 4, fontWeight: '600' },
  expiradoText: { fontSize: 11, color: '#F44336', marginTop: 5, fontWeight: '700' },
  cardDireita: { alignItems: 'flex-end' },
  cardPreco: { fontSize: 14, fontWeight: 'bold', color: '#1A1A1A' },
  cardRodape: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  avaliarBtn: { backgroundColor: '#1A1A1A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  avaliarBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  pagarBtn: { backgroundColor: '#C9A96E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  pagarBtnText: { color: '#1A1A1A', fontSize: 12, fontWeight: '900' },
  apagarBtn: { backgroundColor: '#FFEBEE', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  apagarBtnText: { color: '#F44336', fontSize: 12, fontWeight: '900' },
  emptyCard: { alignItems: 'center', marginTop: 50 },
  emptyEmoji: { fontSize: 40 },
  emptyTitulo: { color: '#999', marginTop: 10 },
  btnPrimario: { backgroundColor: '#1A1A1A', padding: 15, borderRadius: 12, marginTop: 20 },
  btnPrimarioText: { color: '#fff', fontWeight: 'bold' },
});
