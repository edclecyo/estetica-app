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
  Alert,
} from 'react-native';

import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';

export default function NotificacoesClienteScreen() {

  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionando, setSelecionando] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

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

  function abrirSelecao() {
    setSelecionando(true);
    setSelecionadas([]);
  }

  function cancelarSelecao() {
    setSelecionando(false);
    setSelecionadas([]);
  }

  function alternarSelecao(id: string) {
    setSelecionadas(prev =>
      prev.includes(id)
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  }

  function alternarTodas() {
    if (selecionadas.length === notificacoes.length) {
      setSelecionadas([]);
      return;
    }

    setSelecionadas(
      notificacoes.map(item => item.id)
    );
  }

  function confirmarApagar(item: any) {
    Alert.alert(
      'Apagar notificação',
      'Essa notificação será removida da sua lista.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => apagarNotificacao(item),
        },
      ]
    );
  }

  function confirmarApagarSelecionadas() {
    if (selecionadas.length === 0) {
      Alert.alert(
        'Nenhuma notificação selecionada',
        'Selecione pelo menos uma notificação para apagar.'
      );
      return;
    }

    Alert.alert(
      'Apagar notificações',
      `Você quer apagar ${selecionadas.length} notificação(ões)?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: apagarSelecionadas,
        },
      ]
    );
  }

  async function apagarNotificacao(item: any) {
    if (!user?.uid || item.clienteId !== user.uid) {
      return;
    }

    try {
      setNotificacoes(prev =>
        prev.filter(notif => notif.id !== item.id)
      );

      await firestore()
        .collection('notificacoes')
        .doc(item.id)
        .update({
  apagada: true,
  lida: true,
  apagadaEm: firestore.FieldValue.serverTimestamp(),
});

    } catch (e) {
      console.log('Erro apagar notificação:', e);

      setNotificacoes(prev =>
        prev.some(notif => notif.id === item.id)
          ? prev
          : [item, ...prev]
      );
    }
  }

  async function apagarSelecionadas() {
    if (!user?.uid) return;

    const idsSelecionados = new Set(selecionadas);
    const itensParaApagar = notificacoes.filter(
      item =>
        idsSelecionados.has(item.id) &&
        item.clienteId === user.uid
    );

    if (itensParaApagar.length === 0) {
      return;
    }

    try {
      setNotificacoes(prev =>
        prev.filter(item => !idsSelecionados.has(item.id))
      );
      cancelarSelecao();

      const batch = firestore().batch();

      itensParaApagar.forEach(item => {
        const ref = firestore()
          .collection('notificacoes')
          .doc(item.id);

       batch.update(ref, {
  apagada: true,
  lida: true,
  apagadaEm: firestore.FieldValue.serverTimestamp(),
});
      });

      await batch.commit();

    } catch (e) {
      console.log('Erro apagar notificações:', e);

      setNotificacoes(prev => {
        const idsAtuais = new Set(
          prev.map(item => item.id)
        );

        const restaurar = itensParaApagar.filter(
          item => !idsAtuais.has(item.id)
        );

        return [...restaurar, ...prev];
      });
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

    const estaSelecionada =
      selecionadas.includes(item.id);

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          if (selecionando) {
            alternarSelecao(item.id);
            return;
          }

          marcarComoLida(item.id, item.lida);
        }}
        style={[
          styles.card,
          !item.lida && styles.nLida,
          estaSelecionada && styles.cardSelecionado,
        ]}
      >
        <View style={styles.cardHeader}>

          {selecionando && (
            <View
              style={[
                styles.check,
                estaSelecionada && styles.checkAtivo,
              ]}
            >
              {estaSelecionada && (
                <Text style={styles.checkText}>
                  ✓
                </Text>
              )}
            </View>
          )}

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

          <View style={styles.cardAcoes}>
            {!item.lida && (
              <View style={styles.badgeNovo}>
                <Text style={styles.badgeTexto}>
                  NOVO
                </Text>
              </View>
            )}

            {!selecionando && (
              <TouchableOpacity
                activeOpacity={0.75}
                hitSlop={{
                  top: 8,
                  right: 8,
                  bottom: 8,
                  left: 8,
                }}
                accessibilityRole="button"
                accessibilityLabel="Apagar notificação"
                onPress={event => {
                  event.stopPropagation();
                  confirmarApagar(item);
                }}
                style={styles.btnApagar}
              >
                <Text style={styles.btnApagarText}>
                  Apagar
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!!mensagemFinal && (
          <Text style={styles.notifMsg}>
            {mensagemFinal}
          </Text>
        )}

        {!selecionando && (
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
        )}
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
        <View>
          <Text style={styles.titulo}>
            Notificações
          </Text>

          <View style={styles.linhaDourada} />
        </View>

        {notificacoes.length > 0 && (
          selecionando ? (
            <View style={styles.headerAcoes}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={alternarTodas}
                style={styles.headerBtn}
              >
                <Text style={styles.headerBtnText}>
                  {selecionadas.length === notificacoes.length
                    ? 'Limpar'
                    : 'Todas'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                disabled={selecionadas.length === 0}
                onPress={confirmarApagarSelecionadas}
                style={[
                  styles.headerBtn,
                  styles.headerBtnDanger,
                  selecionadas.length === 0 &&
                    styles.headerBtnDisabled,
                ]}
              >
                <Text style={styles.headerBtnDangerText}>
                  Apagar ({selecionadas.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={cancelarSelecao}
                style={styles.headerBtn}
              >
                <Text style={styles.headerBtnText}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={abrirSelecao}
              style={styles.headerBtn}
            >
              <Text style={styles.headerBtnText}>
                Selecionar
              </Text>
            </TouchableOpacity>
          )
        )}
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
  header: {
    paddingHorizontal: 25,
    marginTop: 20,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titulo: { fontSize: 28, fontWeight: '900', color: '#1A1A1A' },
  linhaDourada: { width: 40, height: 4, backgroundColor: '#D4AF37', marginTop: 5, borderRadius: 2 },

  headerAcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    maxWidth: 230,
  },

  headerBtn: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  headerBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },

  headerBtnDanger: {
    backgroundColor: '#C62828',
  },

  headerBtnDangerText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },

  headerBtnDisabled: {
    opacity: 0.5,
  },
  
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

  cardSelecionado: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFDF7',
  },

  nLida: { 
    borderColor: 'rgba(212, 175, 55, 0.3)',
    backgroundColor: '#FFFDF9',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardAcoes: {
    alignItems: 'flex-end',
    gap: 8,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    marginRight: 10,
  },
  checkAtivo: {
    backgroundColor: '#D4AF37',
  },
  checkText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
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

  btnApagar: {
    backgroundColor: '#FFF3F3',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  btnApagarText: {
    color: '#C62828',
    fontSize: 11,
    fontWeight: '800',
  },
  
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
