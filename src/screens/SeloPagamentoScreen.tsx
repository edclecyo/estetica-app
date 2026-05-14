import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import firestore from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';

const GOLD = '#C9A96E';

export default function SeloPagamentoScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { solicitacaoId, estabelecimentoId } = route.params || {};

  const [solicitacao, setSolicitacao] = useState<any>(null);
  const [estab, setEstab] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [qr, setQr] = useState<any>(null);

  useEffect(() => {
    if (!solicitacaoId) {
      setLoading(false);
      return;
    }

    const unsub = firestore()
      .collection('solicitacoesVerificacao')
      .doc(solicitacaoId)
      .onSnapshot(doc => {
        if (doc.exists) {
          const data = { id: doc.id, ...doc.data() };
          setSolicitacao(data);

          if ((data as any).pixQrCode || (data as any).pixQrCodeBase64) {
            setQr({
              qr_code: (data as any).pixQrCode,
              qr_code_base64: (data as any).pixQrCodeBase64,
            });
          }
        }

        setLoading(false);
      });

    return unsub;
  }, [solicitacaoId]);

  useEffect(() => {
    if (!estabelecimentoId) return;

    const unsub = firestore()
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .onSnapshot(doc => {
        if (doc.exists) {
          setEstab({ id: doc.id, ...doc.data() });
        }
      });

    return unsub;
  }, [estabelecimentoId]);

  useEffect(() => {
    if (solicitacao?.pago === true || estab?.verificado === true) {
      Alert.alert(
        'Selo liberado',
        'Pagamento confirmado. O selo ja esta ativo no estabelecimento.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('SeloVerificacaoScreen'),
          },
        ]
      );
    }
  }, [solicitacao?.pago, estab?.verificado, navigation]);

  const gerarPix = async () => {
    if (!solicitacaoId) {
      Alert.alert('Erro', 'Solicitacao nao encontrada.');
      return;
    }

    try {
      setGerando(true);

      const functionsInstance = getFunctions(
        getApp(),
        'southamerica-east1'
      );
      const fn = httpsCallable(functionsInstance, 'criarPagamentoPixSelo');
      const res: any = await fn({ solicitacaoId });

      setQr(res.data);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel gerar o PIX.');
    } finally {
      setGerando(false);
    }
  };

  const copiar = () => {
    if (!qr?.qr_code) return;

    Clipboard.setString(qr.qr_code);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  const pago = solicitacao?.pago === true || estab?.verificado === true;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>{'<'}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={s.headerTitulo}>Pagar taxa do selo</Text>
          <Text style={s.headerSub}>Liberacao apos PIX aprovado</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.card}>
          <Text style={s.cardTitle}>Selo Verificado</Text>
          <Text style={s.cardSub}>
            {estab?.nome || solicitacao?.estabelecimentoNome || 'Estabelecimento'}
          </Text>

          <View style={s.valorBox}>
            <Text style={s.valorLabel}>Taxa unica</Text>
            <Text style={s.valor}>R$ 14,90</Text>
          </View>

          {pago ? (
            <View style={s.sucessoBox}>
              <Text style={s.sucessoIcon}>✓</Text>
              <Text style={s.sucessoText}>
                Pagamento confirmado. Selo ativo.
              </Text>
            </View>
          ) : null}
        </View>

        {!qr && !pago && (
          <TouchableOpacity
            style={[s.gerarBtn, gerando && { opacity: 0.7 }]}
            onPress={gerarPix}
            disabled={gerando}
          >
            {gerando ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.gerarBtnText}>Gerar PIX</Text>
            )}
          </TouchableOpacity>
        )}

        {qr?.qr_code && !pago && (
          <View style={s.pixCard}>
            {!!qr.qr_code_base64 && (
              <Image
                source={{ uri: `data:image/png;base64,${qr.qr_code_base64}` }}
                style={s.qrImage}
              />
            )}

            <Text style={s.pixLabel}>Copia e cola</Text>
            <View style={s.codigoBox}>
              <Text numberOfLines={3} style={s.codigo}>
                {qr.qr_code}
              </Text>
            </View>

            <TouchableOpacity style={s.copiarBtn} onPress={copiar}>
              <Text style={s.copiarText}>
                {copiado ? 'Copiado' : 'Copiar codigo'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.novoBtn}
              onPress={() => setQr(null)}
            >
              <Text style={s.novoBtnText}>Gerar novo PIX</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 56,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { color: GOLD, fontSize: 28, fontWeight: '700' },
  headerTitulo: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  headerSub: { color: GOLD, fontSize: 11, marginTop: 2 },
  scroll: { padding: 18, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EFE7D8',
    marginBottom: 16,
  },
  cardTitle: { color: '#1A1A1A', fontSize: 18, fontWeight: '900' },
  cardSub: { color: '#777', fontSize: 13, marginTop: 4 },
  valorBox: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },
  valorLabel: { color: '#AAA', fontSize: 11, fontWeight: '700' },
  valor: { color: GOLD, fontSize: 26, fontWeight: '900', marginTop: 2 },
  gerarBtn: {
    backgroundColor: GOLD,
    borderRadius: 16,
    padding: 17,
    alignItems: 'center',
  },
  gerarBtnText: { color: '#000', fontSize: 15, fontWeight: '900' },
  pixCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
  },
  qrImage: { width: 210, height: 210, marginBottom: 14 },
  pixLabel: { color: '#777', fontSize: 12, fontWeight: '800', alignSelf: 'flex-start' },
  codigoBox: {
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    width: '100%',
  },
  codigo: { color: '#333', fontSize: 11 },
  copiarBtn: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 15,
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
  },
  copiarText: { color: GOLD, fontWeight: '900' },
  novoBtn: { padding: 14 },
  novoBtnText: { color: '#777', fontWeight: '700' },
  sucessoBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  sucessoIcon: { color: '#2E7D32', fontSize: 20, fontWeight: '900' },
  sucessoText: { color: '#2E7D32', flex: 1, fontWeight: '700' },
});
