import React, { useState, useRef, useEffect } from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView
} from 'react-native';

import {
  getFunctions,
  httpsCallable
} from '@react-native-firebase/functions';

import { getApp } from '@react-native-firebase/app';

import firestore from '@react-native-firebase/firestore';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import Clipboard from '@react-native-clipboard/clipboard';

const getIAAddon = (planoId: string) => {
  if (planoId === 'pro') {
    return {
      textoPreco: '+ R$ 19,99/mes',
      limite: 20,
    };
  }

  if (planoId === 'elite') {
    return {
      textoPreco: '+ R$ 14,90/mes',
      limite: 100,
    };
  }

  return null;
};

export default function CheckoutScreen({
  route,
  navigation
}: any) {

 const {
  planoId,
  preco,
  valor,
  planoNome,
  estabelecimentoId,
  addIA,
  tipoCheckout,
  pacoteIAId,
} = route.params;

const valorFinal =
  Number(valor ?? preco ?? 0);
const isIACreditos = tipoCheckout === 'ia_creditos';
const isIA = tipoCheckout === 'ia' || isIACreditos;
const iaAddon = getIAAddon(String(planoId || ''));
  
  const functionsInstance = getFunctions(
    getApp(),
    'southamerica-east1'
  );

  // =====================================================
  // STATES
  // =====================================================

  const [loading, setLoading] =
    useState(false);

  const [pix, setPix] =
    useState<any>(null);

  const [copiado, setCopiado] =
    useState(false);

  const [statusPix, setStatusPix] =
    useState('idle');

  const [expirado, setExpirado] =
    useState(false);

  // PLANO ATIVO
  const [planoAtual, setPlanoAtual] =
    useState('');

  // PLANO DO PIX PENDENTE
  const [planoPixAtual, setPlanoPixAtual] =
    useState('');

  const [assinaturaAtiva, setAssinaturaAtiva] =
    useState(false);

  const [alertaExibido, setAlertaExibido] =
    useState(false);

  const unsubscribeRef =
    useRef<any>(null);

  const timerRef =
    useRef<any>(null);

  const pagamentoAlvoRef =
    useRef<any>(null);

  // =====================================================
  // TEMPO REAL
  // =====================================================

  useEffect(() => {

    unsubscribeRef.current = firestore()
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .onSnapshot((doc) => {

        const data = doc.data();

        if (!data) return;

        // =================================================
        // STATUS PIX
        // =================================================

       const status = isIA
        ? data.iaSimulacaoPaymentStatus || 'idle'
        : data.paymentStatus || 'idle';

        setStatusPix(status);

        // =================================================
        // PLANO ATIVO
        // =================================================

        setPlanoAtual(
          data.plano || ''
        );

        // =================================================
        // PLANO PENDENTE
        // =================================================

        setPlanoPixAtual(
          data.planoPendente || ''
        );

        // =================================================
        // ASSINATURA
        // =================================================

        setAssinaturaAtiva(
          data.assinaturaAtiva === true
        );

        // =================================================
        // PIX SOMENTE DO PLANO ATUAL
        // =================================================

        const pendenteIA =
          data.iaSimulacaoPagamentoPendente || null;

        const isThisPix = isIACreditos
          ? pendenteIA?.status === 'pending' &&
            pendenteIA?.tipo === 'ia_creditos'
          : isIA
          ? pendenteIA?.status === 'pending' &&
            pendenteIA?.tipo !== 'ia_creditos'
          : data.planoPendente === planoId;

        if (
          isThisPix &&
          isIA &&
          !pagamentoAlvoRef.current &&
          pendenteIA?.mercadoPagoId
        ) {
          pagamentoAlvoRef.current = pendenteIA.mercadoPagoId;
        }

if (
  status === 'pending' &&
  (isIA
    ? data.iaSimulacaoPagamentoPendente?.qrCodeBase64
    : data.pixQrCodeBase64) &&
  isThisPix
) {

          setPix({
            qr_code: isIA
              ? data.iaSimulacaoPagamentoPendente?.qrCode
              : data.pixQrCode,
            qr_code_base64:
              isIA
                ? data.iaSimulacaoPagamentoPendente?.qrCodeBase64
                : data.pixQrCodeBase64
          });

        } else {

          setPix(null);

        }

        // =================================================
        // EXPIRAÇÃO
        // =================================================

        const expira =
          isIA
            ? data.iaSimulacaoPagamentoPendente?.expiraEm?.toDate?.()
            : data.pixExpiraEm?.toDate?.();

        if (expira) {

          const expirou =
            expira.getTime() <= Date.now();

          setExpirado(expirou);

          if (!expirou) {

            const restante =
              expira.getTime() - Date.now();

            if (timerRef.current) {
              clearTimeout(timerRef.current);
            }

            timerRef.current =
              setTimeout(() => {

                setExpirado(true);

              }, restante);

          }

        } else {

          setExpirado(false);

        }

        // =================================================
        // PIX APROVADO
        // =================================================

        const pagamentoDestePlano = isIACreditos
          ? data.iaUltimoPagamentoCreditosId === pagamentoAlvoRef.current
          : isIA
          ? data.iaSimulacaoAtiva === true
          : data.plano === planoId ||
            data.planoAprovado === planoId;

if (
  status === 'approved' &&
  (isIACreditos
    ? data.iaUltimoPagamentoCreditosId === pagamentoAlvoRef.current
    : isIA
    ? data.iaSimulacaoAtiva === true
    : data.assinaturaAtiva === true) &&
  pagamentoDestePlano &&
  !alertaExibido
) {

          setAlertaExibido(true);

          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }

          setPix(null);

          Alert.alert(
            'Pagamento aprovado',
            isIACreditos
              ? 'Creditos extras adicionados a sua Previa IA.'
              : isIA
              ? 'A Previa IA foi ativada por 30 dias.'
              : 'Seu plano foi ativado com sucesso!',
            [
              {
                text: 'Continuar',
                onPress: () => {

                  navigation.replace(
                    'AdminDash',
                    { estabelecimentoId }
                  );

                }
              }
            ]
          );
        }

        // =================================================
        // LIMPA PIX
        // =================================================

        if (
          status !== 'pending' &&
          status !== 'approved'
        ) {

          setPix(null);

        }

      });

    return () => {

      unsubscribeRef.current?.();

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

    };

  }, []);
  

  // =====================================================
  // PAGAR PIX
  // =====================================================

 const pagarPix = async () => {

  if (!isIA && (
    assinaturaAtiva &&
    planoAtual === planoId
  )) {

    Alert.alert('Plano já ativo');

    return;
  }

  try {

    setLoading(true);

    setPix(null);

    setExpirado(false);

    setStatusPix('pending');

    setAlertaExibido(false);

    const fn = httpsCallable(
      functionsInstance,
      isIACreditos
        ? 'criarPagamentoPixCreditosIA'
        : isIA
        ? 'criarPagamentoPixIA'
        : 'criarPagamentoPixAssinatura'
    );

    const payload = isIACreditos
      ? {
          estabelecimentoId,
          pacote: pacoteIAId || '1',
        }
      : isIA
      ? { estabelecimentoId }
      : {
          estabelecimentoId,
          plano: planoId,
          valor: valorFinal,
          addIA: addIA === true,
        };

    const { data }: any = await fn(payload);

    if (!data?.qr_code_base64) {
      throw new Error('PIX inválido');
    }

    pagamentoAlvoRef.current =
      data?.mercadoPagoId || null;

    setPix(data);

  } catch (e: any) {

    console.error(e);

    Alert.alert(
      'Erro',
      e?.message || 'Erro ao gerar PIX'
    );

  } finally {

    setLoading(false);
  }
};
  // =====================================================
  // PAGAR CARTÃO
  // =====================================================

  const pagarCartao = () => {
    if (isIA) {
      Alert.alert(
        'Pagamento por PIX',
        'A Previa IA por 30 dias esta disponivel por PIX.'
      );
      return;
    }

    if (
      assinaturaAtiva &&
      planoAtual === planoId
    ) {

      Alert.alert(
        'Plano já ativo',
        'Você já possui este plano.'
      );

      return;
    }

    navigation.navigate(
      'CartaoScreen',
      {
        estabelecimentoId,
        planoId,
        valor,
        addIA: addIA === true
      }
    );
  };

  // =====================================================
  // COPIAR PIX
  // =====================================================

  const copiarPix = () => {

    if (!pix?.qr_code) return;

    Clipboard.setString(
      pix.qr_code
    );

    setCopiado(true);

    setTimeout(() => {

      setCopiado(false);

    }, 2000);
  };

  // =====================================================
  // LABEL STATUS
  // =====================================================

  const statusLabel = () => {

    if (expirado) {
      return 'EXPIRADO';
    }

    switch (statusPix) {

      case 'approved':
        return 'APROVADO';

      case 'pending':
        return 'PENDENTE';

      case 'rejected':
        return 'RECUSADO';

      case 'cancelled':
        return 'CANCELADO';

      default:
        return 'AGUARDANDO';
    }
  };

  // =====================================================
  // MESMO PLANO
  // =====================================================

  const mesmoPlano =
    !isIA &&
    assinaturaAtiva &&
    planoAtual === planoId;

  // =====================================================
  // PIX DESSE PLANO
  // =====================================================

  const pixDessePlano =
    (isIA || planoPixAtual === planoId) &&
    statusPix === 'pending';

  // =====================================================
  // RENDER
  // =====================================================

  return (

    <ScrollView
      style={s.container}
      contentContainerStyle={{
        paddingBottom: 40
      }}
    >

      {/* HEADER */}

      <View style={s.header}>

        <TouchableOpacity
          onPress={() =>
            navigation.goBack()
          }
        >

          <Icon
            name="arrow-left"
            size={24}
            color="#C9A96E"
          />

        </TouchableOpacity>

        <Text style={s.title}>
          {isIACreditos
            ? 'Comprar creditos IA'
            : isIA
            ? 'Ativar Previa IA'
            : 'Finalizar Assinatura'}
        </Text>

      </View>

      {/* CARD */}

      <View style={s.card}>

        <Text style={s.plano}>
          {planoNome}
        </Text>

        <Text style={s.desc}>
          Gestão completa
        </Text>

        <Text style={s.valor}>
          R$ {Number(valor).toFixed(2)}
        </Text>
{!isIA && addIA === true && (
  <Text style={s.iaResumo}>
    ✨ Prévia IA incluída:
    {iaAddon
      ? ` ${iaAddon.textoPreco} - ${iaAddon.limite} simulacoes por mes`
      : ' pacote IA'}
  </Text>
)}
        <View style={s.badgeRow}>

          <Text
            style={[

              s.badge,

              pixDessePlano && {
                backgroundColor: '#C9A96E'
              },

              assinaturaAtiva &&
              mesmoPlano && {
                backgroundColor: '#1DB954'
              },

              expirado &&
              pixDessePlano && {
                backgroundColor: '#FF4D4D'
              }

            ]}
          >

            {pixDessePlano
              ? statusLabel()
              : assinaturaAtiva &&
                mesmoPlano
              ? 'ATIVO'
              : 'DISPONÍVEL'}

          </Text>

        </View>

        {mesmoPlano && (

          <Text style={s.currentPlan}>
            Plano atual ativo
          </Text>

        )}

      </View>

      {/* PIX */}

      <TouchableOpacity
        style={[

          s.btnPix,

          mesmoPlano && {
            opacity: 0.5
          }

        ]}
        onPress={pagarPix}
        disabled={
          loading ||
          mesmoPlano
        }
      >

        {loading ? (

          <ActivityIndicator color="#000" />

        ) : (

          <>
            <Icon
              name="qrcode"
              size={18}
              color="#000"
            />

            <Text style={s.btnText}>

              {mesmoPlano
                ? 'Plano Atual'
                : pixDessePlano
                ? 'Gerar Novo PIX'
                : 'Pagar com PIX'}

            </Text>
          </>

        )}

      </TouchableOpacity>

      {/* CARTÃO */}

      {!isIA && (
      <TouchableOpacity
        style={[

          s.btnCartao,

          mesmoPlano && {
            opacity: 0.5
          }

        ]}
        onPress={pagarCartao}
        disabled={mesmoPlano}
      >

        <Icon
          name="credit-card"
          size={18}
          color="#FFF"
        />

        <Text
          style={[
            s.btnText,
            { color: '#FFF' }
          ]}
        >

          {mesmoPlano
            ? 'Plano Atual'
            : 'Pagar com Cartão'}

        </Text>

      </TouchableOpacity>
      )}

      {/* QR CODE */}

      {pix &&
        pixDessePlano &&
        !expirado && (

        <View style={s.pixBox}>

          <Text style={s.pixTitle}>
            Escaneie o QR Code
          </Text>

          <View style={s.qrWrapper}>

            <Image
              style={s.qr}
              source={{
                uri:
                  `data:image/png;base64,${pix.qr_code_base64}`
              }}
            />

          </View>

          <TouchableOpacity
            style={s.copyBtn}
            onPress={copiarPix}
          >

            <Icon
              name={
                copiado
                  ? 'check'
                  : 'content-copy'
              }
              size={16}
              color="#C9A96E"
            />

            <Text style={s.copyText}>

              {copiado
                ? 'Copiado!'
                : 'Copiar PIX'}

            </Text>

          </TouchableOpacity>

        </View>

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
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'capitalize'
  },

  desc: {
    color: '#AAA',
    marginTop: 5
  },

  valor: {
    color: '#FFF',
    fontSize: 28,
    marginTop: 10
  },

  badgeRow: {
    marginTop: 15
  },

  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    color: '#000',
    fontWeight: 'bold',
    alignSelf: 'flex-start'
  },

  currentPlan: {
    color: '#1DB954',
    marginTop: 10,
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
    width: 220,
    height: 220
  },

  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10
  },

  copyText: {
    color: '#C9A96E'
  },
iaResumo: {
  color: '#D4AF37',
  fontSize: 13,
  fontWeight: '800',
  marginTop: 10,
  textAlign: 'center',
},
});
