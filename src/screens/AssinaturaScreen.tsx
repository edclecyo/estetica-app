import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  ActivityIndicator, Alert, StatusBar, Dimensions 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const { width } = Dimensions.get('window');
const GOLD = '#D4AF37';

const PLANOS = [
  { 
    id: 'essencial', 
    nome: 'Essencial', 
    preco: '29,90', 
    cor: '#C9A96E', 
    desc: 'Para quem está começando',
    features: ['Até 2 profissionais', 'Gestão de Agendas', 'Relatórios Financeiros', 'Suporte via Chat']
  },
  { 
    id: 'pro', 
    nome: 'Professional', 
    preco: '49,90', 
    cor: GOLD, 
    desc: 'O padrão ouro de gestão',
    popular: true,
    features: ['Profissionais Ilimitados', 'Gestão de Comissões', 'Histórico de Clientes', 'Suporte Prioritário', 'Estatísticas Avançadas']
  },
  { 
    id: 'elite', 
    nome: 'Elite VIP', 
    preco: '89,99', 
    cor: '#FFD700', 
    desc: 'Domine o mercado local',
    features: ['Destaque no Ranking', 'Selo de Verificado', 'Marketing Integrado', 'Gerente de Conta', 'API de Integração']
  },
];

export default function AssinaturaScreen({ navigation }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [loadingDados, setLoadingDados] = useState(true);
  const [estId, setEstId] = useState<string | null>(null);
  
  const [planoAtualId, setPlanoAtualId] = useState<string | null>(null);
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
  const [trialUsado, setTrialUsado] = useState(false);
  const [diasRestantes, setDiasRestantes] = useState<number | null>(null);

  useEffect(() => {
    const user = auth().currentUser;
    if (!user) {
      setLoadingDados(false);
      return;
    }

    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', user.uid)
      .limit(1)
      .onSnapshot(snapshot => {
        if (snapshot.empty) {
          setLoadingDados(false);
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
		
		setEstId(doc.id);
		setPlanoAtualId(data.plano || null);
		
        const expirado = data.expiraEm ? data.expiraEm.toDate() < new Date() : false;
        setAssinaturaAtiva(!!data.assinaturaAtiva && !expirado);
		
        setTrialUsado(!!data.trialUsado);

        if (data.plano === 'trial' && data.trialDataInicio) {
          const agora = new Date();
          const inicio = data.trialDataInicio.toDate();
          const fim = new Date(inicio);
          fim.setDate(inicio.getDate() + 14); 

          const diff = fim.getTime() - agora.getTime();
          const dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
          setDiasRestantes(dias > 0 ? dias : 0);
        } else {
          setDiasRestantes(null);
        }
        
        setLoadingDados(false);
      }, err => {
        console.error(err);
        setLoadingDados(false);
      });

    return () => unsub();
  }, []);

  const isExpirado = useMemo(() => {
    if (planoAtualId === 'trial') return (diasRestantes || 0) <= 0;
    if (planoAtualId && planoAtualId !== 'free' && !assinaturaAtiva) return true;
    return false;
  }, [planoAtualId, diasRestantes, assinaturaAtiva]);

  const handleTrial = async () => {
    if (trialUsado || planoAtualId || loading === 'trial') return;
    
    setLoading('trial');
    try {
      // ✅ CORRIGIDO: forma correta de passar região no React Native Firebase
      const result = await functions(undefined, 'southamerica-east1')
        .httpsCallable('iniciarTrial')({ estabelecimentoId: estId });
      
      if (result.data?.ok) {
        Alert.alert("🎉 Sucesso", "Seus 14 dias de teste começaram!");
      } else {
        throw new Error(result.data?.message || "Erro desconhecido");
      }
    } catch (e: any) {
      console.error("Erro ao ativar trial:", e);
      
      let msgErro = "Não foi possível ativar o teste. Tente novamente.";
      
      if (e.message?.includes('not-found')) {
        msgErro = "Estabelecimento não encontrado.";
      } else if (e.message?.includes('already-exists')) {
        msgErro = "Você já utilizou o período de teste neste estabelecimento.";
      } else if (e.message?.includes('permission-denied')) {
        msgErro = "Você não tem permissão para ativar este trial.";
      }

      Alert.alert("Ops!", msgErro);
    } finally {
      setLoading(null);
    }
  };

  const handleAssinar = (plano: any) => {
    if (plano.id === planoAtualId && assinaturaAtiva) {
      Alert.alert("Plano Ativo", "Você já possui este plano ativo.");
      return;
    }
    
    navigation.navigate('CheckoutPagamentoScreen', { 
      planoId: plano.id, 
      preco: plano.preco 
    });
  };

  if (loadingDados) return <View style={styles.center}><ActivityIndicator color={GOLD} size="large" /></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Icon name="close" size={28} color={GOLD} />
          </TouchableOpacity>
          <Text style={styles.supraTitulo}>ESTÉTICAHUB PREMIUM</Text>
          <Text style={styles.titulo}>Transforme sua gestão em ouro</Text>
        </View>

        {/* CARD DE TRIAL DINÂMICO */}
        <View style={[
            styles.trialCard, 
            (trialUsado && planoAtualId !== 'trial') && styles.trialCardDisabled,
            (isExpirado && planoAtualId === 'trial') && { borderColor: '#FF3B30', backgroundColor: '#1A0505' }
        ]}>
          <View style={styles.trialContent}>
            <Icon 
              name={isExpirado && planoAtualId === 'trial' ? "alert-circle-outline" : "gift-outline"} 
              size={32} 
              color={isExpirado && planoAtualId === 'trial' ? "#FF3B30" : GOLD} 
            />
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={[styles.trialTitle, isExpirado && planoAtualId === 'trial' && { color: '#FF3B30' }]}>
                {planoAtualId === 'trial' 
                  ? (isExpirado ? "Teste Expirado" : `Teste Ativo: ${diasRestantes} dias`)
                  : (trialUsado ? "Teste já utilizado" : "14 Dias Grátis")}
              </Text>
              <Text style={styles.trialText}>
                {planoAtualId === 'trial' 
                  ? (isExpirado ? "Assine um plano para continuar." : "Aproveite todos os recursos VIP.")
                  : "Experimente o plano Professional sem custo."}
              </Text>
            </View>
            
            {!trialUsado && !planoAtualId && (
              <TouchableOpacity 
                onPress={handleTrial} 
                disabled={!!loading}
                style={styles.trialActionBtn}
              >
                {loading === 'trial' 
                  ? <ActivityIndicator size="small" color="#000" /> 
                  : <Text style={styles.trialActionText}>ATIVAR</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {PLANOS.map((plano) => {
          const isEstePlano = plano.id === planoAtualId;
          const mostrarComoAtivo = isEstePlano && assinaturaAtiva;
          const mostrarComoExpirado = isEstePlano && isExpirado;

          return (
            <View key={plano.id} style={[
              styles.planCard, 
              plano.popular && styles.planCardPopular,
              mostrarComoAtivo && styles.planCardAtual,
              mostrarComoExpirado && styles.planCardExpirado
            ]}>
              
              {mostrarComoAtivo && (
                <View style={styles.atualBadge}>
                  <Text style={styles.atualText}>PLANO ATIVO</Text>
                </View>
              )}

              {mostrarComoExpirado && (
                <View style={[styles.atualBadge, { backgroundColor: '#FF3B30' }]}>
                  <Text style={styles.atualText}>PAGAMENTO PENDENTE</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planName}>{plano.nome}</Text>
                  <Text style={styles.planDesc}>{plano.desc}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.planPrice}>R$ {plano.preco}</Text>
                  <Text style={styles.planMes}>/mês</Text>
                </View>
              </View>

              <View style={styles.featureList}>
                {plano.features.map((item, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Icon name="check-circle" size={18} color={mostrarComoAtivo ? "#4CAF50" : plano.cor} />
                    <Text style={styles.featureText}>{item}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity 
                style={[
                  styles.subscribeBtn, 
                  { backgroundColor: mostrarComoAtivo ? '#1A1A1A' : (mostrarComoExpirado ? '#FF3B30' : plano.cor) }
                ]}
                onPress={() => handleAssinar(plano)}
                disabled={mostrarComoAtivo}
              >
                <Text style={[styles.subscribeBtnText, mostrarComoAtivo && { color: '#444' }]}>
                  {mostrarComoAtivo ? 'PLANO ATUAL' : mostrarComoExpirado ? 'REATIVAR AGORA' : 'ASSINAR AGORA'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  center: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  header: { padding: 30, paddingTop: 60 },
  closeBtn: { alignSelf: 'flex-start', marginBottom: 20 },
  supraTitulo: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 5 },
  titulo: { color: '#FFF', fontSize: 32, fontWeight: '900', lineHeight: 38 },
  trialCard: { backgroundColor: '#111', marginHorizontal: 20, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#222', marginBottom: 25 },
  trialCardDisabled: { opacity: 0.5 },
  trialContent: { flexDirection: 'row', alignItems: 'center' },
  trialTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  trialText: { color: '#777', fontSize: 12, marginTop: 2 },
  trialActionBtn: { backgroundColor: GOLD, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
  trialActionText: { color: '#000', fontSize: 11, fontWeight: '900' },
  planCard: { backgroundColor: '#111', marginHorizontal: 20, marginBottom: 20, borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#1a1a1a' },
  planCardPopular: { borderColor: GOLD, backgroundColor: '#0F0F0F' },
  planCardAtual: { borderColor: '#4CAF50' },
  planCardExpirado: { borderColor: '#FF3B30' },
  atualBadge: { position: 'absolute', top: -12, right: 25, backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  atualText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  planName: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  planDesc: { color: '#666', fontSize: 12 },
  planPrice: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  planMes: { color: '#444', fontSize: 10 },
  featureList: { marginBottom: 25 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  featureText: { color: '#BBB', fontSize: 13, marginLeft: 10 },
  subscribeBtn: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  subscribeBtnText: { color: '#000', fontSize: 15, fontWeight: '900' }
});