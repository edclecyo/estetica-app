import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StatusBar, Dimensions, Platform
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view'; // 🔥 Instalação necessária
import firestore from '@react-native-firebase/firestore';
import { functions, httpsCallable } from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Cores e Gradientes Premium
const GOLD_GRADIENT = ['#D4AF37', '#F9E29B', '#B8860B'];
const GOLD_TXT_GRADIENT = ['#C9A96E', '#F9E29B', '#B8860B'];
const DARK_GRADIENT = ['#1A1A1A', '#0D0D0D', '#000'];
const GOLD = '#D4AF37';

// Componente para Texto com Gradiente
const GradientText = (props) => (
  <MaskedView maskElement={<Text {...props} />}>
    <LinearGradient colors={GOLD_TXT_GRADIENT} start={{x:0, y:0}} end={{x:1, y:1}}>
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
    features: ['Até 2 profissionais', 'Gestão de Agendas', 'Relatórios Mensais']
  },
  {
    id: 'pro',
    nome: 'PROFESSIONAL',
    preco: '49,90',
    cor: GOLD,
    popular: true,
    features: ['Profissionais Ilimitados', 'Gestão de Comissões', 'Estatísticas VIP', 'Suporte Prioritário']
  },
  {
    id: 'elite',
    nome: 'ELITE VIP',
    preco: '89,99',
    cor: '#FFD700',
    features: ['Destaque no Ranking', 'Selo de Verificado', 'Gerente Dedicado', 'Marketing Integrado']
  },
];

