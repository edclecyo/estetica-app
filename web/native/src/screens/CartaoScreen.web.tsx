import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';

declare global {
  interface Window {
    MercadoPago?: any;
    cardPaymentBrickController?: any;
  }
}

const PUBLIC_KEY = 'APP_USR-1a1b8d87-b82c-4023-8862-6757eab7de2e';

function carregarMercadoPagoSdk() {
  return new Promise<void>((resolve, reject) => {
    if (window.MercadoPago) {
      resolve();
      return;
    }

    const existente = document.querySelector<HTMLScriptElement>(
      'script[src="https://sdk.mercadopago.com/js/v2"]'
    );

    if (existente) {
      existente.addEventListener('load', () => resolve(), { once: true });
      existente.addEventListener('error', () => reject(new Error('Erro ao carregar Mercado Pago')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Erro ao carregar Mercado Pago'));
    document.head.appendChild(script);
  });
}

export default function CartaoScreen({ route, navigation }: any) {
  const { estabelecimentoId, planoId, valor } = route.params;

  const unsubscribeRef = useRef<any>(null);
  const processedRef = useRef(false);
  const brickId = useRef(`cardPaymentBrick_${Date.now()}`);

  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [erro, setErro] = useState('');

  const monitorarPagamento = () => {
    unsubscribeRef.current?.();

    unsubscribeRef.current = firestore()
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .onSnapshot((doc) => {
        const data = doc.data();
        if (!data) return;

        const status = data.paymentStatus;
        const planoOk = data.plano === planoId || data.planoPendente === planoId;

        if (status === 'approved' && planoOk) {
          if (processedRef.current) return;

          processedRef.current = true;
          unsubscribeRef.current?.();
          setLoading(false);

          Alert.alert('Sucesso', 'Assinatura ativada com sucesso!', [
            {
              text: 'Continuar',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'AdminDash', params: { estabelecimentoId } }],
                });
              },
            },
          ]);

          return;
        }

        if (['pending', 'in_process'].includes(status)) {
          setLoading(true);
          return;
        }

        if (['rejected', 'cancelled'].includes(status)) {
          unsubscribeRef.current?.();
          setLoading(false);
          Alert.alert('Pagamento recusado', 'Verifique os dados do cartão ou tente outro.');
        }
      });
  };

  useEffect(() => {
    let ativo = true;

    const montarBrick = async () => {
      try {
        setErro('');
        setReady(false);

        await carregarMercadoPagoSdk();

        if (!ativo || !window.MercadoPago) return;

        await window.cardPaymentBrickController?.unmount?.();

        const mp = new window.MercadoPago(PUBLIC_KEY, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        window.cardPaymentBrickController = await bricksBuilder.create(
          'cardPayment',
          brickId.current,
          {
            initialization: {
              amount: Number(valor),
            },
            callbacks: {
              onReady: () => {
                if (ativo) setReady(true);
              },
              onSubmit: async (cardFormData: any) => {
                setLoading(true);

                try {
                  const user = auth().currentUser;
                  if (!user?.email) {
                    throw new Error('Sessão expirada. Faça login novamente.');
                  }

                  const functionsInstance = getFunctions(getApp(), 'southamerica-east1');
                  const criarAssinatura = httpsCallable(functionsInstance, 'criarAssinaturaCartao');

                  await criarAssinatura({
                    estabelecimentoId,
                    plano: planoId,
                    email: user.email,
                    token: cardFormData.token,
                    payment_method_id: cardFormData.payment_method_id,
                    issuer_id: cardFormData.issuer_id,
                    installments: cardFormData.installments,
                    payer: cardFormData.payer,
                    valor: Number(valor),
                  });

                  monitorarPagamento();
                } catch (e: any) {
                  setLoading(false);
                  Alert.alert('Erro', e?.message || e?.details?.message || 'Erro ao processar pagamento.');
                  throw e;
                }
              },
              onError: (error: any) => {
                console.log('MP_BRICK_ERROR:', error);
                if (ativo) {
                  setErro('Não foi possível carregar o pagamento com cartão.');
                  setReady(true);
                }
              },
            },
            customization: {
              visual: { style: { theme: 'dark' } },
            },
          }
        );
      } catch (e: any) {
        console.log('ERRO_CARTAO_WEB:', e);
        if (ativo) {
          setErro(e?.message || 'Erro ao iniciar pagamento com cartão.');
          setReady(true);
        }
      }
    };

    montarBrick();

    return () => {
      ativo = false;
      unsubscribeRef.current?.();
      window.cardPaymentBrickController?.unmount?.();
    };
  }, [estabelecimentoId, planoId, valor]);

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
        <div id={brickId.current} style={{ width: '100%', minHeight: 520 }} />

        {!ready && (
          <View style={styles.loaderWeb}>
            <ActivityIndicator size="large" color="#C9A96E" />
            <Text style={styles.loaderText}>Iniciando ambiente seguro...</Text>
          </View>
        )}

        {!!erro && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{erro}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => window.location.reload()}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
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
  webWrapper: { flex: 1, backgroundColor: '#0D0D0D', padding: 14 },
  loaderWeb: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loaderText: { color: '#888', marginTop: 10 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  loadingText: { color: '#C9A96E', marginTop: 15, fontSize: 16 },
  errorBox: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#333',
  },
  errorText: { color: '#FFF', fontSize: 14, marginBottom: 12 },
  retryBtn: {
    backgroundColor: '#C9A96E',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  retryText: { color: '#000', fontWeight: '900' },
});
