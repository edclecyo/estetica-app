import React, { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '../contexts/AuthContext';

const GOLD = '#C9A96E';

const PACOTES = [
  {
    id: 'destaque_1d',
    nome: 'Destaque 24 horas',
    valor: 'R$ 5,00',
    desc: 'Bom para testar em dias de movimento alto.',
  },
  {
    id: 'destaque_3d',
    nome: 'Destaque 3 dias',
    valor: 'R$ 12,00',
    desc: 'Mais tempo em destaque no app.',
  },
  {
    id: 'destaque_7d',
    nome: 'Destaque 7 dias',
    valor: 'R$ 25,00',
    desc: 'Melhor para campanhas da semana.',
  },
];

export default function ImpulsionarScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { admin } = useAuth();
  const estabelecimentoParam = route.params?.estabelecimentoId;

  const [estab, setEstab] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pacoteId, setPacoteId] = useState(PACOTES[0].id);
  const [gerando, setGerando] = useState(false);
  const [qr, setQr] = useState<any>(null);
  const [pagamentoId, setPagamentoId] = useState<string | null>(null);
  const [pagamento, setPagamento] = useState<any>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (estabelecimentoParam) {
      const unsub = firestore()
        .collection('estabelecimentos')
        .doc(estabelecimentoParam)
        .onSnapshot(doc => {
          if (doc.exists) {
            setEstab({ id: doc.id, ...doc.data() });
          }
          setLoading(false);
        });

      return unsub;
    }

    if (!admin?.id) {
      setLoading(false);
      return;
    }

    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', admin.id)
      .limit(1)
      .onSnapshot(snap => {
        if (!snap.empty) {
          setEstab({
            id: snap.docs[0].id,
            ...snap.docs[0].data(),
          });
        }

        setLoading(false);
      });

    return unsub;
  }, [admin?.id, estabelecimentoParam]);

  useEffect(() => {
    if (!pagamentoId) return;

    const unsub = firestore()
      .collection('pagamentos')
      .doc(pagamentoId)
      .onSnapshot(doc => {
        if (doc.exists) {
          setPagamento({
            id: doc.id,
            ...doc.data(),
          });
        }
      });

    return unsub;
  }, [pagamentoId]);

  useEffect(() => {
    if (pagamento?.status === 'approved') {
      Alert.alert(
        'Destaque ativo',
        'Pagamento confirmado. Seu estabelecimento entrou em destaque.',
        [{ text: 'OK', onPress: () => navigation.navigate('AdminDash') }]
      );
    }
  }, [pagamento?.status, navigation]);

  const pacoteSelecionado = useMemo(
    () => PACOTES.find(item => item.id === pacoteId) || PACOTES[0],
    [pacoteId]
  );

  const destaqueAte = useMemo(() => {
    const data = estab?.destaqueExpira?.toDate?.();
    if (!data) return null;
    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [estab?.destaqueExpira]);

  const gerarPix = async () => {
    if (!estab?.id) {
      Alert.alert('Erro', 'Cadastre um estabelecimento antes de impulsionar.');
      return;
    }

    try {
      setGerando(true);

      const functionsInstance = getFunctions(
        getApp(),
        'southamerica-east1'
      );
      const fn = httpsCallable(
        functionsInstance,
        'criarPagamentoPixImpulsionamento'
      );

      const res: any = await fn({
        estabelecimentoId: estab.id,
        pacoteId,
      });

      setQr(res.data);
      setPagamentoId(res.data?.pagamentoId || null);
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

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>{'<'}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={s.headerTitulo}>Impulsionar</Text>
          <Text style={s.headerSub}>Coloque seu estabelecimento em destaque</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={s.heroIcon}>*</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>
              {estab?.nome || 'Seu estabelecimento'}
            </Text>
            <Text style={s.heroSub}>
              Aparece com prioridade nas areas de destaque do app.
            </Text>
          </View>
        </View>

        {estab?.destaqueAtivo && destaqueAte ? (
          <View style={s.ativoBox}>
            <Text style={s.ativoTitle}>Destaque ativo</Text>
            <Text style={s.ativoSub}>Valido ate {destaqueAte}</Text>
          </View>
        ) : null}

        <Text style={s.sectionTitle}>Escolha o periodo</Text>

        {PACOTES.map(pacote => {
          const ativo = pacote.id === pacoteId;

          return (
            <TouchableOpacity
              key={pacote.id}
              activeOpacity={0.85}
              style={[s.pacoteCard, ativo && s.pacoteAtivo]}
              onPress={() => {
                setPacoteId(pacote.id);
                setQr(null);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.pacoteNome}>{pacote.nome}</Text>
                <Text style={s.pacoteDesc}>{pacote.desc}</Text>
              </View>

              <View style={s.valorPill}>
                <Text style={s.valorText}>{pacote.valor}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {!qr && (
          <TouchableOpacity
            style={[s.gerarBtn, gerando && { opacity: 0.7 }]}
            onPress={gerarPix}
            disabled={gerando}
          >
            {gerando ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.gerarBtnText}>
                Gerar PIX - {pacoteSelecionado.valor}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {qr?.qr_code && (
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
              onPress={() => {
                setQr(null);
                setPagamentoId(null);
                setPagamento(null);
              }}
            >
              <Text style={s.novoBtnText}>Escolher outro pacote</Text>
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
  backIcon: { color: GOLD, fontSize: 22, fontWeight: '900' },
  headerTitulo: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  headerSub: { color: GOLD, fontSize: 11, marginTop: 2 },
  scroll: { padding: 18, paddingBottom: 44 },
  hero: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: 'rgba(201,169,110,0.16)',
    color: GOLD,
    fontSize: 28,
    fontWeight: '900',
  },
  heroTitle: { color: '#FFF', fontSize: 17, fontWeight: '900' },
  heroSub: { color: '#AAA', fontSize: 12, lineHeight: 18, marginTop: 3 },
  ativoBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  ativoTitle: { color: '#2E7D32', fontWeight: '900' },
  ativoSub: { color: '#2E7D32', fontSize: 12, marginTop: 2 },
  sectionTitle: {
    color: '#1A1A1A',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  pacoteCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  pacoteAtivo: { borderColor: GOLD, backgroundColor: '#FFFDF7' },
  pacoteNome: { color: '#1A1A1A', fontSize: 14, fontWeight: '900' },
  pacoteDesc: { color: '#777', fontSize: 12, marginTop: 3 },
  valorPill: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  valorText: { color: GOLD, fontWeight: '900', fontSize: 12 },
  gerarBtn: {
    backgroundColor: GOLD,
    borderRadius: 16,
    padding: 17,
    alignItems: 'center',
    marginTop: 8,
  },
  gerarBtnText: { color: '#000', fontSize: 15, fontWeight: '900' },
  pixCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
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
});
