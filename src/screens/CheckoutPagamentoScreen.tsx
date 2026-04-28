import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image, ScrollView
} from 'react-native';

import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Clipboard from '@react-native-clipboard/clipboard';

export default function CheckoutScreen({ route, navigation }: any) {
  const {
    planoId,
    estabelecimentoId,
    planoNome,
    valor
  } = route.params;

  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pix, setPix] = useState<any>(null);
  const [statusPix, setStatusPix] = useState<string>('idle');
  const [expirado, setExpirado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<any>(null);

  const functionsInstance = getFunctions(getApp(), 'southamerica-east1');

  // ================= CLEANUP =================
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ================= MONITORAMENTO REAL =================
const iniciarMonitoramentoPix = () => {
  unsubscribeRef.current?.();

  unsubscribeRef.current = firestore()
    .collection('estabelecimentos')
    .doc(estabelecimentoId)
    .onSnapshot((doc) => {
      const data = doc.data();
      if (!data) return;

      const status = data.pixStatus;
      setStatusPix(status || 'pending');

      if (status === 'approved' && !isProcessing) {
        setIsProcessing(true);

        unsubscribeRef.current?.();
        if (timerRef.current) clearTimeout(timerRef.current);

        Alert.alert('Pagamento confirmado', 'Seu plano foi ativado!', [
          {
            text: 'Entrar',
            onPress: () =>
              navigation.replace('AdminDash', { estabelecimentoId })
          }
        ]);
      }

      if (status === 'expired') {
        setExpirado(true);
      }
    });
};

  // ================= PIX =================
const pagarPix = async () => {
  if (loading) return;

  setLoading(true);
  setExpirado(false);

  // 🔥 RESET (ESSENCIAL)
  setStatusPix('pending');
  setIsProcessing(false);
  setPix(null);

  try {
    const fn = httpsCallable(functionsInstance, 'criarPagamentoPixAssinatura');

    const { data } = await fn({
      estabelecimentoId,
      plano: planoId,
      valor: valor
    });

    if (!data?.qr_code_base64) {
      throw new Error('Falha ao gerar QR Code');
    }

    setPix(data);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setExpirado(true);
      Alert.alert(
        'PIX expirado',
        'Deseja tentar novamente?',
        [
          { text: 'Tentar PIX', onPress: pagarPix },
          { text: 'Cartão', onPress: pagarCartao }
        ]
      );
    }, 1000 * 60 * 3);

    iniciarMonitoramentoPix();

  } catch (e: any) {
    console.error(e);

    if (e?.code === 'resource-exhausted') {
      iniciarMonitoramentoPix();
    } else {
      Alert.alert('Erro', e?.message || 'Erro ao gerar PIX');
    }
  } finally {
    setLoading(false);
  }
};

  // ================= CARTÃO =================
  const pagarCartao = () => {
    navigation.navigate('CartaoScreen', {
      estabelecimentoId,
      planoId,
      valor
    });
  };

  // ================= COPIAR =================
  const copiarPix = () => {
    if (!pix?.qr_code) return;
    Clipboard.setString(pix.qr_code);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'APROVADO';
      case 'pending': return 'PENDENTE';
      case 'expired': return 'EXPIRADO';
      default: return 'AGUARDANDO';
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#C9A96E" />
        </TouchableOpacity>
        <Text style={s.title}>Finalizar Assinatura</Text>
      </View>

      <View style={s.card}>
        <Text style={s.plano}>{planoNome}</Text>
        <Text style={s.desc}>Gestão completa</Text>
        <Text style={s.valor}>R$ {Number(valor).toFixed(2)}</Text>

        <View style={s.badgeRow}>
          <Text style={[
            s.badge,
            statusPix === 'approved' && { backgroundColor: '#1DB954' },
            statusPix === 'pending' && { backgroundColor: '#C9A96E' },
            statusPix === 'expired' && { backgroundColor: '#FF4D4D' },
          ]}>
            {statusLabel(statusPix)}
          </Text>
        </View>
      </View>

      {isProcessing ? (
        <View style={s.processingBox}>
          <ActivityIndicator size="large" color="#C9A96E" />
          <Text style={s.processingText}>Confirmando pagamento...</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[s.btnPix, (loading || statusPix === 'pending') && { opacity: 0.7 }]}
            onPress={pagarPix}
            disabled={loading || statusPix === 'pending'}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Icon name="qrcode" size={18} color="#000" />
                <Text style={s.btnText}>Pagar com PIX</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnCartao}
            onPress={pagarCartao}
          >
            <Icon name="credit-card" size={18} color="#fff" />
            <Text style={[s.btnText, { color: '#fff' }]}>Pagar com Cartão</Text>
          </TouchableOpacity>

          {pix && !expirado && (
            <View style={s.pixBox}>
              <Text style={s.pixTitle}>Escaneie o QR Code</Text>

              <View style={s.qrWrapper}>
                <Image
                  style={s.qr}
                  source={{ uri: `data:image/png;base64,${pix.qr_code_base64}` }}
                />
              </View>

              <TouchableOpacity style={s.copyBtn} onPress={copiarPix}>
                <Icon name={copiado ? "check" : "content-copy"} size={16} color="#C9A96E" />
                <Text style={s.copyText}>
                  {copiado ? 'Copiado!' : 'Copiar PIX'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    marginLeft: 10,
    fontWeight: 'bold'
  },
  card: {
    backgroundColor: '#111',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20
  },
  plano: {
    color: '#C9A96E',
    fontSize: 16,
    fontWeight: 'bold'
  },
  desc: {
    color: '#aaa',
    marginTop: 5
  },
  valor: {
    color: '#FFF',
    fontSize: 28,
    marginTop: 10
  },
  badgeRow: {
    marginTop: 10
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    color: '#000',
    fontWeight: 'bold'
  },
  btnPix: {
    backgroundColor: '#C9A96E',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10
  },
  btnCartao: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10
  },
  btnText: {
    color: '#000',
    fontWeight: 'bold'
  },
  pixBox: {
    marginTop: 20,
    alignItems: 'center'
  },
  pixTitle: {
    color: '#FFF',
    marginBottom: 10
  },
  qrWrapper: {
    backgroundColor: '#FFF',
    padding: 10,
    borderRadius: 10
  },
  qr: {
    width: 200,
    height: 200
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 5
  },
  copyText: {
    color: '#C9A96E'
  },
  processingBox: {
    marginTop: 30,
    alignItems: 'center'
  },
  processingText: {
    color: '#FFF',
    marginTop: 10
  }
});