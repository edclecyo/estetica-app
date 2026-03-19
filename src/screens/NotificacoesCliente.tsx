import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

export default function NotificacoesClienteScreen() {
  const { user } = useAuth();
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorPermission, setErrorPermission] = useState(false);

  useEffect(() => {
    // 1. Verifica se o usuário está realmente logado antes de tentar o Firestore
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    // 2. Listener em tempo real
    const unsub = firestore()
      .collection('notificacoes')
      .where('clienteId', '==', user.uid)
      .orderBy('criadoEm', 'desc') // Nota: Isso requer um Índice Composto no Firebase
      .onSnapshot(
        (snap) => {
          if (snap) {
            const data = snap.docs.map(d => ({
              id: d.id,
              ...d.data(),
            }));
            setNotificacoes(data);
            setErrorPermission(false);
          }
          setLoading(false);
        },
        (error) => {
          // Se cair aqui, geralmente é falta de Índice ou Regras de Segurança
          console.log("Erro Firestore Notificações:", error.message);
          setErrorPermission(true);
          setLoading(false);
        }
      );

    return () => unsub();
  }, [user]);

  const marcarComoLida = async (id: string, lida: boolean) => {
    if (lida) return;
    try {
      await firestore().collection('notificacoes').doc(id).update({ lida: true });
    } catch (e) {
      console.log("Erro ao atualizar status:", e);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.titulo}>Suas Notificações</Text>
      
      {errorPermission && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Opa! Ainda estamos configurando o acesso às suas notificações. 
            Tente novamente em alguns minutos.
          </Text>
        </View>
      )}

      <FlatList
        data={notificacoes}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => marcarComoLida(item.id, item.lida)}
            style={[styles.card, !item.lida && styles.nLida]}
          >
            <View style={styles.row}>
              <Text style={styles.notifTitulo}>{item.titulo || 'Notificação'}</Text>
              {!item.lida && <View style={styles.pontoLida} />}
            </View>
            
            <Text style={styles.notifMsg}>{item.mensagem}</Text>
            
            <Text style={styles.notifData}>
              {item.criadoEm?.toDate 
                ? item.criadoEm.toDate().toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Processando...'}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!errorPermission && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.empty}>Nenhuma notificação por enquanto.</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', paddingHorizontal: 20 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#1A1A1A', marginBottom: 20, marginTop: 20 },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  nLida: { borderLeftWidth: 5, borderLeftColor: '#C9A96E', backgroundColor: '#FFFDF9' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  notifTitulo: { fontWeight: '700', fontSize: 16, color: '#1A1A1A' },
  pontoLida: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A96E' },
  notifMsg: { color: '#555', fontSize: 14, lineHeight: 20 },
  notifData: { color: '#AAA', fontSize: 11, marginTop: 10, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyIcon: { fontSize: 50, marginBottom: 10 },
  empty: { textAlign: 'center', color: '#999', fontSize: 16 },
  errorBox: { backgroundColor: '#FFEBEB', padding: 15, borderRadius: 12, marginBottom: 20 },
  errorText: { color: '#D32F2F', fontSize: 13, textAlign: 'center' }
});