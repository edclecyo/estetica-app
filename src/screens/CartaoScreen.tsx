import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';

import { WebView } from 'react-native-webview';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';

export default function CartaoScreen({ route, navigation }: any) {
  const { estabelecimentoId, planoId, valor } = route.params;

  const webRef = useRef<WebView>(null);
  const unsubscribeRef = useRef<any>(null);

  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const monitorarPagamento = () => {
    unsubscribeRef.current?.();

    unsubscribeRef.current = firestore()
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .onSnapshot((doc) => {
        const data = doc.data();
        if (!data) return;

        if (data.paymentType !== 'credit_card') return;

        if (data.statusPagamento === 'approved') {
          if (isProcessing) return;

          setIsProcessing(true);
          unsubscribeRef.current?.();

          Alert.alert('Sucesso', 'Assinatura ativada!');

          navigation.reset({
            index: 0,
            routes: [{ name: 'AdminDash', params: { estabelecimentoId } }]
          });
        }

        if (data.statusPagamento === 'rejected') {
          unsubscribeRef.current?.();
          setLoading(false);
          Alert.alert('Pagamento recusado');
        }
      });
  };

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  const onMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'READY') {
        setReady(true);
      }

      if (data.type === 'TOKEN') {
        setLoading(true);

        const user = auth().currentUser;
        if (!user?.email) throw new Error('Sessão expirada');

        const fn = functions()
          .httpsCallable('criarAssinaturaCartao');

        await fn({
          estabelecimentoId,
          plano: planoId,
          email: user.email,
          token: data.token
        });

        monitorarPagamento();
      }

      if (data.type === 'ERROR') {
        throw new Error(data.message);
      }

    } catch (e: any) {
      setLoading(false);
      Alert.alert('Erro', e.message);
    }
  };

  const html = gerarHTML(valor);

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={32} color="#C9A96E" />
        </TouchableOpacity>

        <Text style={styles.title}>Cartão</Text>
      </View>

      {/* RESUMO */}
      <LinearGradient colors={['#1A1A1A', '#0D0D0D']} style={styles.summaryCard}>
        <Text style={styles.planoNome}>{planoId?.toUpperCase()}</Text>
        <Text style={styles.valorTxt}>R$ {Number(valor).toFixed(2)}</Text>
      </LinearGradient>

      {/* WEBVIEW - SEM SCROLLVIEW (IMPORTANTE) */}
      <View style={styles.webWrapper}>

        {!ready && (
          <View style={styles.loaderWeb}>
            <ActivityIndicator size="large" color="#C9A96E" />
            <Text style={{ color: '#888', marginTop: 10 }}>
              Carregando checkout...
            </Text>
          </View>
        )}

        <WebView
          ref={webRef}
          source={{ html }}

          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState

          mixedContentMode="always"
          allowsInlineMediaPlayback

          onMessage={onMessage}

          onLoadEnd={() => setReady(true)}
          onError={() => {
            Alert.alert('Erro', 'Falha ao carregar checkout');
          }}

          style={{ flex: 1 }}
        />
      </View>

      {/* LOADING PROCESSAMENTO */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#C9A96E" />
          <Text style={styles.loadingText}>Processando pagamento...</Text>
        </View>
      )}

    </View>
  );
}

const gerarHTML = (valor: number) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<script src="https://sdk.mercadopago.com/js/v2"></script>
<style>
  body { margin:0; background:#0D0D0D; font-family:sans-serif; }
  #cardPaymentBrick_container { padding: 10px; }
</style>
</head>
<body>

<div id="cardPaymentBrick_container"></div>

<script>
  const mp = new MercadoPago('SUA_PUBLIC_KEY', { locale: 'pt-BR' });
  const bricksBuilder = mp.bricks();

  const render = async () => {
    await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', {
      initialization: { amount: ${valor} },
      callbacks: {
        onReady: () => {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "READY" }));
        },
        onSubmit: (data) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "TOKEN",
            token: data.token
          }));
        },
        onError: () => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "ERROR",
            message: "Erro no cartão"
          }));
        }
      }
    });
  };

  render();
</script>

</body>
</html>
`;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 50,
    paddingHorizontal: 20
  },

  title: {
    color: '#fff',
    fontSize: 20,
    marginLeft: 10,
    fontWeight: 'bold'
  },

  summaryCard: {
    margin: 20,
    padding: 20,
    borderRadius: 15
  },

  planoNome: {
    color: '#C9A96E',
    fontSize: 18,
    fontWeight: 'bold'
  },

  valorTxt: {
    color: '#fff',
    fontSize: 22,
    marginTop: 5
  },

  webWrapper: {
    flex: 1,
    marginHorizontal: 10,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#0D0D0D'
  },

  loaderWeb: {
    position: 'absolute',
    top: 120,
    width: '100%',
    alignItems: 'center',
    zIndex: 10
  },

  loadingOverlay: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    alignItems: 'center'
  },

  loadingText: {
    color: '#C9A96E',
    marginTop: 10
  }
});