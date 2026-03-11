import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import type { Agendamento } from '../types';

export default function AgendamentosScreen() {
  const navigation = useNavigation<any>();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = firestore()
      .collection('agendamentos')
      .orderBy('criadoEm', 'desc')
      .onSnapshot(snap => {
        const lista = snap.docs.map(doc => ({
          id: doc.id, ...doc.data()
        })) as Agendamento[];
        setAgendamentos(lista);
        setLoading(false);
      });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Meus Agendamentos</Text>
      </View>

      <FlatList
        data={agendamentos}
        keyExtractor={a => a.id}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📋</Text>
            <Text style={s.emptyTitulo}>Nenhum agendamento</Text>
            <Text style={s.emptySub}>Explore e marque seu horário!</Text>
            <TouchableOpacity
              style={s.btnPrimario}
              onPress={() => navigation.navigate('Home')}>
              <Text style={s.btnPrimarioText}>Explorar</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.card, { borderLeftColor: '#C9A96E' }]}>
            <View style={s.cardTop}>
              <Text style={s.cardNome}>{item.estabelecimentoNome}</Text>
              <Text style={s.cardPreco}>R${item.servicoPreco}</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardLinha}>💆 {item.servicoNome}</Text>
              <Text style={s.cardLinha}>📅 {item.data} às {item.horario}</Text>
              <Text style={s.cardLinha}>👤 {item.clienteNome}</Text>
            </View>
            <View style={s.cardFooter}>
              <Text style={[s.status,
                item.status === 'confirmado' && s.statusConfirmado,
                item.status === 'cancelado' && s.statusCancelado,
                item.status === 'concluido' && s.statusConcluido,
              ]}>
                {item.status === 'confirmado' ? '✓ Confirmado'
                  : item.status === 'cancelado' ? '✕ Cancelado'
                  : '✓ Concluído'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#1A1A1A', padding: 20, paddingTop: 50 },
  headerTitle: { color: '#FAF7F4', fontSize: 20, fontWeight: '700' },
  lista: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 4, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardNome: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  cardPreco: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  cardBody: { backgroundColor: '#FAF7F4', borderRadius: 10, padding: 10, marginBottom: 8 },
  cardLinha: { fontSize: 12, color: '#555', marginBottom: 2 },
  cardFooter: { flexDirection: 'row' },
  status: { fontSize: 11, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, fontWeight: '600', overflow: 'hidden' },
  statusConfirmado: { backgroundColor: '#E8F5E9', color: '#4CAF50' },
  statusCancelado: { backgroundColor: '#FFEBEE', color: '#e55' },
  statusConcluido: { backgroundColor: '#E3F2FD', color: '#2196F3' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitulo: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#aaa', marginBottom: 20 },
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  btnPrimarioText: { color: '#FAF7F4', fontSize: 15, fontWeight: '700' },
});