import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';

import { WebView } from 'react-native-webview';
import firestore from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';

export default function CartaoScreen({ route, navigation }: any) {
  const { estabelecimentoId, planoId, valor, addIA } = route.params;

  const webRef = useRef<WebView>(null);
  const unsubscribeRef = useRef<any>(null);

const processedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Monitora o Firestore para confirmação do pagamento via Webhook
  const monitorarPagamento = () => {

  unsubscribeRef.current?.();

  unsubscribeRef.current = firestore()
    .collection('estabelecimentos')
    .doc(estabelecimentoId)
    .onSnapshot((doc) => {

      const data = doc.data();

      if (!data) return;

      const status = data.paymentStatus;

const planoOk =
  data.plano === planoId ||
  data.planoPendente === planoId;

if (
  status === 'approved' &&
  planoOk
) {

  if (processedRef.current) return;

  processedRef.current = true;

  setIsProcessing(true);

  unsubscribeRef.current?.();

  setLoading(false);

  Alert.alert(
    'Sucesso',
    'Assinatura ativada com sucesso!',
    [
      {
        text: 'Continuar',
        onPress: () => {
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'AdminDash',
                params: {
                  estabelecimentoId
                }
              }
            ],
          });
        }
      }
    ]
  );

  return;
}

      // =========================================
      // PENDENTE
      // =========================================

      if (
        ['pending', 'in_process']
          .includes(status)
      ) {

        setLoading(true);

        return;
      }

      // =========================================
      // RECUSADO
      // =========================================

      if (
        ['rejected', 'cancelled']
          .includes(status)
      ) {

        unsubscribeRef.current?.();

        setLoading(false);

        Alert.alert(
          'Pagamento Recusado',
          'Verifique os dados do cartão ou tente outro.'
        );

        return;
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
        if (!user?.email) throw new Error('Sessão expirada. Faça login novamente.');

        // Inicialização Modular correta para evitar "Property functions doesn't exist"
        const functionsInstance = getFunctions(getApp(), 'southamerica-east1');
        const criarAssinatura = httpsCallable(functionsInstance, 'criarAssinaturaCartao');

        await criarAssinatura({
  estabelecimentoId,
  plano: planoId,
  email: user.email,

  token: data.token,

  payment_method_id:
    data.payment_method_id,

  issuer_id:
    data.issuer_id,

  installments:
    data.installments,

  payer:
    data.payer,

  valor: Number(valor),
  addIA: addIA === true,
});

        monitorarPagamento();
      }

      if (data.type === 'ERROR') {
        setLoading(false);
        Alert.alert('Erro no Checkout', data.message);
      }

      if (data.type === 'DEBUG') {
        console.log('WEBVIEW_DEBUG:', data.message);
      }
   } catch (e: any) {

  setLoading(false);

  console.log(
    'ERRO_FULL:',
    JSON.stringify(e, null, 2)
  );

  Alert.alert(
    'Erro',
    e?.message ||
    e?.details?.message ||
    'Erro desconhecido'
  );
}

};

const html = gerarHTML(valor);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={32} color="#C9A96E" />
        </TouchableOpacity>
        <Text style={styles.title}>Pagamento com Cartão</Text>
      </View>

      <LinearGradient colors={['#1A1A1A', '#0D0D0D']} style={styles.summaryCard}>
        <Text style={styles.planoNome}>PLANO {planoId?.toUpperCase()}</Text>
        <Text style={styles.valorTxt}>
          R$ {Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </Text>
      </LinearGradient>

      <View style={styles.webWrapper}>
        <WebView
          ref={webRef}
          source={{ html, baseUrl: 'https://www.mercadopago.com.br' }}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          mixedContentMode="always"
          style={{ flex: 1, backgroundColor: 'transparent' }}
          onMessage={onMessage}
        />

        {!ready && (
          <View style={styles.loaderWeb}>
            <ActivityIndicator size="large" color="#C9A96E" />
            <Text style={{ color: '#888', marginTop: 10 }}>Iniciando ambiente seguro...</Text>
          </View>
        )}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#C9A96E" />
          <Text style={styles.loadingText}>Validando com a operadora...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const gerarHTML = (valor: number) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <script src="https://sdk.mercadopago.com/js/v2"></script>
  <style>
    body { background: #0D0D0D; margin: 0; padding: 15px; font-family: sans-serif; }
    #cardPaymentBrick_container { width: 100%; min-height: 500px; }
  </style>
</head>
<body>
  <div id="cardPaymentBrick_container"></div>
  <script>
    const sendLog = (msg) => {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "DEBUG", message: msg }));
    };

    window.onload = async function() {
      try {
        sendLog("Iniciando SDK Mercado Pago...");
        const mp = new MercadoPago('APP_USR-1a1b8d87-b82c-4023-8862-6757eab7de2e', { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        const settings = {
          initialization: { amount: ${Number(valor)} },
          callbacks: {
            onReady: () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: "READY" }));
            },
            onSubmit: async (cardFormData) => {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: "TOKEN",
token: cardFormData.token,
payment_method_id: cardFormData.payment_method_id,
issuer_id: cardFormData.issuer_id,
installments: cardFormData.installments,
payer: cardFormData.payer
  }));

  return new Promise((resolve) => resolve());
},
            onError: (error) => {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: "ERROR",
                message: "Erro ao carregar o checkout. Tente novamente."
              }));
            }
          },
          customization: {
            visual: { style: { theme: 'dark' } }
          }
        };

        window.cardPaymentBrickController = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', settings);
        sendLog("Brick renderizado.");
      } catch (e) {
        sendLog("Erro: " + e.message);
      }
    };
  </script>
</body>
</html>
`;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 60,
  },
  title: { color: '#fff', fontSize: 18, marginLeft: 10, fontWeight: 'bold' },
  summaryCard: {
    margin: 20,
    padding: 20,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  planoNome: { color: '#C9A96E', fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  valorTxt: { color: '#fff', fontSize: 26, marginTop: 5, fontWeight: '300' },
  webWrapper: { flex: 1, backgroundColor: '#0D0D0D' },
  loaderWeb: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  loadingText: { color: '#C9A96E', marginTop: 15, fontSize: 16 },
});
