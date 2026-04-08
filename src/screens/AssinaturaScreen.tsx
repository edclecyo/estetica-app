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
      });

    return () => unsub();
  }, []);

  const isExpirado = useMemo(() => {
    if (planoAtualId === 'trial') return (diasRestantes || 0) <= 0;
    if (planoAtualId && planoAtualId !== 'free' && !assinaturaAtiva) return true;
    return false;
  }, [planoAtualId, diasRestantes, assinaturaAtiva]);

  const handleTrial = async () => {
    if (
      trialUsado ||
      planoAtualId === 'trial' ||
      assinaturaAtiva ||
      loading === 'trial'
    ) return;

    if (!estId) {
      Alert.alert("Crie um estabelecimento primeiro");
      return;
    }

    setLoading('trial');

    try {
      const result = await functions(undefined, 'southamerica-east1')
        .httpsCallable('iniciarTrial')({ estabelecimentoId: estId });

      if (result.data?.ok) {
        Alert.alert("🎉 Sucesso", "Seu teste foi ativado!");
      } else {
        throw new Error(result.data?.message);
      }

    } catch (e: any) {
      Alert.alert("Erro", e.message || "Erro ao ativar trial");
    } finally {
      setLoading(null);
    }
  };

  const handleAssinar = (plano: any) => {
    if (plano.id === planoAtualId && assinaturaAtiva) {
      Alert.alert("Plano Ativo");
      return;
    }

    navigation.navigate('CheckoutPagamentoScreen', { 
      planoId: plano.id, 
      preco: plano.preco 
    });
  };

  if (loadingDados) {
    return <View style={styles.center}><ActivityIndicator color={GOLD} /></View>;
  }

  const podeAtivarTrial =
    !trialUsado &&
    (!planoAtualId || planoAtualId === 'free') &&
    !assinaturaAtiva;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={28} color={GOLD} />
          </TouchableOpacity>

          <Text style={styles.titulo}>Planos</Text>
        </View>

        {/* TRIAL */}
        <View style={styles.trialCard}>
          <Text style={styles.trialTitle}>
            {planoAtualId === 'trial'
              ? `Trial ativo (${diasRestantes} dias)`
              : trialUsado
              ? "Trial já usado"
              : "Teste grátis disponível"}
          </Text>

          {podeAtivarTrial && (
            <TouchableOpacity onPress={handleTrial} style={styles.trialBtn}>
              {loading === 'trial'
                ? <ActivityIndicator color="#000" />
                : <Text>ATIVAR TRIAL</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* PLANOS */}
        {PLANOS.map(plano => {
          const ativo = plano.id === planoAtualId && assinaturaAtiva;

          return (
            <View key={plano.id} style={styles.planCard}>
              <Text style={styles.planName}>{plano.nome}</Text>
              <Text>R$ {plano.preco}</Text>

              <TouchableOpacity
                disabled={ativo}
                onPress={() => handleAssinar(plano)}
                style={styles.btn}
              >
                <Text>
                  {ativo ? 'ATIVO' : 'ASSINAR'}
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
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { padding: 20 },
  titulo: { color: '#FFF', fontSize: 22 },

  trialCard: { padding: 20 },
  trialTitle: { color: '#FFF' },
  trialBtn: { backgroundColor: GOLD, padding: 10, marginTop: 10 },

  planCard: { padding: 20 },
  planName: { color: '#FFF' },
  btn: { backgroundColor: GOLD, padding: 10, marginTop: 10 }
});