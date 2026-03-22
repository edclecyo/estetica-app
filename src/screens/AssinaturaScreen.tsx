import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StatusBar, Animated, Platform
} from 'react-native';
import { WebView } from 'react-native-webview';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';

const PLANOS = [
  {
    id: 'essencial',
    nome: 'Essencial',
    preco: '30',
    cor: '#4CAF50',
    corBg: 'rgba(76,175,80,0.08)',
    desc: 'Ideal para começar',
    recursos: ['Até 2 profissionais', 'Agendamentos ilimitados', 'Stories', 'Suporte básico'],
    destaque: false,
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: '70',
    cor: '#C9A96E',
    corBg: 'rgba(201,169,110,0.08)',
    desc: 'O mais escolhido',
    recursos: ['Profissionais ilimitados', 'Agendamentos ilimitados', 'Stories em destaque', 'Suporte prioritário', 'Relatórios avançados'],
    destaque: true,
  },
  {
    id: 'elite',
    nome: 'Elite',
    preco: '150',
    cor: '#9C27B0',
    corBg: 'rgba(156,39,176,0.08)',
    desc: 'Máxima visibilidade',
    recursos: ['Tudo do Pro', 'Destaque no ranking', 'Badge exclusivo', 'Gerente de conta', 'API de integração'],
    destaque: false,
  },
];

