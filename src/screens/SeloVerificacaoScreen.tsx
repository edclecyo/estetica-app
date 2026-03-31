import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Platform, StatusBar,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

const GOLD = '#C9A96E';

export default function SeloVerificacaoScreen() {
  const navigation = useNavigation<any>();
  const { admin } = useAuth();
  const [estab, setEstab] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [solicitando, setSolicitando] = useState(false);

  useEffect(() => {
    if (!admin?.id) return;
    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', admin.id)
      .limit(1)
      .onSnapshot(snap => {
        if (!snap.empty) setEstab({ id: snap.docs[0].id, ...snap.docs[0].data() });
        setLoading(false);
      });
    return unsub;
  }, [admin?.id]);

  const totalAtendimentos = estab?.quantidadeAvaliacoes || 0;
  const negativas = estab?.avaliacoesNegativas || 0;
  const plano = estab?.plano || 'free';
  const verificado = estab?.verificado || false;
  const statusSolicitacao = estab?.solicitacaoSeloStatus;

  const criterios = [
    {
      label: 'Plano Pro ou Elite',
      ok: plano === 'pro' || plano === 'elite',
      valor: plano.toUpperCase(),
    },
    {
      label: '1.000+ atendimentos',
      ok: totalAtendimentos >= 1000,
      valor: `${totalAtendimentos} atendimentos`,
    },
    {
      label: 'Nenhuma avaliação negativa',
      ok: negativas === 0,
      valor: `${negativas} negativas`,
    },
    {
      label: 'Assinatura ativa',
      ok: estab?.assinaturaAtiva || false,
      valor: estab?.assinaturaAtiva ? 'Ativa' : 'Inativa',
    },
  ];

  const todosCriteriosOk = criterios.every(c => c.ok);

  const solicitar = async () => {
    if (!estab?.id) return;

    Alert.alert(
      'Solicitar Selo Verificado',
      `Uma taxa de R$ 14,90 será cobrada para análise.\n\nDeseja continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Solicitar',
          onPress: async () => {
            try {
              setSolicitando(true);
              await functions().httpsCallable('solicitarSelo')({
                estabelecimentoId: estab.id,
              });
              Alert.alert(
                '✅ Solicitação Enviada!',
                'Sua solicitação foi enviada para análise. Você será notificado em breve.'
              );
            } catch (e: any) {
              Alert.alert('Erro', e?.message || 'Não foi possível solicitar o selo.');
            } finally {
              setSolicitando(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={GOLD} size="large" /></View>;
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitulo}>✅ Selo Verificado</Text>
          <Text style={s.headerSub}>Destaque sua credibilidade</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* STATUS ATUAL */}
        {verificado ? (
          <View style={s.seloAtivoCard}>
            <Text style={s.seloAtivoEmoji}>✅</Text>
            <Text style={s.seloAtivoTitulo}>Você já tem o Selo Verificado!</Text>
            <Text style={s.seloAtivoSub}>
              Seu estabelecimento aparece com o selo ✅ para todos os clientes.
            </Text>
          </View>
        ) : plano === 'elite' ? (
          <View style={[s.seloAtivoCard, { borderColor: '#9C27B0' }]}>
            <Text style={s.seloAtivoEmoji}>👑</Text>
            <Text style={s.seloAtivoTitulo}>Plano Elite — Selo Automático</Text>
            <Text style={s.seloAtivoSub}>
              O plano Elite concede o selo verificado automaticamente. Mantenha o plano ativo.
            </Text>
          </View>
        ) : statusSolicitacao === 'pendente' ? (
          <View style={[s.seloAtivoCard, { borderColor: '#FF9800' }]}>
            <Text style={s.seloAtivoEmoji}>⏳</Text>
            <Text style={s.seloAtivoTitulo}>Solicitação em Análise</Text>
            <Text style={s.seloAtivoSub}>
              Sua solicitação foi enviada e está sendo analisada pela equipe BeautyHub.
            </Text>
          </View>
        ) : statusSolicitacao === 'rejeitado' ? (
          <View style={[s.seloAtivoCard, { borderColor: '#F44336' }]}>
            <Text style={s.seloAtivoEmoji}>❌</Text>
            <Text style={s.seloAtivoTitulo}>Solicitação Rejeitada</Text>
            <Text style={s.seloAtivoSub}>
              Verifique os critérios e tente novamente.
            </Text>
          </View>
        ) : null}

        {/* BENEFÍCIOS */}
        <View style={s.section}>
          <Text style={s.sectionTitulo}>BENEFÍCIOS DO SELO</Text>
          {[
            { ic: '✅', txt: 'Badge verificado visível para todos os clientes' },
            { ic: '🔝', txt: 'Prioridade nos resultados de busca' },
            { ic: '💎', txt: 'Maior taxa de conversão de agendamentos' },
            { ic: '🏆', txt: 'Símbolo de qualidade e confiança' },
          ].map(({ ic, txt }) => (
            <View key={txt} style={s.beneficioItem}>
              <Text style={s.beneficioIc}>{ic}</Text>
              <Text style={s.beneficioTxt}>{txt}</Text>
            </View>
          ))}
        </View>

        {/* CRITÉRIOS */}
        <View style={s.section}>
          <Text style={s.sectionTitulo}>CRITÉRIOS NECESSÁRIOS</Text>
          {criterios.map(c => (
            <View key={c.label} style={s.criterioRow}>
              <View style={[s.criterioDot, { backgroundColor: c.ok ? '#4CAF50' : '#FF5252' }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.criterioLabel}>{c.label}</Text>
                <Text style={[s.criterioValor, { color: c.ok ? '#4CAF50' : '#FF5252' }]}>
                  {c.valor}
                </Text>
              </View>
              <Text style={s.criterioCheck}>{c.ok ? '✅' : '❌'}</Text>
            </View>
          ))}
        </View>

        {/* COMO OBTER */}
        {!verificado && plano !== 'elite' && (
          <View style={s.section}>
            <Text style={s.sectionTitulo}>COMO OBTER</Text>

            <View style={s.opcaoCard}>
              <View style={s.opcaoHeader}>
                <Text style={s.opcaoEmoji}>💎</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.opcaoTitulo}>Plano Elite</Text>
                  <Text style={s.opcaoSub}>Selo automático incluso</Text>
                </View>
                <View style={s.opcaoGratisBadge}>
                  <Text style={s.opcaoGratisText}>GRÁTIS</Text>
                </View>
              </View>
              <Text style={s.opcaoDesc}>
                Faça upgrade para o plano Elite e ganhe o selo verificado automaticamente, sem taxa adicional.
              </Text>
              <TouchableOpacity
                style={s.opcaoBtn}
                onPress={() => navigation.navigate('Assinatura')}
              >
                <Text style={s.opcaoBtnText}>Ver Plano Elite →</Text>
              </TouchableOpacity>
            </View>

            {plano === 'pro' && (
              <View style={[s.opcaoCard, { marginTop: 12 }]}>
                <View style={s.opcaoHeader}>
                  <Text style={s.opcaoEmoji}>⭐</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.opcaoTitulo}>Solicitar como Pro</Text>
                    <Text style={s.opcaoSub}>Taxa única de análise</Text>
                  </View>
                  <View style={[s.opcaoGratisBadge, { backgroundColor: 'rgba(201,169,110,0.15)' }]}>
                    <Text style={[s.opcaoGratisText, { color: GOLD }]}>R$ 14,90</Text>
                  </View>
                </View>
                <Text style={s.opcaoDesc}>
                  Se você atende todos os critérios com o plano Pro, pode solicitar o selo pagando uma taxa de análise de R$ 14,90.
                </Text>

                <TouchableOpacity
                  style={[
                    s.opcaoBtn,
                    (!todosCriteriosOk || solicitando) && s.opcaoBtnDisabled,
                  ]}
                  onPress={todosCriteriosOk ? solicitar : () =>
                    Alert.alert('Critérios não atendidos', 'Atenda todos os critérios para solicitar o selo.')
                  }
                  disabled={solicitando}
                >
                  {solicitando
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={s.opcaoBtnText}>
                        {todosCriteriosOk ? 'Solicitar Selo →' : 'Critérios não atendidos'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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
  backBtn: { backgroundColor: '#2A2A2A', width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: GOLD, fontSize: 20 },
  headerTitulo: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  headerSub: { color: '#C9A96E', fontSize: 11, marginTop: 2 },

  scroll: { padding: 16 },

  seloAtivoCard: {
    backgroundColor: '#FFF',
    borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 2, borderColor: '#4CAF50',
  },
  seloAtivoEmoji: { fontSize: 48, marginBottom: 12 },
  seloAtivoTitulo: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 6, textAlign: 'center' },
  seloAtivoSub: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },

  section: { marginBottom: 20 },
  sectionTitulo: { color: GOLD, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14 },

  beneficioItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1 },
  beneficioIc: { fontSize: 20 },
  beneficioTxt: { color: '#333', fontSize: 13, fontWeight: '500', flex: 1 },

  criterioRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12, elevation: 1 },
  criterioDot: { width: 10, height: 10, borderRadius: 5 },
  criterioLabel: { color: '#1A1A1A', fontSize: 13, fontWeight: '600' },
  criterioValor: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  criterioCheck: { fontSize: 16 },

  opcaoCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, elevation: 2 },
  opcaoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  opcaoEmoji: { fontSize: 28 },
  opcaoTitulo: { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },
  opcaoSub: { color: '#888', fontSize: 11, marginTop: 2 },
  opcaoGratisBadge: { backgroundColor: 'rgba(76,175,80,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  opcaoGratisText: { color: '#4CAF50', fontSize: 11, fontWeight: '900' },
  opcaoDesc: { color: '#666', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  opcaoBtn: { backgroundColor: '#1A1A1A', borderRadius: 14, padding: 16, alignItems: 'center' },
  opcaoBtnDisabled: { backgroundColor: '#CCC' },
  opcaoBtnText: { color: GOLD, fontSize: 14, fontWeight: '800' },
});