import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';

import firestore from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Notif {
  id: string;

  adminId?: string;
  agendamentoId?: string;
  estabelecimentoId?: string;
  solicitacaoId?: string;

  clienteNome?: string;
  servicoNome?: string;

  data?: string;
  horario?: string;

  status?: string;
  type?: string;

  titulo?: string;
  msg?: string;
  mensagem?: string;

  lida?: boolean;
  apagada?: boolean;

  criadoEm?: any;
  expiraEm?: any;
}

export default function AdminNotifScreen() {
  const navigation = useNavigation<any>();
  const { admin } = useAuth();

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionando, setSelecionando] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  useEffect(() => {
    if (!admin?.id) return;

    const unsub = firestore()
  .collection('notificacoes')
  .where('adminId', '==', admin.id)
  .orderBy('criadoEm', 'desc')
  .limit(50)
  .onSnapshot(
        snap => {
          const agora = new Date();

const lista = snap.docs
  .map(doc => ({
    id: doc.id,
    ...doc.data(),
  }))
  .filter((item: any) => item.apagada !== true)
  .filter((item: any) => {
    if (!item.expiraEm?.toDate) return true;
    return item.expiraEm.toDate() > agora;
  }) as Notif[];

          setNotifs(lista);
          setLoading(false);
        },
        err => {
          console.log('Notif error:', err);
          setLoading(false);
        }
      );

    return () => unsub();
  }, [admin?.id]);

  async function marcarLida(id: string) {
    try {
      setNotifs(prev =>
        prev.map(n =>
          n.id === id
            ? { ...n, lida: true }
            : n
        )
      );

      await firestore()
        .collection('notificacoes')
        .doc(id)
        .update({
          lida: true,
        });

    } catch (e) {
      console.log('Erro marcar lida:', e);
    }
  }

  function confirmarApagar(item: Notif) {
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
    if (selecionadas.length === notifs.length) {
      setSelecionadas([]);
      return;
    }

    setSelecionadas(notifs.map(item => item.id));
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

  async function apagarNotificacao(item: Notif) {
    if (!admin?.id || item.adminId !== admin.id) {
      return;
    }

    try {
      setNotifs(prev =>
        prev.filter(n => n.id !== item.id)
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

      setNotifs(prev =>
        prev.some(n => n.id === item.id)
          ? prev
          : [item, ...prev]
      );
    }
  }

  async function apagarSelecionadas() {
    if (!admin?.id) return;

    const idsSelecionados = new Set(selecionadas);
    const itensParaApagar = notifs.filter(
      item =>
        idsSelecionados.has(item.id) &&
        item.adminId === admin.id
    );

    if (itensParaApagar.length === 0) {
      return;
    }

    try {
      setNotifs(prev =>
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
      setNotifs(prev => {
        const idsAtuais = new Set(prev.map(item => item.id));
        const restaurar = itensParaApagar.filter(
          item => !idsAtuais.has(item.id)
        );

        return [...restaurar, ...prev];
      });
    }
  }

    function getInfo(item: Notif) {
    const tipo = item.type;

    switch (tipo) {

case 'NEW_BOOKING':
case 'NEW_SLOT':
case 'agendamento':
  return {
    emoji: '📅',
    cor: '#4CAF50',
    label: 'Agendamento',
    bg: '#E8F5E9',
  };

case 'SELO_APROVADO':
  return {
    emoji: 'OK',
    cor: '#4CAF50',
    label: 'Selo aprovado',
    bg: '#E8F5E9',
  };

case 'SELO_REJEITADO':
  return {
    emoji: 'X',
    cor: '#F44336',
    label: 'Selo',
    bg: '#FFEBEE',
  };

case 'SELO_LIBERADO':
  return {
    emoji: 'VIP',
    cor: '#C9A96E',
    label: 'Selo liberado',
    bg: '#FFF8E1',
  };

case 'IMPULSIONAMENTO_ATIVO':
  return {
    emoji: '*',
    cor: '#FF9800',
    label: 'Destaque',
    bg: '#FFF3E0',
  };

case 'IMPULSIONAMENTO_VENCENDO':
  return {
    emoji: '!',
    cor: '#F57C00',
    label: 'Destaque',
    bg: '#FFF3E0',
  };

      default:
        return {
          emoji: '📋',
          cor: '#999',
          label: 'Notificação',
          bg: '#F5F5F5',
        };
    }
  }

  if (loading) {
    return (
      <View
        style={[
          s.container,
          {
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
      >
        <ActivityIndicator
          size="large"
          color="#C9A96E"
        />

        <Text
          style={{
            marginTop: 12,
            color: '#AAA',
          }}
        >
          Carregando notificações...
        </Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#1A1A1A"
      />

      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitulo}>
            🔔 Notificações
          </Text>

          <Text style={s.headerSub}>
            {notifs.filter(n => !n.lida).length} não lida(s)
          </Text>
        </View>

        {notifs.length > 0 && (
          selecionando ? (
            <View style={s.headerAcoes}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={alternarTodas}
                style={s.headerBtn}
              >
                <Text style={s.headerBtnText}>
                  {selecionadas.length === notifs.length
                    ? 'Limpar'
                    : 'Todas'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={confirmarApagarSelecionadas}
                style={[
                  s.headerBtn,
                  s.headerBtnDanger,
                  selecionadas.length === 0 && s.headerBtnDisabled,
                ]}
              >
                <Text style={s.headerBtnDangerText}>
                  Apagar ({selecionadas.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={cancelarSelecao}
                style={s.headerBtn}
              >
                <Text style={s.headerBtnText}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={abrirSelecao}
              style={s.headerBtn}
            >
              <Text style={s.headerBtnText}>
                Selecionar
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <FlatList
        data={notifs}
        keyExtractor={i => i.id}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.vazio}>
            <Text style={s.vazioEmoji}>🔕</Text>

            <Text style={s.vazioText}>
              Nenhuma notificação
            </Text>
          </View>
        }
        renderItem={({ item }) => {

          const info = getInfo(item);
          const estaSelecionada =
            selecionadas.includes(item.id);

          const dataFormatada =
            item.criadoEm?.toDate
              ? format(
                  item.criadoEm.toDate(),
                  "dd/MM 'às' HH:mm",
                  { locale: ptBR }
                )
              : '...';

          const mensagemFinal =
            item.msg ||
            item.mensagem ||
            '';

          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={async () => {
                if (selecionando) {
                  alternarSelecao(item.id);
                  return;
                }

                await marcarLida(item.id);

                if (
                  item.agendamentoId &&
                  (
                    item.type === 'NEW_SLOT' ||
                    item.type === 'NEW_BOOKING'
                  )
                ) {
                  navigation.navigate(
                    'detalhes_agendamento',
                    {
                      id: item.agendamentoId,
                    }
                  );
                  return;
                }

                if (item.type === 'SELO_APROVADO') {
                  navigation.navigate('SeloPagamentoScreen', {
                    solicitacaoId: item.solicitacaoId,
                    estabelecimentoId: item.estabelecimentoId,
                  });
                  return;
                }

                if (
                  item.type === 'SELO_REJEITADO' ||
                  item.type === 'SELO_LIBERADO'
                ) {
                  navigation.navigate('SeloVerificacaoScreen');
                  return;
                }

                if (
                  item.type === 'IMPULSIONAMENTO_ATIVO' ||
                  item.type === 'IMPULSIONAMENTO_VENCENDO'
                ) {
                  navigation.navigate('ImpulsionarScreen', {
                    estabelecimentoId: item.estabelecimentoId,
                  });
                }
              }}
              style={[
                s.card,
                !item.lida && s.naoLida,
                estaSelecionada && s.cardSelecionado,
              ]}
            >
              <View style={s.topo}>

                <View style={s.topoEsquerda}>
                  {selecionando && (
                    <View
                      style={[
                        s.check,
                        estaSelecionada && s.checkAtivo,
                      ]}
                    >
                      {estaSelecionada && (
                        <Text style={s.checkText}>
                          ✓
                        </Text>
                      )}
                    </View>
                  )}

                  <View
                    style={[
                      s.badge,
                      {
                        backgroundColor: info.bg,
                      },
                    ]}
                  >
                    <Text>{info.emoji}</Text>

                    <Text
                      style={[
                        s.label,
                        {
                          color: info.cor,
                        },
                      ]}
                    >
                      {info.label}
                    </Text>
                  </View>
                </View>

                <View style={s.acoesTopo}>
                  {!item.lida && (
                    <View style={s.ponto} />
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
                      style={s.btnApagar}
                    >
                      <Text style={s.btnApagarText}>
                        Apagar
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Text style={s.titulo}>
                {item.titulo ||
                  item.clienteNome ||
                  'Notificação'}
              </Text>

              {!!item.servicoNome && (
                <Text style={s.info}>
                  💆 {item.servicoNome}
                </Text>
              )}

              {!!item.data && (
                <Text style={s.info}>
                  📅 {item.data}
                </Text>
              )}

              {!!item.horario && (
                <Text style={s.info}>
                  ⏰ {item.horario}
                </Text>
              )}

              {!!mensagemFinal && (
                <Text style={s.msg}>
                  {mensagemFinal}
                </Text>
              )}

              {item.type === 'SELO_APROVADO' && !selecionando && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={s.btnAcaoPrincipal}
                  onPress={event => {
                    event.stopPropagation();
                    navigation.navigate('SeloPagamentoScreen', {
                      solicitacaoId: item.solicitacaoId,
                      estabelecimentoId: item.estabelecimentoId,
                    });
                  }}
                >
                  <Text style={s.btnAcaoPrincipalText}>
                    Pagar taxa do selo
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={s.data}>
                {dataFormatada}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },

  header: {
    backgroundColor: '#1A1A1A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 20,
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight ?? 24) + 10
        : 50,
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

  headerAcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 230,
  },

  headerBtn: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  headerBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  headerBtnDanger: {
    backgroundColor: '#C62828',
  },

  headerBtnDangerText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  headerBtnDisabled: {
    opacity: 0.5,
  },

  lista: {
    padding: 16,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },

  cardSelecionado: {
    borderWidth: 1,
    borderColor: '#C9A96E',
    backgroundColor: '#FFFDF7',
  },

  naoLida: {
    borderLeftWidth: 3,
    borderLeftColor: '#C9A96E',
  },

  topo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  topoEsquerda: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 8,
  },

  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#C9A96E',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },

  checkAtivo: {
    backgroundColor: '#C9A96E',
  },

  checkText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
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

  acoesTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  btnApagar: {
    backgroundColor: '#FFF3F3',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  btnApagarText: {
    color: '#C62828',
    fontSize: 11,
    fontWeight: '700',
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

  btnAcaoPrincipal: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },

  btnAcaoPrincipalText: {
    color: '#C9A96E',
    fontSize: 12,
    fontWeight: '800',
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
