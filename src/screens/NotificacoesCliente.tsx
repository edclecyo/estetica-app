import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, StatusBar
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';

export default function NotificacoesClienteScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }

    const unsub = firestore()
      .collection('notificacoes')
      .where('clienteId', '==', user.uid)
      .orderBy('criadoEm', 'desc')
      .onSnapshot(
        snap => {
          if (snap) {
            setNotificacoes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }
          setLoading(false);
        },
        error => {
          console.log('Erro notificações cliente:', error.message);
          setLoading(false);
        }
      );

    return () => unsub();
  }, [user?.uid]);

  const marcarLida = async (id: string, lida: boolean) => {
    if (lida) return;
    try {
      await firestore().collection('notificacoes').doc(id).update({ lida: true });
    } catch (e) {
      console.log('Erro ao marcar lida:', e);
    }
  };

  const irAvaliar = async (item: any) => {
    // ✅ Marca como lida antes de navegar
    await marcarLida(item.id, item.lida);

    if (item.agendamentoId && item.estabelecimentoId) {
      navigation.navigate('Avaliar', {
        agendamentoId: item.agendamentoId,
        estabelecimentoNome: item.estabelecimentoNome || item.servicoNome || 'Estabelecimento',
        estabelecimentoId: item.estabelecimentoId,
      });
    }
  };

  const getIcone = (tipo: string) => {
    switch (tipo) {
      case 'concluido':         return { emoji: '✅', cor: '#4CAF50', bg: '#E8F5E9' };
      case 'concluido_auto':    return { emoji: '⭐', cor: '#FF9800', bg: '#FFF3E0' };
      case 'cancelado':         return { emoji: '❌', cor: '#F44336', bg: '#FFEBEE' };
      case 'lembrete':          return { emoji: '⏰', cor: '#FF9800', bg: '#FFF3E0' };
      default:                  return { emoji: '📋', cor: '#C9A96E', bg: '#FFF8F0' };
    }
  };

  const getBadgeLabel = (tipo: string) => {
    switch (tipo) {
      case 'concluido':      return 'Concluído';
      case 'concluido_auto': return 'Avalie agora';
      case 'cancelado':      return 'Cancelado';
      case 'lembrete':       return 'Lembrete';
      default:               return 'Notificação';
    }
  };

  // ✅ Tipos que mostram botão de avaliação
  const podeAvaliar = (item: any) =>
    (item.tipo === 'concluido' || item.tipo === 'concluido_auto') &&
    item.agendamentoId &&
    item.estabelecimentoId &&
    !item.avaliado;

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitulo}>🔔 Notificações</Text>
          {notificacoes.filter(n => !n.lida).length > 0 && (
            <Text style={s.headerSub}>
              {notificacoes.filter(n => !n.lida).length} não lida(s)
            </Text>
          )}
        </View>
      </View>

      <FlatList
        data={notificacoes}
        keyExtractor={item => item.id}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const textoMsg = item.mensagem || item.msg || item.corpo || '';
          const info = getIcone(item.tipo);
          const mostrarAvaliar = podeAvaliar(item);

          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => marcarLida(item.id, item.lida)}
              style={[s.card, !item.lida && s.cardNaoLido]}
            >
              {/* Badge de tipo */}
              <View style={[s.badge, { backgroundColor: info.bg }]}>
                <Text style={s.badgeEmoji}>{info.emoji}</Text>
                <Text style={[s.badgeLabel, { color: info.cor }]}>
                  {getBadgeLabel(item.tipo)}
                </Text>
              </View>

              <View style={s.cardTopo}>
                <Text style={s.titulo}>{item.titulo || 'Notificação'}</Text>
                {!item.lida && <View style={s.ponto} />}
              </View>

              {textoMsg ? (
                <Text style={s.msg}>{textoMsg}</Text>
              ) : null}

              {/* Detalhes do agendamento */}
              {item.servicoNome && (
                <View style={s.detalhes}>
                  <View style={s.detalheItem}>
                    <Text style={s.detalheIc}>💆</Text>
                    <Text style={s.detalheTxt}>{item.servicoNome}</Text>
                  </View>
                  {item.data && (
                    <View style={s.detalheItem}>
                      <Text style={s.detalheIc}>📅</Text>
                      <Text style={s.detalheTxt}>{item.data}</Text>
                    </View>
                  )}
                  {item.horario && (
                    <View style={s.detalheItem}>
                      <Text style={s.detalheIc}>⏰</Text>
                      <Text style={s.detalheTxt}>{item.horario}</Text>
                    </View>
                  )}
                </View>
              )}

              <Text style={s.data}>
                {item.criadoEm?.toDate
                  ? item.criadoEm.toDate().toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : 'Processando...'}
              </Text>

              {/* ✅ Botão de avaliação — só em notificações de concluído */}
              {mostrarAvaliar && (
                <TouchableOpacity
                  style={s.btnAvaliar}
                  onPress={() => irAvaliar(item)}
                >
                  <Text style={s.btnAvaliarText}>⭐ Avaliar agora</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.vazio}>
            <Text style={s.vazioEmoji}>📭</Text>
            <Text style={s.vazioTitulo}>Tudo limpo por aqui</Text>
            <Text style={s.vazioSub}>Suas notificações aparecerão aqui</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },

  header: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 56,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: {
    backgroundColor: '#2A2A2A', borderRadius: 10,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  backIcon: { color: '#FFF', fontSize: 18 },
  headerTitulo: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#C9A96E', fontSize: 11, marginTop: 2 },

  lista: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16,
    marginBottom: 12, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  cardNaoLido: {
    borderLeftWidth: 4, borderLeftColor: '#C9A96E', backgroundColor: '#FFFDF9',
  },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
  },
  badgeEmoji: { fontSize: 12 },
  badgeLabel: { fontSize: 11, fontWeight: '700' },

  cardTopo: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  titulo: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', flex: 1 },
  ponto: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A96E', marginLeft: 8 },

  msg: { color: '#555', fontSize: 14, lineHeight: 20, marginBottom: 10 },

  detalhes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  detalheItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F5F5F5', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  detalheIc: { fontSize: 11 },
  detalheTxt: { fontSize: 11, color: '#555', fontWeight: '500' },

  data: { color: '#AAA', fontSize: 11, fontWeight: '600', marginTop: 4 },

  // ✅ Botão de avaliação
  btnAvaliar: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnAvaliarText: { color: '#C9A96E', fontSize: 13, fontWeight: '800' },

  vazio: { alignItems: 'center', paddingVertical: 80 },
  vazioEmoji: { fontSize: 50, marginBottom: 12 },
  vazioTitulo: { color: '#1A1A1A', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  vazioSub: { color: '#AAA', fontSize: 13, textAlign: 'center' },
});