import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Platform, StatusBar,
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
  type?: string;

  titulo?: string;
  msg?: string;
  mensagem?: string;

  lida: boolean;
  apagada?: boolean;
  criadoEm: any;
}

export default function AdminNotifScreen() {
  const navigation = useNavigation<any>();
  const { admin } = useAuth();

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

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
          const lista = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
          })) as Notif[];

          setNotifs(lista);
          setLoading(false);
        },
        err => {
          console.log('Notif error:', err);
          setLoading(false);
        }
      );

    return unsub;
  }, [admin?.id]);

  const marcarLida = (id: string) => {
    setNotifs(prev =>
      prev.map(n => (n.id === id ? { ...n, lida: true } : n))
    );

    firestore().collection('notificacoes').doc(id).update({
      lida: true,
    });
  };

  const getInfo = (item: Notif) => {
  const tipo = item.type || item.status;

  switch (tipo) {
    case 'NEW_BOOKING':
      return { emoji: '📥', cor: '#4CAF50', label: 'Novo Agendamento', bg: '#E8F5E9' };

    case 'NEW_SLOT':
      return { emoji: '📢', cor: '#FF9800', label: 'Confirmado', bg: '#FFF3E0' };

    case 'APPOINTMENT_DONE':
      return { emoji: '⭐', cor: '#2196F3', label: 'Concluído', bg: '#E3F2FD' };

    case 'GENERAL':
      return { emoji: '📋', cor: '#999', label: 'Aviso', bg: '#F5F5F5' };

    default:
      return { emoji: '📋', cor: '#999', label: 'Notificação', bg: '#F5F5F5' };
  }
};

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#C9A96E" />
        <Text style={{ marginTop: 12, color: '#AAA' }}>
          Carregando notificações...
        </Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitulo}>🔔 Notificações</Text>
          <Text style={s.headerSub}>
            {notifs.filter(n => !n.lida).length} não lida(s)
          </Text>
        </View>
      </View>

      <FlatList
        data={notifs}
        keyExtractor={i => i.id}
        contentContainerStyle={s.lista}
        ListEmptyComponent={
          <View style={s.vazio}>
            <Text style={s.vazioEmoji}>🔕</Text>
            <Text style={s.vazioText}>Nenhuma notificação</Text>
          </View>
        }
        renderItem={({ item }) => {
          const info = getInfo(item);

          const dataFormatada = item.criadoEm?.toDate
            ? format(item.criadoEm.toDate(), "dd/MM 'às' HH:mm", { locale: ptBR })
            : '...';

          const mensagemFinal = item.msg || item.mensagem || '';

          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => !item.lida && marcarLida(item.id)}
              style={[
                s.card,
                !item.lida && s.naoLida,
              ]}
            >
              <View style={s.topo}>
                <View style={[s.badge, { backgroundColor: info.bg }]}>
                  <Text>{info.emoji}</Text>
                  <Text style={[s.label, { color: info.cor }]}>
                    {info.label}
                  </Text>
                </View>

                {!item.lida && <View style={s.ponto} />}
              </View>

              <Text style={s.titulo}>
                {item.clienteNome || item.titulo || 'Notificação'}
              </Text>

              {!!item.servicoNome && (
                <Text style={s.info}>💆 {item.servicoNome}</Text>
              )}

              {!!item.data && (
                <Text style={s.info}>📅 {item.data}</Text>
              )}

              {!!mensagemFinal && (
                <Text style={s.msg}>{mensagemFinal}</Text>
              )}

              <Text style={s.data}>{dataFormatada}</Text>
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
    padding: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 10 : 50,
  },

  headerTitulo: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  headerSub: {
    color: '#C9A96E',
    fontSize: 12,
    marginTop: 2,
  },

  lista: { padding: 16 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },

  naoLida: {
    borderLeftWidth: 3,
    borderLeftColor: '#C9A96E',
  },

  topo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  badge: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: 'center',
  },

  label: {
    fontSize: 11,
    fontWeight: '700',
  },

  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C9A96E',
  },

  titulo: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  info: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },

  msg: {
    marginTop: 6,
    fontSize: 13,
    color: '#444',
  },

  data: {
    marginTop: 8,
    fontSize: 10,
    color: '#999',
  },

  vazio: {
    alignItems: 'center',
    marginTop: 80,
  },

  vazioEmoji: {
    fontSize: 40,
  },

  vazioText: {
    marginTop: 10,
    color: '#999',
  },
});