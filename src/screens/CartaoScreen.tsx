import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';

import { WebView } from 'react-native-webview';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';

export default function CartaoScreen({ route, navigation }: any) {
  const { estabelecimentoId, planoId, valor } = route.params;

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(false);
  const [webLoaded, setWebLoaded] = useState(false);
  const [ready, setReady] = useState(false);

  const onMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'READY') {
        setReady(true);
        setWebLoaded(true);
        return;
      }

      if (data.type === 'TOKEN') {
        setLoading(true);

        const user = auth().currentUser;
        if (!user?.email) throw new Error('Sessão expirada');

        const fn = functions()
          .app
          .functions('southamerica-east1')
          .httpsCallable('criarAssinaturaCartao');

        const resp = await fn({
          estabelecimentoId,
          plano: planoId,
          email: user.email,
          token: data.token
        });

        if (!resp?.data?.ok) {
          throw new Error(resp?.data?.message || 'Pagamento recusado');
        }

        Alert.alert('✅ Sucesso', 'Assinatura ativada!');

        navigation.reset({
          index: 0,
          routes: [{ name: 'AdminDash', params: { estabelecimentoId } }]
        });
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
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* HEADER */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Icon name="chevron-left" size={32} color="#C9A96E" />
          </TouchableOpacity>
          <Text style={s.title}>Pagamento com Cartão</Text>
        </View>

        {/* CARD DE RESUMO LUXO */}
        <LinearGradient 
          colors={['#1A1A1A', '#0D0D0D']} 
          style={s.summaryCard}
        >
          <View>
            <Text style={s.planoLabel}>PLANO SELECIONADO</Text>
            <Text style={s.planoNome}>{planoId?.toUpperCase()}</Text>
          </View>
          <View style={s.divider} />
          <View>
            <Text style={s.valorTxt}>R$ {Number(valor).toFixed(2)}</Text>
            <Text style={s.mes}>mensal</Text>
          </View>
        </LinearGradient>

        <Text style={s.sectionTitle}>Dados do Cartão</Text>

        {/* WEBVIEW CONTAINER */}
        <View style={s.webWrapper}>
          {!ready && (
            <View style={s.loaderWeb}>
              <ActivityIndicator size="large" color="#C9A96E" />
              <Text style={{ color: '#888', marginTop: 10 }}>
                Carregando checkout seguro...
              </Text>
            </View>
          )}

          <View style={[s.webContainer, { opacity: ready ? 1 : 0 }]}>
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html }}
              onMessage={onMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onLoadEnd={() => setWebLoaded(true)}
              startInLoadingState={true}
              style={{ backgroundColor: 'transparent' }}
            />
          </View>
        </View>

        {loading && (
          <View style={s.loadingOverlay}>
            <ActivityIndicator size="large" color="#C9A96E" />
            <Text style={s.loadingText}>Processando Assinatura...</Text>
          </View>
        )}
        
        {/* Espaçamento final */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const gerarHTML = (valor: number) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
    <script src="https://sdk.mercadopago.com/js/v2"></script>
    <style>
        body { margin:0; background:#0D0D0D; font-family: sans-serif; }
        #cardPaymentBrick_container { padding: 10px; }
        .mp-adapter { background: transparent !important; }
    </style>
</head>
<body>
    <div id="cardPaymentBrick_container"></div>
    <script>
        const mp = new MercadoPago('APP_USR-1a1b8d87-b82c-4023-8862-6757eab7de2e', { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        const renderCardPaymentBrick = async (bricksBuilder) => {
            const settings = {
                initialization: { amount: ${valor} },
                customization: {
                    visual: {
                        theme: 'dark',
                        style: {
                            customVariables: {
                                inputBackgroundColor: '#1A1A1A',
                                baseColor: '#C9A96E',
                                outlinePrimaryColor: '#C9A96E',
                                buttonBackgroundColor: '#C9A96E',
                                buttonFontColor: '#000000',
                            }
                        }
                    },
                    paymentMethods: {
                        maxInstallments: 1
                    }
                },
                callbacks: {
                    onReady: () => {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "READY" }));
                    },
                    onSubmit: (cardFormData) => {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: "TOKEN",
                            token: cardFormData.token
                        }));
                    },
                    onError: (error) => {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: "ERROR",
                            message: "Verifique os dados do cartão"
                        }));
                    }
                }
            };
            window.cardPaymentBrickController = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', settings);
        };
        renderCardPaymentBrick(bricksBuilder);
    </script>
</body>
</html>
`;

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 20
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 50,
    marginBottom: 30
  },
  backBtn: {
    marginLeft: -10
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 5
  },
  summaryCard: {
    padding: 25,
    borderRadius: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  planoLabel: {
    color: '#888',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: 'bold'
  },
  planoNome: {
    color: '#C9A96E',
    fontSize: 22,
    fontWeight: '900'
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#333'
  },
  valorTxt: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold'
  },
  mes: {
    fontSize: 14,
    color: '#888',
    textAlign: 'right'
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    marginLeft: 5
  },
  webWrapper: {
    minHeight: 450,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#0D0D0D'
  },
  webContainer: {
    flex: 1,
    minHeight: 500
  },
  loaderWeb: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center'
  },
  loadingOverlay: {
    marginTop: 20,
    alignItems: 'center',
    paddingBottom: 40
  },
  loadingText: {
    color: '#C9A96E',
    marginTop: 10,
    fontWeight: 'bold'
  }
});