export default function AssinaturaScreen({ navigation }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [loadingDados, setLoadingDados] = useState(true);
  const [estId, setEstId] = useState(null);
  const [planoAtualId, setPlanoAtualId] = useState('free');
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
  const [trialUsado, setTrialUsado] = useState(false);

  useEffect(() => {
    const user = auth().currentUser;
    if (!user) return;

    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', user.uid)
      .limit(1)
      .onSnapshot(snapshot => {
        if (snapshot && !snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          setEstId(doc.id);
          setPlanoAtualId(data.plano || 'free');
          setTrialUsado(!!data.trialUsado);

          const expira = data.expiraEm && data.expiraEm.toDate ? data.expiraEm.toDate() : null;
          const ativo = expira ? expira > new Date() : false;
          setAssinaturaAtiva(!!data.assinaturaAtiva && ativo);
        }
        setLoadingDados(false);
      }, () => setLoadingDados(false));

    return () => unsub();
  }, []);

  const handleTrialPress = () => {
    if (!estId) {
      Alert.alert("💎 Quase lá!", "Para ativar seus 7 dias de teste gratuito, crie um estabelecimento primeiro.", [{ text: "Entendido" }]);
      return;
    }
    if (trialUsado) {
      Alert.alert("Aviso", "O período de teste já foi utilizado.");
      return;
    }
    Alert.alert("Ativar Teste", "Deseja iniciar seus 7 dias de acesso Premium agora?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Ativar", onPress: callsIniciarTrial }
    ]);
  };

  const callsIniciarTrial = async () => {
    if (!estId) {
      Alert.alert("Erro", "ID inválido.");
      return;
    }
    setLoadingAction('trial');
    try {
      const iniciarTrial = httpsCallable(functions('southamerica-east1'), 'iniciarTrial');
      const res = await iniciarTrial({ estabelecimentoId: estId });
      if (res.data && res.data.ok) {
        Alert.alert("✨ Sucesso", "Aproveite seus 7 dias Premium!");
      } else {
        Alert.alert("Aviso", res.data?.message || "Não foi possível ativar o teste.");
      }
    } catch (e) {
      Alert.alert("Erro", "Falha de conexão.");
    } finally {
      setLoadingAction(null);
    }
  };

  if (loadingDados) return <View style={styles.center}><ActivityIndicator color={GOLD} size="large" /></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* HEADER UNIFICADO NO TOPO DO SCROLL */}
        <View style={styles.headerUnificado}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevron-left" size={32} color={GOLD} />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <GradientText style={styles.headerTitle}>EXCELLENCE</GradientText>
            <GradientText style={styles.headerSubtitle}>Escolha seu nível de exclusividade</GradientText>
          </View>
        </View>

        {/* TRIAL CARD (ZONA DE CONVERSÃO) */}
        {!assinaturaAtiva && (
          <TouchableOpacity onPress={handleTrialPress} activeOpacity={0.8} style={styles.trialWrapper}>
            <LinearGradient colors={GOLD_GRADIENT} start={{x:0, y:0}} end={{x:1, y:0}} style={styles.trialCard}>
              <View style={styles.trialTextCol}>
                <Text style={styles.trialTitle}>7 DIAS GRÁTIS</Text>
                <Text style={styles.trialSub}>Experimente o poder do Premium agora</Text>
              </View>
              <View style={styles.trialIconCol}>
                {loadingAction === 'trial' ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Icon name={trialUsado ? "lock-outline" : "crown"} size={38} color="#000" />
                )}
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* LISTAGEM DE TODOS OS PLANOS */}
        <View style={styles.listContainer}>
          {PLANOS.map((plano) => {
            const isAtivo = plano.id === planoAtualId && assinaturaAtiva;
            return (
              <LinearGradient 
                key={plano.id} 
                colors={DARK_GRADIENT} // Fundo escuro premium
                style={[styles.planCard, plano.popular && styles.popularCard]}
              >
                {/* RECOMENDADO BADGE */}
                {plano.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>RECOMENDADO</Text>
                  </View>
                )}
                
                <Text style={[styles.planName, {color: plano.cor}]}>{plano.nome}</Text>
                
                <View style={styles.priceRow}>
                  <Text style={styles.currency}>R$</Text>
                  <Text style={styles.priceVal}>{plano.preco.split(',')[0]}</Text>
                  <Text style={styles.priceCents}>,{plano.preco.split(',')[1]}</Text>
                  <Text style={styles.pricePeriod}>/mês</Text>
                </View>

                <View style={styles.featureList}>
                  {plano.features.map((f, i) => (
                    <View key={i} style={styles.featureItem}>
                      <Icon name="check-decagram" size={20} color={plano.cor} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>

                {/* BOTÃO ASSINAR */}
                <TouchableOpacity 
                  disabled={isAtivo}
                  onPress={() => navigation.navigate('CheckoutPagamentoScreen', { planoId: plano.id, preco: plano.preco })}
                >
                  <LinearGradient colors={isAtivo ? ['#333', '#222'] : GOLD_GRADIENT} style={styles.mainBtn}>
                    <Text style={styles.mainBtnText}>
                      {isAtivo ? 'SEU PLANO ATUAL' : `ASSINAR ${plano.nome}`}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
            );
          })}
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
  headerTitle: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  headerSubtitle: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  backBtn: { alignSelf: 'flex-start', marginLeft: -5 },

  // Trial Card Reformado (ZONA DE CONVERSÃO)
  trialWrapper: { marginHorizontal: 20, marginBottom: 30 },
  trialCard: { 
    padding: 22, 
    borderRadius: 20, 
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
  trialTitle: { color: '#000', fontWeight: '900', fontSize: 22 },
  trialSub: { color: 'rgba(0,0,0,0.7)', fontSize: 13, fontWeight: '700', marginTop: 2 },

  // Listagem de Planos
  listContainer: { paddingHorizontal: 20 },
  planCard: { 
    padding: 25, 
    paddingTop: 30,
    borderRadius: 25, 
    marginBottom: 25, 
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

  planName: { fontSize: 14, fontWeight: '900', letterSpacing: 2, marginBottom: 15 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  currency: { color: '#FFF', fontSize: 18, marginTop: 12, marginRight: 5 },
  priceVal: { color: '#FFF', fontSize: 55, fontWeight: 'bold' },
  priceCents: { color: '#FFF', fontSize: 24, marginTop: 15 },
  pricePeriod: { color: '#888', fontSize: 12, marginTop: 26, marginLeft: 3 },

  featureList: { marginBottom: 35 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  featureText: { color: '#EEE', marginLeft: 15, fontSize: 15, fontWeight: '500' },

  mainBtn: { height: 58, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  mainBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 }
});