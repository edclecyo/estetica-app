import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StatusBar, Platform, TextProps
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import {
  getFunctions,
  httpsCallable
} from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const GOLD_GRADIENT = ['#D4AF37', '#F9E29B', '#B8860B'];
const GOLD_TXT_GRADIENT = ['#C9A96E', '#F9E29B', '#B8860B'];
const DARK_GRADIENT = ['#1A1A1A', '#0D0D0D', '#000'];
const GOLD = '#D4AF37';
const IS_WEB = Platform.OS === 'web';
type PlanoId = 'free' | 'trial' | 'essencial' | 'pro' | 'elite';
type TrialResponse = { ok?: boolean; message?: string };

const GradientText = (props: TextProps) => (
  <MaskedView maskElement={<Text {...props} />}>
    <LinearGradient colors={GOLD_TXT_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Text {...props} style={[props.style, { opacity: 0 }]} />
    </LinearGradient>
  </MaskedView>
);

const PLANOS = [
  {
    id: 'essencial',

    nome: 'ESSENCIAL',

    preco: '29,90',

    cor: '#C9A96E',

    storyLimite: 'Stories com fotos',
    videoLimite: 'Sem vídeos',

    resumo:
      'Organize seu negócio, automatize agendamentos e comece profissionalmente.',

    features: [
      '2 estabelecimentos',
      '20 serviços cadastrados',
      'Agenda online inteligente',
      'Confirmação automática de agendamentos',
      'Bloqueio de horários e folgas',
      'Notificações automáticas',
      'Stories com foto por 24h',
      'Resumo básico de faturamento',
      'Perfil profissional no app',
      'Impulsionamento disponível',
      'Suporte prioritário',
    ],
  },

  {
    id: 'pro',

    nome: 'PROFESSIONAL',

    preco: '49,90',

    cor: GOLD,

    popular: true,

    storyLimite: 'Fotos + videos ate 15s',
    videoLimite: 'Videos ate 15 segundos',

    resumo:
      'Venda pelo app, receba pagamentos via PIX e aumente sua autoridade.',

    features: [
      '5 estabelecimentos',
      '80 serviços cadastrados',
      'Tudo do Essencial',
      'Recebimento via PIX no app',
      'QR Code automático para pagamentos',
      'Resumo de pedido via WhatsApp',
      'Confirmação manual de pagamentos',
      'Relatório financeiro profissional em PDF',
      'Stories com vídeos',
      'Videos ate 15 segundos',
      'Métricas de visualização',
      'Solicitação de selo verificado',
      'Mais alcance e reputação',
      'Prioridade nas buscas do app',
      'Mais visibilidade no feed',
      'Impulsionamento avançado disponível',
    ],
  },

  {
    id: 'elite',

    nome: 'ELITE VIP',

    preco: '89,90',

    cor: '#FFD700',

    storyLimite: 'Fotos + vídeos até 30s',
    videoLimite: 'Vídeos até 30 segundos',

    resumo:
      'Máxima autoridade, selo automático, destaque premium e alcance avançado.',

    features: [
      'Estabelecimentos ilimitados',
      'Serviços ilimitados',
      'Tudo do Professional',
      'Selo verificado automático',
      'Destaque básico automático incluso',
      'Visibilidade premium no app',
      'Maior prioridade nas buscas',
      'Mais alcance no feed',
      'Relatório financeiro premium detalhado',
      'Resumo financeiro avançado',
      'Vídeos até 30 segundos',
      'Stories premium com maior alcance',
      'Maior reputação e autoridade',
      'Impulsionamento premium disponível',
      'Recursos exclusivos Elite',
      'Prioridade máxima no suporte',
    ],
  },
];

export default function AssinaturaScreen({ navigation }: any) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [loadingDados, setLoadingDados] = useState(true);
  const [estId, setEstId] = useState<string | null>(null);
  const [planoAtualId, setPlanoAtualId] = useState<PlanoId>('free');
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
  const [trialUsado, setTrialUsado] = useState(false);
  const [trialAtivo, setTrialAtivo] = useState(false);
  useEffect(() => {
    const user = auth().currentUser;
    if (!user) return;

    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', user.uid)
      .limit(1)
      .onSnapshot(snapshot => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();

          setEstId(doc.id);
          setPlanoAtualId((data.plano || 'free') as PlanoId);
          setTrialUsado(!!data.trialUsado);

          const expira =
            data.expiraEm?.toDate?.() ??
            (data.expiraEm ? new Date(data.expiraEm) : null);

          const agora = new Date();

          const trialAtivoCalc =
            data.plano === 'trial' &&
            expira &&
            expira > agora;

          const assinaturaAtivaCalc =
            !!data.assinaturaAtiva &&
            (!expira || expira > agora);
          setTrialAtivo(trialAtivoCalc);
          setAssinaturaAtiva(assinaturaAtivaCalc);
        }
        setLoadingDados(false);
      });

    return () => unsub();
  }, []);

  const handleTrialPress = () => {
    if (!estId) return Alert.alert("Erro", "Crie um estabelecimento primeiro");
    if (trialUsado) return Alert.alert("Aviso", "Teste já usado");

    Alert.alert("Ativar Teste", "Iniciar 7 dias grátis?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Ativar", onPress: iniciarTrial }
    ]);
  };

  const iniciarTrial = async () => {
    setLoadingAction('trial');

    try {
      const functionsInstance = getFunctions(
  getApp(),
  'southamerica-east1'
);

const fn = httpsCallable(
  functionsInstance,
  'iniciarTrial'
);

const res = await fn({
  estabelecimentoId: estId
});

      const data = res.data as TrialResponse;

      if (data?.ok) {
        Alert.alert("Sucesso", "Trial ativado!");
      } else {
        Alert.alert("Aviso", data?.message || "Erro ao ativar trial");
      }
    } catch {
      Alert.alert("Erro", "Falha de conexão");
    } finally {
      setLoadingAction(null);
    }
  };

  if (loadingDados || !estId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.headerUnificado}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="chevron-left" size={32} color={GOLD} />
          </TouchableOpacity>

          <GradientText style={styles.headerTitle}>EXCELLENCE</GradientText>
          <GradientText style={styles.headerSubtitle}>
            Escolha seu nível de exclusividade
          </GradientText>
        </View>

        {/* TRIAL */}
        {!assinaturaAtiva && !trialAtivo && (
          <TouchableOpacity onPress={handleTrialPress} style={styles.trialWrapper}>
            <LinearGradient colors={GOLD_GRADIENT} style={styles.trialCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.trialTitle}>7 DIAS GRATIS</Text>
                <Text style={styles.trialSub}>
                  Teste do Essencial: 2 locais, 20 servicos e stories apenas com foto
                </Text>
              </View>

              {loadingAction === 'trial' ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Icon name={trialUsado ? "lock" : "crown"} size={32} color="#000" />
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}


        {/* PLANOS */}
        <View style={styles.listContainer}>
          {PLANOS.map((plano) => {
            const isAtivo = plano.id === planoAtualId && assinaturaAtiva;

            return (
              <LinearGradient key={plano.id} colors={DARK_GRADIENT} style={styles.planCard}>

                {plano.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>RECOMENDADO</Text>
                  </View>
                )}

                <Text style={[styles.planName, { color: plano.cor }]}>
                  {plano.nome}
                </Text>

                <Text style={styles.planResumo}>
                  {plano.resumo}
                </Text>

                <View style={styles.priceRow}>
                  <Text style={styles.priceVal}>R$ {plano.preco}</Text>
                </View>
<View style={styles.limitBox}>
  <View style={styles.limitLine}>
    <Icon name="camera-outline" color={plano.cor} size={16} />
    <Text style={styles.limitText}>{plano.storyLimite}</Text>
  </View>
  <View style={styles.limitLine}>
    <Icon name="video-outline" color={plano.cor} size={16} />
    <Text style={styles.limitText}>{plano.videoLimite}</Text>
  </View>
</View>
                {plano.features.map((f, i) => (
                  <View key={i} style={styles.featureItem}>
                    <Icon name="check" color={plano.cor} size={18} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
				
                <TouchableOpacity
                  disabled={isAtivo}
                  onPress={() => navigation.navigate('CheckoutPagamentoScreen', {
                    planoId: plano.id,
                    estabelecimentoId: estId,
                    planoNome: plano.nome,
                    valor: Number(plano.preco.replace(',', '.')),
                  })}
                >
                  <LinearGradient
                    colors={isAtivo ? ['#333', '#222'] : GOLD_GRADIENT}
                    style={styles.mainBtn}
                  >
                    <Text style={styles.mainBtnText}>
                      {isAtivo ? 'SEU PLANO ATUAL' : `ASSINAR ${plano.nome}`}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

              </LinearGradient>
            );
          })}

          <View style={styles.noticeCard}>
            <Icon name="information-outline" color={GOLD} size={20} />
            <Text style={styles.noticeText}>
  Todos os planos podem contratar impulsionamento extra.
  O Elite já inclui destaque básico automático enquanto estiver ativo.
</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  
  scrollContent: { paddingBottom: 40 },

  // Header Unificado (Título, Subtítulo, Botão Voltar)
  headerUnificado: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 60,
    paddingBottom: 25,
    backgroundColor: '#000',
  },
  titleBlock: { marginTop: 15 },
  headerTitle: { fontSize: IS_WEB ? 26 : 32, fontWeight: '900', letterSpacing: IS_WEB ? 1 : 2 },
  headerSubtitle: { fontSize: IS_WEB ? 12 : 13, fontWeight: '700', marginTop: 3 },
  backBtn: { alignSelf: 'flex-start', marginLeft: -5 },
  
limitBox: {
  backgroundColor: 'rgba(212,175,55,0.08)',
  borderWidth: 1,
  borderColor: 'rgba(212,175,55,0.18)',
  borderRadius: 14,
  padding: 12,
  marginBottom: 18,
},
limitText: {
  color: '#D4AF37',
  fontSize: 12,
  fontWeight: '700',
},
limitLine: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  marginBottom: 5,
},
  // Trial Card Reformado
  trialWrapper: { marginHorizontal: IS_WEB ? 14 : 20, marginBottom: IS_WEB ? 18 : 30 },
  trialCard: { 
    padding: IS_WEB ? 16 : 22, 
    borderRadius: IS_WEB ? 14 : 20, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    elevation: 8,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  trialTextCol: { flex: 1, marginRight: 15 },
  trialIconCol: { width: 50, alignItems: 'flex-end' },
  trialTitle: { color: '#000', fontWeight: '900', fontSize: IS_WEB ? 18 : 22 },
  trialSub: { color: 'rgba(0,0,0,0.7)', fontSize: IS_WEB ? 12 : 13, fontWeight: '700', marginTop: 2 },

  // Listagem de Planos
  listContainer: { paddingHorizontal: IS_WEB ? 14 : 20 },
  planCard: { 
    padding: IS_WEB ? 16 : 25, 
    paddingTop: IS_WEB ? 24 : 30,
    borderRadius: IS_WEB ? 14 : 25, 
    marginBottom: IS_WEB ? 16 : 25, 
    borderWidth: 1, 
    borderColor: '#222', 
    backgroundColor: 'rgba(255, 255, 255, 0.02)', // Efeito leve de vidro
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  popularCard: { borderColor: GOLD, borderWidth: 1.5, marginTop: 15 }, // Margem extra p/ badge
  popularBadge: { 
    position: 'absolute', 
    top: -14, // Centralizado na borda
    alignSelf: 'center', 
    backgroundColor: GOLD, 
    paddingHorizontal: 18, 
    paddingVertical: 5, 
    borderRadius: 15,
    zIndex: 10,
  },
  popularBadgeText: { color: '#000', fontSize: 11, fontWeight: '900' },

  planName: { fontSize: 14, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  planResumo: { color: '#AAA', fontSize: IS_WEB ? 12 : 13, lineHeight: IS_WEB ? 18 : 19, marginBottom: 14 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  currency: { color: '#FFF', fontSize: 18, marginTop: 12, marginRight: 5 },
  priceVal: { color: '#FFF', fontSize: IS_WEB ? 38 : 55, fontWeight: 'bold' },
  priceCents: { color: '#FFF', fontSize: 24, marginTop: 15 },
  pricePeriod: { color: '#888', fontSize: 12, marginTop: 26, marginLeft: 3 },

  featureList: { marginBottom: 35 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: IS_WEB ? 10 : 14 },
  featureText: { color: '#EEE', marginLeft: IS_WEB ? 10 : 15, fontSize: IS_WEB ? 13 : 15, fontWeight: '500', flex: 1, lineHeight: IS_WEB ? 18 : undefined },

  mainBtn: { minHeight: IS_WEB ? 50 : 58, borderRadius: IS_WEB ? 12 : 18, justifyContent: 'center', alignItems: 'center', marginTop: 10, paddingHorizontal: 10 },
  mainBtnText: { color: '#000', fontWeight: 'bold', fontSize: IS_WEB ? 13 : 16, letterSpacing: IS_WEB ? 0 : 1, textAlign: 'center' },
  noticeCard: {
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 20,
  },
  noticeText: {
    color: '#C9A96E',
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
});