export default function AssinaturaScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [planoAtual, setPlanoAtual] = useState<string | null>(null);
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);

  useEffect(() => {
    const user = auth().currentUser;
    if (!user) return;

    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', user.uid)
      .onSnapshot(snapshot => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setPlanoAtual(data.plano || null);
          setAssinaturaAtiva(data.assinaturaAtiva || false);
          if (data.assinaturaAtiva && checkoutUrl) {
            setCheckoutUrl(null);
            Alert.alert('Sucesso! 🎉', 'Seu plano foi ativado com sucesso!');
            navigation.goBack();
          }
        }
      });

    return () => unsub();
  }, [checkoutUrl]);

  const handleAssinar = async (planoId: string) => {
    setLoading(planoId);
    const user = auth().currentUser;

    try {
      const estSnap = await firestore()
        .collection('estabelecimentos')
        .where('adminId', '==', user?.uid)
        .get();

      if (estSnap.empty) throw new Error('Estabelecimento não encontrado');

      const estId = estSnap.docs[0].id;

      const { data } = await functions().httpsCallable('criarAssinatura')({
        estabelecimentoId: estId,
        email: user?.email,
        plano: planoId,
      });

      if (data?.url) setCheckoutUrl(data.url);
    } catch (e: any) {
      Alert.alert('Erro', 'Não foi possível gerar o pagamento.');
    } finally {
      setLoading(null);
    }
  };

  const handleTrial = async () => {
    setLoading('trial');
    const user = auth().currentUser;

    try {
      const estSnap = await firestore()
        .collection('estabelecimentos')
        .where('adminId', '==', user?.uid)
        .get();

      if (estSnap.empty) throw new Error('Estabelecimento não encontrado');

      await functions().httpsCallable('iniciarTrial')({
        estabelecimentoId: estSnap.docs[0].id,
      });

      Alert.alert('Trial ativado! 🎉', 'Você tem 14 dias grátis do plano Pro.');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível ativar o trial.');
    } finally {
      setLoading(null);
    }
  };

  if (checkoutUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" />
        <TouchableOpacity style={s.btnFechar} onPress={() => setCheckoutUrl(null)}>
          <Text style={s.btnFecharText}>✕  Fechar Pagamento</Text>
        </TouchableOpacity>
        <WebView
          source={{ uri: checkoutUrl }}
          style={{ flex: 1 }}
          startInLoadingState
          renderLoading={() => (
            <View style={s.webviewLoading}>
              <ActivityIndicator size="large" color="#C9A96E" />
              <Text style={s.webviewLoadingText}>Carregando pagamento...</Text>
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Planos</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* HERO */}
        <View style={s.hero}>
          <Text style={s.heroEmoji}>✨</Text>
          <Text style={s.heroTitulo}>Impulsione seu negócio</Text>
          <Text style={s.heroSub}>
            Escolha o plano ideal e apareça para mais clientes na sua região
          </Text>
        </View>

        {/* STATUS ATUAL */}
        {assinaturaAtiva && planoAtual && (
          <View style={s.statusAtivo}>
            <Text style={s.statusAtivoIcon}>✅</Text>
            <Text style={s.statusAtivoText}>
              Plano <Text style={{ color: '#C9A96E', fontWeight: '800' }}>{planoAtual?.toUpperCase()}</Text> ativo
            </Text>
          </View>
        )}

        {/* TRIAL BANNER */}
        {!assinaturaAtiva && (
          <TouchableOpacity style={s.trialBanner} onPress={handleTrial} disabled={loading === 'trial'}>
            {loading === 'trial'
              ? <ActivityIndicator color="#000" />
              : <>
                  <Text style={s.trialIcon}>🎁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.trialTitulo}>14 dias grátis</Text>
                    <Text style={s.trialSub}>Experimente o plano Pro sem compromisso</Text>
                  </View>
                  <Text style={s.trialArrow}>→</Text>
                </>
            }
          </TouchableOpacity>
        )}

        {/* CARDS DE PLANOS */}
        {PLANOS.map((plano) => {
          const isAtivo = planoAtual === plano.id && assinaturaAtiva;
          const isLoading = loading === plano.id;

          return (
            <View key={plano.id} style={[s.card, { borderColor: plano.cor }, plano.destaque && s.cardDestaque]}>

              {plano.destaque && (
                <View style={[s.badgeDestaque, { backgroundColor: plano.cor }]}>
                  <Text style={s.badgeDestaqueText}>⭐ MAIS POPULAR</Text>
                </View>
              )}

              {isAtivo && (
                <View style={[s.badgeAtivo, { backgroundColor: plano.cor }]}>
                  <Text style={s.badgeAtivoText}>✓ ATIVO</Text>
                </View>
              )}

              <View style={s.cardHeader}>
                <View>
                  <Text style={[s.planoNome, { color: plano.cor }]}>{plano.nome}</Text>
                  <Text style={s.planoDesc}>{plano.desc}</Text>
                </View>
                <View style={s.precoWrap}>
                  <Text style={s.precoPrefixo}>R$</Text>
                  <Text style={[s.preco, { color: plano.cor }]}>{plano.preco}</Text>
                  <Text style={s.precoSufixo}>/mês</Text>
                </View>
              </View>

              <View style={[s.divisor, { backgroundColor: plano.cor + '33' }]} />

              <View style={s.recursos}>
                {plano.recursos.map((r, i) => (
                  <View key={i} style={s.recursoItem}>
                    <Text style={[s.recursoCheck, { color: plano.cor }]}>✓</Text>
                    <Text style={s.recursoText}>{r}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[s.btnAssinar, { backgroundColor: isAtivo ? '#1A1A1A' : plano.cor }, isAtivo && s.btnAtivo]}
                onPress={() => !isAtivo && handleAssinar(plano.id)}
                disabled={isLoading || isAtivo}
              >
                {isLoading
                  ? <ActivityIndicator color="#000" />
                  : <Text style={[s.btnText, isAtivo && { color: plano.cor }]}>
                      {isAtivo ? '✓ Plano Atual' : `Assinar ${plano.nome}`}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          );
        })}

        {/* SEGURANÇA */}
        <View style={s.seguranca}>
          <Text style={s.segurancaIcon}>🔒</Text>
          <Text style={s.segurancaText}>
            Pagamento processado com segurança pelo{' '}
            <Text style={{ color: '#C9A96E' }}>Mercado Pago</Text>
          </Text>
        </View>

        {/* FAQ RÁPIDO */}
        <View style={s.faq}>
          {[
            { q: 'Posso cancelar quando quiser?', r: 'Sim, sem multa ou fidelidade.' },
            { q: 'Como funciona o trial?', r: '14 dias grátis do plano Pro, sem cartão.' },
            { q: 'Meus dados ficam salvos?', r: 'Sim, mesmo após o período trial.' },
          ].map((item, i) => (
            <View key={i} style={s.faqItem}>
              <Text style={s.faqQ}>{item.q}</Text>
              <Text style={s.faqA}>{item.r}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 52,
    borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: '#C9A96E', fontSize: 20 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  hero: { alignItems: 'center', paddingVertical: 28 },
  heroEmoji: { fontSize: 40, marginBottom: 12 },
  heroTitulo: { color: '#FFF', fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  heroSub: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  statusAtivo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,169,110,0.1)',
    borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(201,169,110,0.3)',
  },
  statusAtivoIcon: { fontSize: 18, marginRight: 10 },
  statusAtivoText: { color: '#888', fontSize: 14 },
  trialBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#C9A96E',
    borderRadius: 16, padding: 16, marginBottom: 24, gap: 12,
  },
  trialIcon: { fontSize: 24 },
  trialTitulo: { color: '#000', fontSize: 15, fontWeight: '800' },
  trialSub: { color: '#000', fontSize: 12, opacity: 0.7, marginTop: 2 },
  trialArrow: { color: '#000', fontSize: 20, fontWeight: '700' },
  card: {
    backgroundColor: '#0D0D0D', borderRadius: 20, padding: 20,
    marginBottom: 20, borderWidth: 1, position: 'relative',
  },
  cardDestaque: { borderWidth: 2 },
  badgeDestaque: {
    position: 'absolute', top: -12, alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20,
  },
  badgeDestaqueText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  badgeAtivo: {
    position: 'absolute', top: 16, right: 16,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  badgeAtivoText: { color: '#000', fontSize: 10, fontWeight: '800' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 },
  planoNome: { fontSize: 22, fontWeight: '900' },
  planoDesc: { color: '#555', fontSize: 12, marginTop: 3 },
  precoWrap: { flexDirection: 'row', alignItems: 'flex-end' },
  precoPrefixo: { color: '#666', fontSize: 14, marginBottom: 4, marginRight: 2 },
  preco: { fontSize: 32, fontWeight: '900', lineHeight: 36 },
  precoSufixo: { color: '#555', fontSize: 12, marginBottom: 4, marginLeft: 2 },
  divisor: { height: 1, marginVertical: 16 },
  recursos: { gap: 10, marginBottom: 20 },
  recursoItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recursoCheck: { fontSize: 14, fontWeight: '800', width: 16 },
  recursoText: { color: '#AAA', fontSize: 13 },
  btnAssinar: { borderRadius: 14, padding: 16, alignItems: 'center' },
  btnAtivo: { borderWidth: 1 },
  btnText: { color: '#000', fontWeight: '800', fontSize: 15 },
  seguranca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, marginBottom: 24 },
  segurancaIcon: { fontSize: 16 },
  segurancaText: { color: '#444', fontSize: 12, textAlign: 'center', flex: 1 },
  faq: { backgroundColor: '#0D0D0D', borderRadius: 16, padding: 20, gap: 16, borderWidth: 1, borderColor: '#1A1A1A' },
  faqItem: { gap: 4 },
  faqQ: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  faqA: { color: '#555', fontSize: 13 },
  btnFechar: { backgroundColor: '#1A1A1A', padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  btnFecharText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  webviewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  webviewLoadingText: { color: '#666', marginTop: 12, fontSize: 14 },
});