import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import { WebView } from 'react-native-webview';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

cconst PLANOS = [
  { id: 'essencial', nome: 'Essencial', preco: '29,90', cor: '#4CAF50', desc: 'Até 2 profissionais' },
  { id: 'pro', nome: 'Pro', preco: '49,90', cor: '#2196F3', desc: 'Profissionais ilimitados' },
  { id: 'elite', nome: 'Elite', preco: '89,99', cor: '#9C27B0', desc: 'Destaque no ranking + Pro' },
];

export default function AssinaturaScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [planoAtual, setPlanoAtual] = useState<string | null>(null);

  // Monitora o Firestore para saber quando o pagamento for aprovado
  useEffect(() => {
    const user = auth().currentUser;
    if (!user) return;

    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', user.uid)
      .onSnapshot(snapshot => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          if (data.assinaturaAtiva) {
            setCheckoutUrl(null); // Fecha o WebView
            Alert.alert("Sucesso!", "Seu plano foi ativado com sucesso!");
            navigation.navigate('Home');
          }
        }
      });

    return () => unsub();
  }, []);

  const handleAssinar = async (planoId: string) => {
    setLoading(true);
    const user = auth().currentUser;

    try {
      // 1. Pegar o ID do estabelecimento vinculado ao admin
      const estSnap = await firestore()
        .collection('estabelecimentos')
        .where('adminId', '==', user?.uid)
        .get();

      if (estSnap.empty) throw new Error("Estabelecimento não encontrado");
      
      const estId = estSnap.docs[0].id;

      // 2. Chamar a Cloud Function que você criou
      const { data } = await functions().httpsCallable('criarAssinatura')({
        estabelecimentoId: estId,
        email: user?.email,
        plano: planoId
      });

      if (data?.url) {
        setCheckoutUrl(data.url);
      }
    } catch (e: any) {
      Alert.alert("Erro", "Não foi possível gerar o pagamento.");
    } finally {
      setLoading(false);
    }
  };

  if (checkoutUrl) {
    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={styles.btnFechar} onPress={() => setCheckoutUrl(null)}>
          <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Fechar Pagamento</Text>
        </TouchableOpacity>
        <WebView 
          source={{ uri: checkoutUrl }} 
          style={{ flex: 1 }}
          startInLoadingState={true}
          renderLoading={() => <ActivityIndicator style={styles.loadingFull} size="large" />}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.titulo}>Escolha seu Plano</Text>
      <Text style={styles.subtitulo}>Impulsione seu negócio hoje mesmo</Text>

      {PLANOS.map((plano) => (
        <View key={plano.id} style={[styles.card, { borderLeftColor: plano.cor }]}>
          <View>
            <Text style={styles.planoNome}>{plano.nome}</Text>
            <Text style={styles.planoDesc}>{plano.desc}</Text>
          </View>
          <View style={styles.areaPreco}>
            <Text style={styles.preco}>R$ {plano.preco}</Text>
            <TouchableOpacity 
              style={[styles.btnAssinar, { backgroundColor: plano.cor }]}
              onPress={() => handleAssinar(plano.id)}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Assinar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={styles.infoSeguranca}>
        <Icon name="shield-check" size={20} color="#666" />
        <Text style={styles.infoTexto}>Pagamento processado com segurança pelo Mercado Pago</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 20 },
  titulo: { fontSize: 26, fontWeight: 'bold', color: '#333', marginTop: 20 },
  subtitulo: { fontSize: 16, color: '#666', marginBottom: 30 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 6,
    elevation: 3,
  },
  planoNome: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  planoDesc: { fontSize: 14, color: '#888', marginTop: 5 },
  areaPreco: { alignItems: 'center' },
  preco: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  btnAssinar: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  btnFechar: { backgroundColor: '#FF5252', padding: 15, alignItems: 'center' },
  loadingFull: { position: 'absolute', top: '50%', left: '50%', marginLeft: -20 },
  infoSeguranca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, opacity: 0.7 },
  infoTexto: { fontSize: 12, color: '#666', marginLeft: 5 }
});