import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  ActivityIndicator, Alert, StatusBar, Dimensions 
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import firestore from '@react-native-firebase/firestore';
import {functions,httpsCallable } from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const GOLD_GRADIENT = ['#D4AF37', '#F9E29B', '#B8860B'];
const GOLD = '#D4AF37';

const PLANOS = [
  { 
    id: 'essencial', 
    nome: 'ESSENCIAL', 
    preco: '29,90', 
    cor: '#C9A96E', 
    gradient: ['#1A1A1A', '#0A0A0A'],
    features: ['Até 2 profissionais', 'Gestão de Agendas', 'Relatórios Mensais']
  },
  { 
    id: 'pro', 
    nome: 'PROFESSIONAL', 
    preco: '49,90', 
    cor: GOLD, 
    popular: true,
    gradient: ['#222', '#000'],
    features: ['Profissionais Ilimitados', 'Gestão de Comissões', 'Estatísticas VIP', 'Suporte Prioritário']
  },
  { 
    id: 'elite', 
    nome: 'ELITE VIP', 
    preco: '89,99', 
    cor: '#FFD700', 
    gradient: ['#1A1A1A', '#000'],
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
          
          const expira = data.expiraEm?.toDate();
		  const ativo = expira ? expira > new Date() : false;
setAssinaturaAtiva(!!data.assinaturaAtiva && ativo);
        }
        setLoadingDados(false);
      }, () => setLoadingDados(false));

    return () => unsub();
  }, []);

  const handleTrialPress = () => {
    // AVISO CASO NÃO TENHA ESTABELECIMENTO
    if (!estId) {
      Alert.alert(
        "💎 Quase lá!",
        "Para ativar seus 7 dias de teste gratuito, você precisa primeiro criar um estabelecimento no seu perfil.",
        [{ text: "Entendido", style: "cancel" }]
      );
      return;
    }

    if (trialUsado) {
      Alert.alert("Aviso", "O período de teste já foi utilizado neste estabelecimento.");
      return;
    }

    Alert.alert(
      "Ativar Teste",
      "Deseja iniciar seus 7 dias de acesso Premium agora?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Ativar", onPress: callsIniciarTrial }
      ]
    );
  };

  const callsIniciarTrial = async () => {
  if (!estId) {
    Alert.alert("Erro", "ID não carregado.");
    return;
  }

  setLoadingAction('trial');

  try {
    const iniciarTrial = httpsCallable(functions(), 'iniciarTrial');

    const res = await iniciarTrial({
      estabelecimentoId: estId
    });

    console.log("Resposta:", res.data);

   if (res?.data?.ok === true) {
      Alert.alert("Sucesso", "7 dias de Premium liberados!");
    } else {
      Alert.alert("Erro", res.data?.message || "Erro desconhecido");
    }

  } catch (e) {
    console.log("ERRO:", e);
    Alert.alert("Erro", e.message || "Erro desconhecido");
  } finally {
    setLoadingAction(null);
  }
};

  if (loadingDados) return <View style={styles.center}><ActivityIndicator color={GOLD} size="large" /></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        
        <LinearGradient colors={['#1A1A1A', '#000']} style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevron-left" size={30} color={GOLD} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>EXCELLENCE</Text>
          <Text style={styles.headerSubtitle}>Escolha seu nível de exclusividade</Text>
        </LinearGradient>

        {/* TRIAL SEMPRE VISÍVEL */}
        {!assinaturaAtiva && (
          <TouchableOpacity onPress={handleTrialPress} activeOpacity={0.8} style={styles.trialWrapper}>
            <LinearGradient colors={GOLD_GRADIENT} start={{x:0, y:0}} end={{x:1, y:0}} style={styles.trialCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.trialTitle}>7 DIAS GRÁTIS</Text>
                <Text style={styles.trialSub}>Experimente o poder do Premium agora</Text>
              </View>
              {loadingAction === 'trial' ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Icon name={trialUsado ? "lock-outline" : "crown"} size={35} color="#000" />
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* LISTAGEM DE TODOS OS PLANOS */}
        <View style={styles.listContainer}>
          {PLANOS.map((plano) => {
            const isAtivo = plano.id === planoAtualId && assinaturaAtiva;
            return (
              <LinearGradient key={plano.id} colors={plano.gradient} style={[styles.planCard, plano.popular && styles.popularBorder]}>
                {plano.popular && (
                  <View style={styles.popularBadge}><Text style={styles.popularBadgeText}>RECOMENDADO</Text></View>
                )}
                
                <Text style={[styles.planName, {color: plano.cor}]}>{plano.nome}</Text>
                
                <View style={styles.priceRow}>
                  <Text style={styles.currency}>R$</Text>
                  <Text style={styles.priceVal}>{plano.preco.split(',')[0]}</Text>
                  <Text style={styles.priceCents}>,{plano.preco.split(',')[1]}</Text>
                </View>

                <View style={styles.featureList}>
                  {plano.features.map((f, i) => (
                    <View key={i} style={styles.featureItem}>
                      <Icon name="check-decagram" size={18} color={plano.cor} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity 
                  disabled={isAtivo}
                  onPress={() => navigation.navigate('CheckoutPagamentoScreen', { planoId: plano.id })}
                >
                  <LinearGradient colors={isAtivo ? ['#333', '#222'] : GOLD_GRADIENT} style={styles.mainBtn}>
                    <Text style={styles.mainBtnText}>{isAtivo ? 'SEU PLANO ATUAL' : 'ASSINAR AGORA'}</Text>
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
  header: { padding: 25, paddingTop: 50, paddingBottom: 40, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTitle: { color: '#FFF', fontSize: 30, fontWeight: '900', letterSpacing: 2 },
  headerSubtitle: { color: '#888', fontSize: 13, marginTop: 5 },
  backBtn: { marginBottom: 15 },

  trialWrapper: { marginHorizontal: 20, marginTop: -25, marginBottom: 20 },
  trialCard: { padding: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', elevation: 8 },
  trialTitle: { color: '#000', fontWeight: '900', fontSize: 20 },
  trialSub: { color: 'rgba(0,0,0,0.6)', fontSize: 12, fontWeight: '700' },

  listContainer: { paddingHorizontal: 20, paddingBottom: 40 },
  planCard: { padding: 25, borderRadius: 25, marginBottom: 25, borderWidth: 1, borderColor: '#222' },
  popularBorder: { borderColor: GOLD, borderWidth: 1.5 },
  popularBadge: { position: 'absolute', top: -12, alignSelf: 'center', backgroundColor: GOLD, paddingHorizontal: 15, paddingVertical: 4, borderRadius: 12 },
  popularBadgeText: { color: '#000', fontSize: 10, fontWeight: '900' },

  planName: { fontSize: 14, fontWeight: 'bold', letterSpacing: 2, marginBottom: 15 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  currency: { color: '#FFF', fontSize: 18, marginTop: 10, marginRight: 5 },
  priceVal: { color: '#FFF', fontSize: 50, fontWeight: 'bold' },
  priceCents: { color: '#FFF', fontSize: 22, marginTop: 12 },

  featureList: { marginBottom: 30 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  featureText: { color: '#DDD', marginLeft: 12, fontSize: 14 },

  mainBtn: { height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  mainBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 }
});