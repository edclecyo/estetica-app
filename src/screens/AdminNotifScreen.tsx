import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, Platform, StatusBar,
  ActivityIndicator
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Notif {
  id: string;
  clienteNome?: string;
  servicoNome?: string;
  data?: string;
  horario?: string;
  status?: string;
  titulo?: string;
  msg?: string;
  tipo?: string;
  lida: boolean;
  apagada?: boolean;
  criadoEm: any;
}

export default function AdminNotifScreen() {
  const navigation = useNavigation<any>();
  const { admin } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [modoSelecao, setModoSelecao] = useState(false);

  useEffect(() => {
    if (!admin?.id) return;

    const unsub = firestore()
      .collection('notificacoes')
      .where('adminId', '==', admin.id)
      .where('apagada', '==', false)
      .orderBy('criadoEm', 'desc')
      .limit(50)
      .onSnapshot(
        snap => {
          if (!snap) return;
          // Mapeamento direto (O filtro já vem do banco)
          const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Notif[];
          setNotifs(lista);
          setLoading(false);
        },
        error => {
          console.log('Notif error:', error);
          setLoading(false);
        }
      );

    return unsub;
  }, [admin?.id]);

  const naoLidas = notifs.filter(n => !n.lida).length;

  const marcarLida = (id: string) => {
    // Update otimista no estado local
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    firestore().collection('notificacoes').doc(id).update({ lida: true });
  };

  const toggleSelecao = (id: string) => {
    setSelecionados(prev => {
      const novaSelecao = prev.includes(id) 
        ? prev.filter(i => i !== id) 
        : [...prev, id];
      
      if (novaSelecao.length === 0) setModoSelecao(false);
      return novaSelecao;
    });
  };

  const selecionarTodas = () => {
    if (selecionados.length === notifs.length) {
      setSelecionados([]);
    } else {
      setSelecionados(notifs.map(n => n.id));
    }
  };

  const apagarSelecionadas = () => {
    Alert.alert('Apagar', `Apagar ${selecionados.length} notificações?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive',
        onPress: async () => {
          const batch = firestore().batch();
          selecionados.forEach(id => {
            const ref = firestore().collection('notificacoes').doc(id);
            batch.update(ref, { apagada: true });
          });
          await batch.commit();
          setSelecionados([]);
          setModoSelecao(false);
        },
      },
    ]);
  };

  const apagar = (id: string) => {
    Alert.alert('Apagar', 'Apagar esta notificação?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive',
        onPress: () => firestore().collection('notificacoes').doc(id).update({ apagada: true }),
      },
    ]);
  };

  const getInfo = (item: Notif) => {
    if (item.tipo === 'comunicado') {
      return { emoji: '📢', cor: '#9C27B0', label: 'Comunicado', bg: '#F3E5F5' };
    }
    switch (item.status) {
      case 'confirmado': return { emoji: '📅', cor: '#4CAF50', label: 'Confirmado', bg: '#E8F5E9' };
      case 'cancelado':  return { emoji: '❌', cor: '#F44336', label: 'Cancelado',  bg: '#FFEBEE' };
      case 'concluido':  return { emoji: '✅', cor: '#2196F3', label: 'Concluído',  bg: '#E3F2FD' };
      default:           return { emoji: '📋', cor: '#999',    label: 'Notificação', bg: '#F5F5F5' };
    }
  };

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#C9A96E" />
        <Text style={{ marginTop: 12, color: '#AAA', fontWeight: '500' }}>Carregando notificações...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      <View style={s.header}>
        <TouchableOpacity
          onPress={modoSelecao ? () => setModoSelecao(false) : () => navigation.goBack()}
          style={s.voltarBtn}
        >
          <Text style={s.voltarText}>{modoSelecao ? '✕' : '←'}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={s.headerTitulo}>
            {modoSelecao ? `${selecionados.length} selecionada(s)` : '🔔 Notificações'}
          </Text>
          {!modoSelecao && naoLidas > 0 && (
            <Text style={s.headerSub}>{naoLidas} não lida(s)</Text>
          )}
        </View>

        {modoSelecao ? (
          <View style={s.headerAcoes}>
            <TouchableOpacity onPress={selecionarTodas} style={s.headerBtn}>
              <Text style={s.headerBtnText}>
                {selecionados.length === notifs.length ? 'Nenhuma' : 'Todas'}
              </Text>
            </TouchableOpacity>
            {selecionados.length > 0 && (
              <TouchableOpacity onPress={apagarSelecionadas} style={[s.headerBtn, s.headerBtnPerigo]}>
                <Text style={[s.headerBtnText, { color: '#F44336' }]}>🗑 Apagar</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          notifs.length > 0 && (
            <TouchableOpacity onPress={() => setModoSelecao(true)} style={s.headerBtn}>
              <Text style={s.headerBtnText}>Selecionar</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <FlatList
        data={notifs}
        keyExtractor={n => n.id}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.vazio}>
            <Text style={s.vazioEmoji}>🔕</Text>
            <Text style={s.vazioText}>Nenhuma notificação</Text>
            <Text style={s.vazioSub}>Novos agendamentos aparecerão aqui</Text>
          </View>
        }
        renderItem={({ item }) => {
          const info = getInfo(item);
          const selecionado = selecionados.includes(item.id);
          const isComunicado = item.tipo === 'comunicado';
          
          const dataFormatada = item.criadoEm?.toDate 
            ? format(item.criadoEm.toDate(), "dd/MM 'às' HH:mm", { locale: ptBR })
            : '...';

          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (modoSelecao) {
                  toggleSelecao(item.id);
                } else if (!item.lida) {
                  marcarLida(item.id);
                }
              }}
              onLongPress={() => {
                if (!modoSelecao) {
                  setModoSelecao(true);
                  setSelecionados([item.id]);
                }
              }}
              style={[
                s.notifCard,
                !item.lida && s.notifNaoLida,
                selecionado && s.notifSelecionada,
                isComunicado && s.notifComunicado,
              ]}
            >
              {modoSelecao && (
                <View style={[s.checkbox, selecionado && s.checkboxAtivo]}>
                  {selecionado && <Text style={s.checkboxCheck}>✓</Text>}
                </View>
              )}

              <View style={{ flex: 1 }}>
                <View style={s.cardTopo}>
                  <View style={[s.statusBadge, { backgroundColor: info.bg }]}>
                    <Text style={s.statusEmoji}>{info.emoji}</Text>
                    <Text style={[s.statusLabel, { color: info.cor }]}>{info.label}</Text>
                  </View>
                  {!item.lida && <View style={s.ponto} />}
                </View>

                {isComunicado ? (
                  <>
                    <Text style={s.clienteNome}>{item.titulo || 'Comunicado'}</Text>
                    <Text style={s.comunicadoMsg}>{item.msg}</Text>
                  </>
                ) : (
                  <>
                    <Text style={s.clienteNome}>{item.clienteNome || item.titulo || 'Notificação'}</Text>
                    {(item.servicoNome || item.data || item.horario) && (
                      <View style={s.detalhesRow}>
                        {item.servicoNome && (
                          <View style={s.detalheItem}>
                            <Text style={s.detalheIc}>💆</Text>
                            <Text style={s.detalheTxt}>{item.servicoNome}</Text>
                          </View>
                        )}
                        {item.data && (
                          <View style={s.detalheItem}>
                            <Text style={s.detalheIc}>📅</Text>
                            <Text style={s.detalheTxt}>{item.data}</Text>
                          </View>
                        )}
                      </View>
                    )}
                    {item.msg && <Text style={s.comunicadoMsg}>{item.msg}</Text>}
                  </>
                )}

                <Text style={s.dataTexto}>{dataFormatada}</Text>

                {!modoSelecao && (
                  <View style={s.cardRodape}>
                    <TouchableOpacity onPress={() => apagar(item.id)} style={s.btnApagarInline}>
                      <Text style={s.btnApagarInlineText}>🗑 Apagar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 52,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  voltarBtn: { backgroundColor: '#2A2A2A', borderRadius: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  voltarText: { color: '#fff', fontSize: 18 },
  headerTitulo: { color: '#FAF7F4', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#C9A96E', fontSize: 11, marginTop: 2 },
  headerAcoes: { flexDirection: 'row', gap: 8 },
  headerBtn: { backgroundColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  headerBtnPerigo: { backgroundColor: '#2A1A1A' },
  headerBtnText: { color: '#C9A96E', fontSize: 11, fontWeight: '600' },
  lista: { padding: 16, paddingBottom: 40 },
  notifCard: {
    backgroundColor: '#fff', 
    borderRadius: 16, 
    padding: 14,
    marginBottom: 10, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    gap: 10,
  },
  notifNaoLida: { borderLeftWidth: 3, borderLeftColor: '#C9A96E' },
  notifSelecionada: { backgroundColor: '#F0EDE8', borderColor: '#C9A96E', borderWidth: 1.5 },
  notifComunicado: { borderLeftWidth: 3, borderLeftColor: '#9C27B0', backgroundColor: '#FDF5FF' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  checkboxAtivo: { backgroundColor: '#C9A96E', borderColor: '#C9A96E' },
  checkboxCheck: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusEmoji: { fontSize: 12 },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  ponto: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A96E' },
  clienteNome: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  comunicadoMsg: { fontSize: 13, color: '#555', lineHeight: 18, marginBottom: 8 },
  dataTexto: { fontSize: 10, color: '#AAA', fontWeight: '600', marginBottom: 4 },
  detalhesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  detalheItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  detalheIc: { fontSize: 11 },
  detalheTxt: { fontSize: 11, color: '#555', fontWeight: '500' },
  cardRodape: { flexDirection: 'row', justifyContent: 'flex-end' },
  btnApagarInline: { paddingHorizontal: 10, paddingVertical: 4 },
  btnApagarInlineText: { color: '#F44336', fontSize: 11, fontWeight: '600' },
  vazio: { alignItems: 'center', paddingVertical: 80 },
  vazioEmoji: { fontSize: 48, marginBottom: 12 },
  vazioText: { color: '#1A1A1A', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  vazioSub: { color: '#aaa', fontSize: 12, textAlign: 'center' },
});