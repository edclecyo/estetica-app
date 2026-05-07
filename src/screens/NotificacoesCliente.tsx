import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
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
      .where('apagada', '!=', true)
      .orderBy('apagada')
      .orderBy('criadoEm', 'desc')
      .limit(50)
      .onSnapshot(
        snap => {

          const agora = new Date();

          const data = snap.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((item: any) => {

              if (!item.expiraEm?.toDate) {
                return true;
              }

              return item.expiraEm.toDate() > agora;
            });

          setNotificacoes(data);
          setLoading(false);
        },
        error => {
          console.log('Erro notificações:', error);
          setLoading(false);
        }
      );

    return () => unsub();

  }, [user?.uid]);

  async function marcarComoLida(id: string, lida?: boolean) {

    if (lida) return;

    try {

      await firestore()
        .collection('notificacoes')
        .doc(id)
        .update({
          lida: true,
        });

    } catch (e) {
      console.log(e);
    }
  }

  const renderItem = ({ item }: { item: any }) => {

    const getIcon = () => {

      switch (item.type) {

        case 'APPOINTMENT_DONE':
          return '⭐';

        case 'NEW_SLOT':
          return '📅';

        case 'NEW_BOOKING':
          return '📥';

        case 'GENERAL':
          return '📢';

        default:
          return '🔔';
      }
    };

    const isConcluido =
      item.type === 'APPOINTMENT_DONE';

    const isVaga =
      item.type === 'NEW_SLOT';

    const mensagemFinal =
      item.mensagem ||
      item.msg ||
      '';

    const tituloFinal =
      item.titulo ||
      'Notificação';

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() =>
          marcarComoLida(item.id, item.lida)
        }
        style={[
          styles.card,
          !item.lida && styles.nLida,
        ]}
      >
        <View style={styles.cardHeader}>

          <View style={styles.iconArea}>
            <Text style={styles.iconText}>
              {getIcon()}
            </Text>
          </View>

          <View style={{ flex: 1 }}>

            <Text style={styles.notifTitulo}>
              {tituloFinal}
            </Text>

            <Text style={styles.notifData}>
              {item.criadoEm?.toDate?.()
                ? item.criadoEm
                    .toDate()
                    .toLocaleDateString('pt-BR')
                : 'Agora'}
            </Text>
          </View>

          {!item.lida && (
            <View style={styles.badgeNovo}>
              <Text style={styles.badgeTexto}>
                NOVO
              </Text>
            </View>
          )}
        </View>

        {!!mensagemFinal && (
          <Text style={styles.notifMsg}>
            {mensagemFinal}
          </Text>
        )}

        <View style={styles.footerAcao}>

          {isConcluido && (
            <TouchableOpacity
              style={styles.btnAvaliar}
              onPress={async () => {

                await marcarComoLida(
                  item.id,
                  item.lida
                );

                navigation.navigate(
                  'Avaliar',
                  {
                    agendamentoId:
                      item.agendamentoId,

                    estabelecimentoNome:
                      item.estabelecimentoNome,

                    estabelecimentoId:
                      item.estabelecimentoId,
                  }
                );
              }}
            >
              <Text style={styles.btnAvaliarText}>
                Avaliar Agora ⭐
              </Text>
            </TouchableOpacity>
          )}

          {isVaga && (
            <TouchableOpacity
              style={styles.btnAgendar}
              onPress={async () => {

                await marcarComoLida(
                  item.id,
                  item.lida
                );

                navigation.navigate(
                  'HomeTabs',
                  {
                    screen: 'Home',
                  }
                );
              }}
            >
              <Text style={styles.btnAgendarText}>
                Ver Horários Disponíveis 📅
              </Text>
            </TouchableOpacity>
          )}

        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#D4AF37"
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>

      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.titulo}>
          Notificações
        </Text>

        <View style={styles.linhaDourada} />
      </View>

      <FlatList
        data={notificacoes}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: 20,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Tudo limpo por aqui! 🕊️
          </Text>
        }
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