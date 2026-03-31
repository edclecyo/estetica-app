import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  ActivityIndicator, Alert, StatusBar, Dimensions 
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const { width } = Dimensions.get('window');

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
    cor: '#D4AF37', 
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
  const [statusTrial, setStatusTrial] = useState<'disponivel' | 'bloqueado'>('disponivel');
  const [loadingDados, setLoadingDados] = useState(true);

  useEffect(() => {
    const user = auth().currentUser;
    if (!user) return;

    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', user.uid)
      .onSnapshot(snapshot => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          const isBloqueado = data.plano === 'trial' || data.assinaturaAtiva === true || data.trialUsado === true;
          setStatusTrial(isBloqueado ? 'bloqueado' : 'disponivel');
          setLoadingDados(false);
        }
      });
    return () => unsub();
  }, []);

  const handleTrial = async () => {
    if (statusTrial === 'bloqueado') return;
    setLoading('trial');
    try {
      const user = auth().currentUser;
      const estSnap = await firestore().collection('estabelecimentos').where('adminId', '==', user?.uid).get();
      await functions().httpsCallable('iniciarTrial')({ estabelecimentoId: estSnap.docs[0].id });
      Alert.alert("🎉 Sucesso", "Seus 14 dias de teste começaram!");
    } catch (e) {
      Alert.alert("Erro", "Não foi possível ativar o teste.");
    } finally { setLoading(null); }
  };

  // APENAS NAVEGA PARA A TELA DE PAGAMENTO
  const handleAssinar = (plano: any) => {
    navigation.navigate('CheckoutPagamentoScreen', { 
      planoId: plano.id, 
      preco: plano.preco 
    });
  };

  if (loadingDados) return <View style={styles.center}><ActivityIndicator color="#D4AF37" size="large" /></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Icon name="close" size={28} color="#D4AF37" />
          </TouchableOpacity>
          <Text style={styles.supraTitulo}>BEAUTYHUB PREMIUM</Text>
          <Text style={styles.titulo}>Eleve o nível do seu negócio</Text>
        </View>

        <View style={[styles.trialCard, statusTrial === 'bloqueado' && styles.trialCardDisabled]}>
          <View style={styles.trialContent}>
            <Icon name="gift-outline" size={30} color={statusTrial === 'bloqueado' ? "#444" : "#D4AF37"} />
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={[styles.trialTitle, statusTrial === 'bloqueado' && { color: '#666' }]}>
                {statusTrial === 'bloqueado' ? "Teste já utilizado" : "Degustação Grátis"}
              </Text>
              <Text style={styles.trialText}>Acesso total por 14 dias sem compromisso.</Text>
            </View>
            <TouchableOpacity 
              onPress={handleTrial} 
              disabled={statusTrial === 'bloqueado' || !!loading}
              style={[styles.trialActionBtn, statusTrial === 'bloqueado' && styles.trialActionBtnDisabled]}
            >
              {loading === 'trial' ? <ActivityIndicator size="small" color="#000" /> : 
              <Text style={styles.trialActionText}>{statusTrial === 'bloqueado' ? "INDISPONÍVEL" : "ATIVAR"}</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {PLANOS.map((plano) => (
          <View key={plano.id} style={[styles.planCard, plano.popular && styles.planCardPopular]}>
            {plano.popular && (
              <View style={styles.popularBadge}><Text style={styles.popularText}>MAIS ESCOLHIDO</Text></View>
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
                  <Icon name="check-circle" size={18} color={plano.cor} />
                  <Text style={styles.featureText}>{item}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity 
              style={[styles.subscribeBtn, { backgroundColor: plano.cor }]}
              onPress={() => handleAssinar(plano)}
            >
              <Text style={styles.subscribeBtnText}>ASSINAR AGORA</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  center: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  header: { padding: 30, paddingTop: 60 },
  closeBtn: { alignSelf: 'flex-start', marginBottom: 20 },
  supraTitulo: { color: '#D4AF37', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 5 },
  titulo: { color: '#FFF', fontSize: 32, fontWeight: '900', lineHeight: 38 },
  trialCard: { backgroundColor: '#111', marginHorizontal: 20, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#222', marginBottom: 25 },
  trialCardDisabled: { borderColor: '#111', opacity: 0.8 },
  trialContent: { flexDirection: 'row', alignItems: 'center' },
  trialTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  trialText: { color: '#777', fontSize: 12, marginTop: 2 },
  trialActionBtn: { backgroundColor: '#D4AF37', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12 },
  trialActionBtnDisabled: { backgroundColor: '#222' },
  trialActionText: { color: '#000', fontSize: 11, fontWeight: '900' },
  planCard: { backgroundColor: '#111', marginHorizontal: 20, marginBottom: 20, borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#1a1a1a' },
  planCardPopular: { borderColor: '#D4AF37', backgroundColor: '#151515', elevation: 15, shadowColor: '#D4AF37', shadowOpacity: 0.1, shadowRadius: 20 },
  popularBadge: { position: 'absolute', top: -12, right: 25, backgroundColor: '#D4AF37', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  popularText: { color: '#000', fontSize: 10, fontWeight: '900' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25 },
  planName: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  planDesc: { color: '#666', fontSize: 13, marginTop: 4 },
  planPrice: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  planMes: { color: '#444', fontSize: 11, fontWeight: '700' },
  featureList: { marginBottom: 30 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  featureText: { color: '#BBB', fontSize: 14, marginLeft: 12, fontWeight: '500' },
  subscribeBtn: { height: 55, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  subscribeBtnText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 }
});