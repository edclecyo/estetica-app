import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert, Modal
} from 'react-native';
import { WebView } from 'react-native-webview';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function CheckoutPagamentoScreen({ route, navigation }: any) {
  const { planoId, preco, estabelecimentoId } = route.params;

  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const iniciarPagamento = async () => {
    setLoading(true);
    try {
      const user = auth().currentUser;

      if (!user?.email) {
        Alert.alert('Erro', 'Usuário não autenticado');
        return;
      }

      // ✅ Usa a function que JÁ EXISTE no seu backend: criarAssinatura
      const fn = functions().httpsCallable('criarAssinatura');
      const { data } = await fn({
        estabelecimentoId,
        email: user.email,
        plano: planoId,
      });

      if (data?.url) {
        setCheckoutUrl(data.url); // init_point do Mercado Pago
      } else {
        Alert.alert('Erro', data?.message || 'Não foi possível iniciar o pagamento');
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Erro', e.message || 'Erro ao iniciar pagamento');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigationChange = (navState: any) => {
    const url: string = navState.url || '';

    if (url.includes('/success') || url.includes('status=approved')) {
      setCheckoutUrl(null);
      Alert.alert('✅ Sucesso', 'Assinatura ativada!', [
        {
          text: 'OK',
          onPress: () => navigation.replace('AdminDash', { estabelecimentoId }),
        },
      ]);
    } else if (url.includes('/failure') || url.includes('status=rejected')) {
      setCheckoutUrl(null);
      Alert.alert('❌ Falha', 'Pagamento recusado. Tente novamente.');
    } else if (url.includes('/pending') || url.includes('status=pending')) {
      setCheckoutUrl(null);
      Alert.alert('⏳ Pendente', 'Pagamento em análise. Você será notificado em breve.');
      navigation.replace('AdminDash', { estabelecimentoId });
    }
  };

  const nomePlano = (planoId: string) => {
    const nomes: Record<string, string> = {
      essencial: 'Essencial',
      pro: 'Pro',
      elite: 'Elite',
    };
    return nomes[planoId] || planoId;
  };

  return (
    <View style={s.container}>

      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#C9A96E" />
        </TouchableOpacity>
        <Text style={s.titulo}>Assinar Plano</Text>
      </View>

      {/* CARD DO PLANO */}
      <View style={s.card}>
        <View style={s.badgePlano}>
          <Icon name="crown" size={16} color="#000" />
          <Text style={s.badgeText}>Plano {nomePlano(planoId)}</Text>
        </View>

        <View style={s.divider} />

        <View style={s.linha}>
          <Text style={s.label}>Valor mensal</Text>
          <Text style={s.preco}>R$ {preco}</Text>
        </View>

        <View style={s.linha}>
          <Text style={s.label}>Renovação</Text>
          <Text style={s.valor}>Automática (30 dias)</Text>
        </View>

        <View style={s.linha}>
          <Text style={s.label}>Forma de pagamento</Text>
          <Text style={s.valor}>Cartão ou PIX</Text>
        </View>
      </View>

      {/* INFO */}
      <View style={s.infoBox}>
        <Icon name="shield-check" size={18} color="#C9A96E" />
        <Text style={s.infoTxt}>
          Você será redirecionado para o ambiente seguro do Mercado Pago
        </Text>
      </View>

      {/* BOTÃO */}
      <TouchableOpacity
        style={[s.botao, loading && { opacity: 0.7 }]}
        onPress={iniciarPagamento}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Icon name="lock" size={18} color="#000" />
            <Text style={s.botaoText}>Pagar R$ {preco} com segurança</Text>
          </>
        )}
      </TouchableOpacity>

      {/* WEBVIEW MODAL — Checkout Pro */}
      <Modal visible={!!checkoutUrl} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#0D0D0D' }}>

          <TouchableOpacity style={s.closeBtn} onPress={() => setCheckoutUrl(null)}>
            <Icon name="close" size={20} color="#C9A96E" />
            <Text style={s.closeText}>Cancelar pagamento</Text>
          </TouchableOpacity>

          {checkoutUrl && (
            <WebView
              source={{ uri: checkoutUrl }}
              onNavigationStateChange={handleNavigationChange}
              startInLoadingState
              renderLoading={() => (
                <View style={s.webviewLoader}>
                  <ActivityIndicator size="large" color="#C9A96E" />
                  <Text style={s.webviewLoaderTxt}>Carregando Mercado Pago...</Text>
                </View>
              )}
            />
          )}

        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  titulo: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 14,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C9A96E33',
  },
  badgePlano: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#C9A96E',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 4,
  },
  badgeText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2A2A',
    marginVertical: 14,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: {
    color: '#888',
    fontSize: 13,
  },
  valor: {
    color: '#fff',
    fontSize: 13,
  },
  preco: {
    color: '#C9A96E',
    fontWeight: '800',
    fontSize: 18,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  infoTxt: {
    color: '#888',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  botao: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#C9A96E',
    padding: 16,
    borderRadius: 14,
  },
  botaoText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#000',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1A1A',
    padding: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: '#2A2A2A',
  },
  closeText: {
    color: '#C9A96E',
    fontSize: 15,
    fontWeight: '600',
  },
  webviewLoader: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
  },
  webviewLoaderTxt: {
    color: '#888',
    marginTop: 12,
    fontSize: 13,
  },
});