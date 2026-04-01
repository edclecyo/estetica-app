import React, { useEffect, useState } from 'react';
import { 
  View, Text, FlatList, StyleSheet, TouchableOpacity, 
  ActivityIndicator, SafeAreaView, StatusBar 
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
    if (!user?.uid) return;

    const unsub = firestore()
      .collection('notificacoes')
      .where('clienteId', '==', user.uid)
      .orderBy('criadoEm', 'desc')
      .onSnapshot(snap => {
        if (snap) {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setNotificacoes(data);
        }
        setLoading(false);
      }, () => setLoading(false));

    return () => unsub();
  }, [user]);

  const marcarComoLida = async (id: string, lida: boolean) => {
    if (lida) return;
    try {
      await firestore().collection('notificacoes').doc(id).update({ lida: true });
    } catch (e) { console.log(e); }
  };

  const renderItem = ({ item }: { item: any }) => {
    // Lógica para identificar o tipo de notificação
    const eConcluido = item.titulo?.toLowerCase().includes('concluído');
    const eVaga = item.titulo?.toLowerCase().includes('vaga') || item.mensagem?.toLowerCase().includes('disponível');

    return (
      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={() => marcarComoLida(item.id, item.lida)}
        style={[styles.card, !item.lida && styles.nLida]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconArea}>
            <Text style={styles.iconText}>{eConcluido ? '⭐' : eVaga ? '📅' : '🔔'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.notifTitulo}>{item.titulo}</Text>
            <Text style={styles.notifData}>
              {item.criadoEm?.toDate() ? item.criadoEm.toDate().toLocaleDateString('pt-BR') : 'Agora'}
            </Text>
          </View>
          {!item.lida && <View style={styles.badgeNovo}><Text style={styles.badgeTexto}>NOVO</Text></View>}
        </View>

        <Text style={styles.notifMsg}>{item.mensagem}</Text>

        {/* BOTÕES DE AÇÃO DINÂMICOS */}
        <View style={styles.footerAcao}>
          {eConcluido && (
            <TouchableOpacity 
              style={styles.btnAvaliar}
              onPress={() => {
                marcarComoLida(item.id, item.lida);
                navigation.navigate('AvaliarScreen', { 
                  agendamentoId: item.agendamentoId, // A Function deve salvar isso na notificação
                  estabelecimentoNome: item.estabelecimentoNome 
                });
              }}
            >
              <Text style={styles.btnAvaliarText}>Avaliar Agora ⭐</Text>
            </TouchableOpacity>
          )}

          {eVaga && (
            <TouchableOpacity 
              style={styles.btnAgendar}
              onPress={() => {
                marcarComoLida(item.id, item.lida);
                navigation.navigate('HomeTabs', { screen: 'Explorar' });
              }}
            >
              <Text style={styles.btnAgendarText}>Ver Horários Disponíveis 📅</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color="#D4AF37" /></View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.titulo}>Notificações</Text>
        <View style={styles.linhaDourada} />
      </View>

      <FlatList
        data={notificacoes}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={<Text style={styles.empty}>Tudo limpo por aqui! 🕊️</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBFBFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 25, marginTop: 20, marginBottom: 10 },
  titulo: { fontSize: 28, fontWeight: '900', color: '#1A1A1A' },
  linhaDourada: { width: 40, height: 4, backgroundColor: '#D4AF37', marginTop: 5, borderRadius: 2 },
  
  card: { 
    backgroundColor: '#FFF', 
    borderRadius: 20, 
    padding: 18, 
    marginBottom: 15, 
    borderWidth: 1, 
    borderColor: '#F0F0F0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  nLida: { 
    borderColor: 'rgba(212, 175, 55, 0.3)',
    backgroundColor: '#FFFDF9',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconArea: { 
    width: 45, 
    height: 45, 
    borderRadius: 14, 
    backgroundColor: '#F8F8F8', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 12 
  },
  iconText: { fontSize: 20 },
  notifTitulo: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  notifData: { fontSize: 11, color: '#AAA', marginTop: 2 },
  badgeNovo: { backgroundColor: '#D4AF37', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeTexto: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  
  notifMsg: { fontSize: 14, color: '#444', lineHeight: 20, marginBottom: 15 },
  
  footerAcao: { borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12 },
  btnAvaliar: { 
    backgroundColor: '#1A1A1A', 
    paddingVertical: 12, 
    borderRadius: 12, 
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center'
  },
  btnAvaliarText: { color: '#D4AF37', fontWeight: '800', fontSize: 14 },
  
  btnAgendar: { 
    backgroundColor: '#D4AF37', 
    paddingVertical: 12, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  btnAgendarText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  
  empty: { textAlign: 'center', marginTop: 100, color: '#999', fontSize: 16 }
});