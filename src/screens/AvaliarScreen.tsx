import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';

import firestore from '@react-native-firebase/firestore';
import {
  getFunctions,
  httpsCallable,
} from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';
import { useNavigation, useRoute } from '@react-navigation/native';

const TAGS = [
  '👏 Ótimo atendimento',
  '⏰ Pontual',
  '✨ Ambiente limpo',
  '💰 Preço justo',
  '😊 Profissional simpático',
  '🎯 Resultado perfeito',
  '📱 Fácil de agendar',
  '🔄 Voltarei mais vezes',
];

export default function AvaliarScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const {
    agendamentoId,
    estabelecimentoNome,
  } = route.params || {};

  const [estrelas, setEstrelas] = useState(0);
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agendamento, setAgendamento] = useState<any>(null);

  useEffect(() => {
    if (!agendamentoId) {
      setLoading(false);
      return;
    }

    firestore()
      .collection('agendamentos')
      .doc(agendamentoId)
      .get()
      .then(doc => {
        if (doc.exists) {
          setAgendamento({
            id: doc.id,
            ...doc.data(),
          });
        }
      })
      .catch(e => {
        console.log('Erro ao buscar agendamento:', e);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [agendamentoId]);

  const toggleTag = (tag: string) => {
    setTagsSel(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const salvar = async () => {
    if (!agendamentoId) {
      Alert.alert('Erro', 'Agendamento inválido.');
      return;
    }

    if (estrelas === 0) {
      Alert.alert('Atenção', 'Selecione uma nota.');
      return;
    }

    if (agendamento?.avaliacao) {
      Alert.alert(
        'Já avaliado',
        'Você já avaliou este atendimento.'
      );
      return;
    }

    if (agendamento?.status !== 'concluido') {
      Alert.alert(
        'Atenção',
        'Só é possível avaliar atendimentos concluídos.'
      );
      return;
    }

    try {
      setSalvando(true);

      const functionsInstance = getFunctions(
        getApp(),
        'southamerica-east1'
      );

      const fn = httpsCallable(
        functionsInstance,
        'avaliarAgendamento'
      );

      const res: any = await fn({
        agendamentoId,
        estrelas,
        tags: tagsSel,
      });

      console.log('AVALIAÇÃO:', res.data);

      Alert.alert(
        'Obrigado! 🎉',
        'Avaliação enviada com sucesso!',
        [
          {
            text: 'OK',
           onPress: () =>
  navigation.reset({
    index: 0,
    routes: [
      {
        name: 'HomeTabs',
        params: { screen: 'Agendamentos' },
      },
    ],
  })
          },
        ]
      );
    } catch (e: any) {
      console.log('Erro avaliação:', e);

      const code = e?.code || '';
      const message =
        e?.message || 'Não foi possível enviar a avaliação.';

      if (code.includes('already-exists')) {
        Alert.alert(
          'Já avaliado',
          'Você já avaliou este atendimento.'
        );
        return;
      }

      if (code.includes('permission-denied')) {
        Alert.alert(
          'Sem permissão',
          'Você não pode avaliar este atendimento.'
        );
        return;
      }

      if (code.includes('failed-precondition')) {
        Alert.alert('Atenção', message);
        return;
      }

      if (code.includes('unauthenticated')) {
        Alert.alert(
          'Sessão expirada',
          'Faça login novamente.'
        );
        return;
      }

      Alert.alert('Erro', message);
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <TouchableOpacity
          style={s.voltarBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={s.voltarBtnText}>←</Text>
        </TouchableOpacity>

        <Text style={s.headerSub}>AVALIAÇÃO</Text>

        <Text style={s.headerTitulo}>
          {estabelecimentoNome ||
            agendamento?.estabelecimentoNome ||
            'Estabelecimento'}
        </Text>
      </View>

      <View style={s.body}>
        <View style={s.card}>
          <Text style={s.cardTitulo}>
            Como foi sua experiência?
          </Text>

          <View style={s.estrelasWrap}>
            {[1, 2, 3, 4, 5].map(i => (
              <TouchableOpacity
                key={i}
                onPress={() => setEstrelas(i)}
              >
                <Text
                  style={[
                    s.estrela,
                    i <= estrelas && s.estrelaAtiva,
                  ]}
                >
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.estrelasLabel}>
            {estrelas === 0
              ? 'Toque para avaliar'
              : estrelas === 1
              ? 'Muito ruim 😞'
              : estrelas === 2
              ? 'Ruim 😐'
              : estrelas === 3
              ? 'Bom 🙂'
              : estrelas === 4
              ? 'Muito bom 😊'
              : 'Excelente! 🤩'}
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitulo}>
            O que você mais gostou?
            {'\n'}
            <Text style={s.cardSub}>(Opcional)</Text>
          </Text>

          <View style={s.tagsWrap}>
            {TAGS.map(tag => (
              <TouchableOpacity
                key={tag}
                onPress={() => toggleTag(tag)}
                style={[
                  s.tag,
                  tagsSel.includes(tag) && s.tagAtiva,
                ]}
              >
                <Text
                  style={[
                    s.tagText,
                    tagsSel.includes(tag) &&
                      s.tagTextAtiva,
                  ]}
                >
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.footer}>
          <TouchableOpacity
            style={[
              s.btnPrimario,
              (estrelas === 0 || salvando) &&
                s.btnDisabled,
            ]}
            disabled={estrelas === 0 || salvando}
            onPress={salvar}
          >
            {salvando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnPrimarioText}>
                Enviar Avaliação
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnSecundario}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.btnSecundarioText}>
              Agora não, voltar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },

  header: {
    backgroundColor: '#1A1A1A',
    padding: 24,
    paddingTop: 52,
    alignItems: 'center',
  },

  voltarBtn: {
    position: 'absolute',
    top: 52,
    left: 20,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  voltarBtnText: {
    color: '#fff',
    fontSize: 20,
  },

  headerSub: {
    color: '#C9A96E',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 4,
  },

  headerTitulo: {
    color: '#FAF7F4',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },

  body: {
    padding: 16,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    elevation: 2,
  },

  cardTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
    textAlign: 'center',
  },

  cardSub: {
    fontSize: 12,
    color: '#999',
    fontWeight: '400',
  },

  estrelasWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },

  estrela: {
    fontSize: 46,
    color: '#E9ECEF',
  },

  estrelaAtiva: {
    color: '#F4A261',
  },

  estrelasLabel: {
    textAlign: 'center',
    fontSize: 14,
    color: '#ADB5BD',
    fontWeight: '600',
  },

  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },

  tag: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },

  tagAtiva: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },

  tagText: {
    fontSize: 13,
    color: '#495057',
    fontWeight: '500',
  },

  tagTextAtiva: {
    color: '#fff',
    fontWeight: '700',
  },

  footer: {
    marginTop: 8,
  },

  btnPrimario: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },

  btnPrimarioText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  btnSecundario: {
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginBottom: 40,
  },

  btnSecundarioText: {
    color: '#ADB5BD',
    fontSize: 14,
    fontWeight: '600',
  },

  btnDisabled: {
    backgroundColor: '#DEE2E6',
  },
});