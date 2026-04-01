import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, StatusBar, ScrollView,
  Alert, Image, PermissionsAndroid, Platform, Animated,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import StoriesHeader from '../components/StoriesHeader';
import type { Estabelecimento } from '../types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Constantes mantidas conforme original
const TIPOS = [
  'Todos', 'Salão de Beleza', 'Barbearia Premium', 'Espaço de Unhas', 'Manicure & Pedicure',
  'Clínica de Estética', 'Estética Avançada', 'Spa & Relaxamento', 'Especialista em Cabelos',
  'Terapia Capilar', 'Estúdio de Maquiagem', 'Design de Sobrancelhas', 'Extensão de Cílios',
  'Micropigmentação', 'Depilação a Laser', 'Depilação com Cera', 'Estúdio de Tatuagem',
  'Body Piercing', 'Massoterapia', 'Bronzeamento Artificial', 'Podologia',
  'Harmonização Facial', 'Estúdio de Yoga', 'Centro Holístico',
];

const TIPO_ICONS: Record<string, string> = {
  'Todos': '✦', 'Salão de Beleza': '✂️', 'Barbearia Premium': '💈',
  'Espaço de Unhas': '💅', 'Manicure & Pedicure': '🎨', 'Clínica de Estética': '🏥',
  'Estética Avançada': '🧬', 'Spa & Relaxamento': '🧖‍♀️', 'Especialista em Cabelos': '💇‍♀️',
  'Terapia Capilar': '🧴', 'Estúdio de Maquiagem': '💄', 'Design de Sobrancelhas': '📐',
  'Extensão de Cílios': '👁️', 'Micropigmentação': '✒️', 'Depilação a Laser': '⚡',
  'Depilação com Cera': '🍯', 'Estúdio de Tatuagem': '🎨', 'Body Piercing': '💎',
  'Massoterapia': '💆‍♂️', 'Bronzeamento Artificial': '☀️', 'Podologia': '👣',
  'Harmonização Facial': '✨', 'Estúdio de Yoga': '🧘', 'Centro Holístico': '🌿',
};

const GOLD = '#C9A96E';
const GOLD2 = '#F0D080';
const GOLD3 = '#A07040';

// Componentes Auxiliares otimizados
const SeloVerificado = React.memo(({ size = 20 }: { size?: number }) => (
  <Image
    source={require('../assets/selo_verificado.png')}
    style={{ width: size, height: size, tintColor: GOLD }}
    resizeMode="contain"
  />
));

function FotoVerificada({ uri, emoji, size = 68 }: { uri?: string | null; emoji?: string; size?: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [anim]);

  const borderColor = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [GOLD3, GOLD2, GOLD] });
  const borderWidth = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [2, 4, 2] });

  return (
    <Animated.View style={{
      width: size + 8, height: size + 8, borderRadius: (size + 8) / 2,
      borderWidth, borderColor, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A1A',
    }}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        : <Text style={{ fontSize: size * 0.4 }}>{emoji || '🏢'}</Text>
      }
    </Animated.View>
  );
}

// Funções de Cálculo (Puramente lógicas)
function calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (typeof lat1 !== 'number' || typeof lng1 !== 'number' || typeof lat2 !== 'number' || typeof lng2 !== 'number') return 9999;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatarDistancia(km: number): string {
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

function estaAberto(horario?: string, diasFuncionamento?: string[]): boolean {
  if (!horario || !horario.includes('-')) return false;
  const agora = new Date();
  const diaSemana = agora.getDay();
  const DIAS_MAP: Record<string, number> = {
    'Dom': 0, 'Domingo': 0, 'Seg': 1, 'Segunda': 1, 'Segunda-feira': 1,
    'Ter': 2, 'Terça': 2, 'Terça-feira': 2, 'Qua': 3, 'Quarta': 3, 'Quarta-feira': 3,
    'Qui': 4, 'Quinta': 4, 'Quinta-feira': 4, 'Sex': 5, 'Sexta': 5, 'Sexta-feira': 5,
    'Sáb': 6, 'Sábado': 6,
  };
  if (diasFuncionamento && diasFuncionamento.length > 0) {
    if (!diasFuncionamento.some(d => DIAS_MAP[d] === diaSemana)) return false;
  } else {
    if (diaSemana === 0) return false;
  }
  const atual = agora.getHours() * 60 + agora.getMinutes();
  const [inicio, fim] = horario.split('-');
  const toMin = (h: string) => { 
    const [hr, mn] = h.trim().split(':'); 
    return parseInt(hr) * 60 + (mn ? parseInt(mn) : 0); 
  };
  return atual >= toMin(inicio) && atual < toMin(fim);
}

// Seção de Verificados (Horizontal)
function VerificadosSection({ navigation, user }: { navigation: any; user: any }) {
  const [verificados, setVerificados] = useState<any[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const [autoIdx, setAutoIdx] = useState(0);

  useEffect(() => {
    const unsub = firestore().collection('estabelecimentos')
      .where('verificado', '==', true).where('ativo', '==', true).limit(20)
      .onSnapshot(snap => { 
        if (snap) setVerificados(snap.docs.map(d => ({ id: d.id, ...d.data() }))); 
      }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (verificados.length === 0) return;
    const interval = setInterval(() => {
      setAutoIdx(prev => {
        const next = (prev + 1) % verificados.length;
        scrollRef.current?.scrollTo({ x: next * 162, animated: true });
        return next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [verificados.length]);

  if (verificados.length === 0) return null;

  return (
    <View style={sv.container}>
      <View style={sv.tituloRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SeloVerificado size={18} />
          <Text style={sv.titulo}>Verificados</Text>
        </View>
        <Text style={sv.subtitulo}>Estabelecimentos de confiança</Text>
      </View>

      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={sv.scroll} decelerationRate="fast"
        snapToInterval={162} snapToAlignment="start" scrollEventThrottle={16}>
        {verificados.map((item) => {
          const imagemUri = item.fotoPerfil || (item.img?.startsWith('http') ? item.img : null);
          const aberto = estaAberto(item.horarioFuncionamento, item.diasFuncionamento);
          return (
            <TouchableOpacity key={item.id} style={sv.card} activeOpacity={0.85}
              onPress={() => navigation.navigate(user ? 'Detalhe' : 'ClienteLogin', { estabelecimentoId: item.id })}>
              <View style={sv.fotoContainer}>
                <FotoVerificada uri={imagemUri} emoji={item.img} size={68} />
                <View style={sv.seloWrap}><SeloVerificado size={18} /></View>
              </View>
              <Text style={sv.nome} numberOfLines={1}>{item.nome}</Text>
              <Text style={sv.tipo} numberOfLines={1}>{item.tipo}</Text>
              <View style={[sv.statusPill, { backgroundColor: aberto ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.1)' }]}>
                <View style={[sv.statusDot, { backgroundColor: aberto ? '#4CAF50' : '#F44336' }]} />
                <Text style={[sv.statusTxt, { color: aberto ? '#4CAF50' : '#F44336' }]}>{aberto ? 'Aberto' : 'Fechado'}</Text>
              </View>
              {item.avaliacao > 0 && (
                <View style={sv.ratingRow}>
                  <Text style={sv.ratingStar}>★</Text>
                  <Text style={sv.ratingVal}>{item.avaliacao.toFixed(1)}</Text>
                </View>
              )}
              {item.plano === 'elite' && (
                <View style={sv.eliteBadge}><Text style={sv.eliteText}>👑 Elite</Text></View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={sv.dots}>
        {verificados.map((_, idx) => (
          <View key={idx} style={[sv.dot, { backgroundColor: idx === autoIdx ? GOLD : '#333' }]} />
        ))}
      </View>
    </View>
  );
}

// COMPONENTE PRINCIPAL
export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth().currentUser);
  const [localizacao, setLocalizacao] = useState<{ lat: number; lng: number } | null>(null);
  const [notificacoesNaoLidas, setNotificacoesNaoLidas] = useState(0);

  // Monitora Notificações
  useEffect(() => {
    if (!user?.uid) { setNotificacoesNaoLidas(0); return; }
    const unsub = firestore().collection('notificacoes')
      .where('clienteId', '==', user.uid).where('lida', '==', false)
      .onSnapshot(snap => setNotificacoesNaoLidas(snap?.size || 0), () => {});
    return () => unsub();
  }, [user?.uid]);

  // Monitora GPS
  useEffect(() => {
    const obterPosicao = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      try {
        // @ts-ignore
        navigator.geolocation?.getCurrentPosition(
          (pos: any) => setLocalizacao({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          null,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } catch {}
    };
    obterPosicao();
  }, []);

  // Monitora Auth
  useEffect(() => { 
    const unsub = auth().onAuthStateChanged(u => setUser(u)); 
    return () => unsub(); 
  }, []);

  // Monitora Firestore (Lista Geral)
  useEffect(() => {
    const unsub = firestore().collection('estabelecimentos').where('ativo', '==', true)
      .onSnapshot(snap => {
        if (!snap) return;
        const dados = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Estabelecimento[];
        setEstabelecimentos(dados);
        setLoading(false);
      }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Filtro Memoizado para performance
  const filtrados = useMemo(() => {
    return estabelecimentos
      .filter(e => {
        const mb = (e.nome || '').toLowerCase().includes(busca.toLowerCase());
        const mt = filtro === 'Todos' || e.tipo === filtro;
        return mb && mt;
      })
      .map(e => {
        const lat = e.coords?.lat ?? e.lat;
        const lng = e.coords?.lng ?? e.lng;
        const dist = localizacao && typeof lat === 'number' && typeof lng === 'number'
          ? calcularDistancia(localizacao.lat, localizacao.lng, lat, lng) : 9999;
        return { 
          ...e, 
          _dist: isNaN(dist) ? 9999 : dist, 
          _aberto: estaAberto((e as any).horarioFuncionamento, (e as any).diasFuncionamento) 
        };
      })
      .sort((a, b) => {
        if (a._aberto && !b._aberto) return -1;
        if (!a._aberto && b._aberto) return 1;
        return a._dist - b._dist;
      });
  }, [estabelecimentos, busca, filtro, localizacao]);

  const renderStars = useCallback((rating: number) => (
    <View style={s.starsRow}>
      {[1, 2, 3, 4, 5].map(star => (
        <Text key={star} style={[s.starIcon, { color: star <= Math.round(rating || 5) ? GOLD : '#444' }]}>★</Text>
      ))}
    </View>
  ), []);

  const renderItem = useCallback(({ item }: { item: any }) => {
    const aberto = item._aberto;
    const dist = item._dist < 9999 ? item._dist : null;
    const imagemUri = item.fotoPerfil || (item.img?.startsWith('http') ? item.img : null);
    const verificado = item.verificado;

    return (
      <TouchableOpacity activeOpacity={0.9}
        onPress={() => navigation.navigate(user ? 'Detalhe' : 'ClienteLogin', { estabelecimentoId: item.id })}>
        <View style={s.card}>
          {dist !== null && (
            <View style={s.distRow}>
              <Icon name="map-marker-outline" size={13} color={GOLD} style={{ marginRight: 4 }} />
              <Text style={s.distBadgeText}>{formatarDistancia(dist)}</Text>
            </View>
          )}

          <View style={s.cardHeaderCircular}>
            <View style={[s.imageContainer, {
              borderColor: verificado ? GOLD : (item.cor || GOLD),
              borderWidth: verificado ? 4 : 2,
            }]}>
              {imagemUri
                ? <Image source={{ uri: imagemUri }} style={s.circleImage} />
                : <Text style={s.cardEmojiLarge}>{item.img || '🏢'}</Text>}
            </View>
          </View>

          <View style={s.cardBodyCentral}>
            <View style={s.nomeIconRow}>
              <Text style={s.cardNome} numberOfLines={1}>{item.nome}</Text>
              {verificado && <SeloVerificado size={18} />}
              <Text style={s.miniIcon}>{TIPO_ICONS[item.tipo] || '✨'}</Text>
            </View>
            <Text style={[s.cardTipo, { color: item.cor || GOLD }]}>{item.tipo}</Text>

            <View style={s.statusRowCentral}>
              <View style={[s.dot, { backgroundColor: aberto ? '#4CAF50' : '#F44336' }]} />
              <Text style={[s.statusText, { color: aberto ? '#4CAF50' : '#F44336' }]}>
                {aberto ? 'Aberto agora' : 'Fechado no momento'}
              </Text>
              {item.horarioFuncionamento && (
                <Text style={s.horarioTexto}> • {item.horarioFuncionamento}</Text>
              )}
            </View>

            {dist !== null && (
              <View style={s.distInfoRow}>
                <Icon name="map-marker-outline" size={13} color="#888" style={{ marginRight: 4 }} />
                <Text style={s.distanciaInfoSub}>A {formatarDistancia(dist)} de você</Text>
              </View>
            )}

            <View style={s.ratingRow}>
              {renderStars(item.avaliacao || 5)}
              <Text style={s.avaliacaoNumero}>({item.avaliacao ? item.avaliacao.toFixed(1) : '5.0'})</Text>
            </View>
          </View>

          <View style={[s.cardBtn, { backgroundColor: item.cor || GOLD }]}>
            <Text style={[s.cardBtnText, { color: '#000' }]}>Agendar Horário →</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [navigation, user, renderStars]);

  if (loading) return <View style={s.loadingWrap}><ActivityIndicator size="large" color={GOLD} /></View>;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerSub}>
              {user ? `Olá, ${user.displayName?.split(' ')[0] || user.email?.split('@')[0]} 👋` : 'Bem-vindo 👋'}
            </Text>
            <Text style={s.headerTitulo}>Encontre seu espaço</Text>
          </View>

          <View style={s.headerAcoes}>
            {user && (
              <TouchableOpacity style={s.notifBtn} onPress={() => navigation.navigate('NotificacoesCliente')}>
                <Icon name="bell-outline" size={24} color={GOLD} />
                {notificacoesNaoLidas > 0 && (
                  <View style={s.notifBadge}>
                    <Text style={s.notifBadgeText}>{notificacoesNaoLidas > 9 ? '9+' : notificacoesNaoLidas}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {user ? (
              <TouchableOpacity style={s.sairBtn} onPress={() => {
                Alert.alert('Sair', 'Deseja sair?', [
                  { text: 'Não', style: 'cancel' },
                  { text: 'Sair', style: 'destructive', onPress: async () => { await auth().signOut(); try { await GoogleSignin.signOut(); } catch {} } },
                ]);
              }}>
                <Text style={s.sairBtnText}>Sair</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.loginBtn} onPress={() => navigation.navigate('ClienteLogin')}>
                <Icon name="account-outline" size={16} color="#000" style={{ marginRight: 6 }} />
                <Text style={s.loginBtnText}>Entrar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={s.buscaWrap}>
          <Icon name="magnify" size={20} color="#666" style={{ marginRight: 8 }} />
          <TextInput
            style={s.buscaInput}
            placeholder="Buscar salão, serviço..."
            placeholderTextColor="#666"
            value={busca}
            onChangeText={setBusca}
          />
        </View>
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={e => e.id}
        renderItem={renderItem}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={10}
        ListHeaderComponent={
          <>
            <View style={s.filtroWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtroScroll}>
                {TIPOS.map(t => (
                  <TouchableOpacity key={t} onPress={() => setFiltro(t)} style={[s.chip, filtro === t && s.chipAtivo]}>
                    <Text style={s.chipIcon}>{TIPO_ICONS[t] || '✦'}</Text>
                    <Text style={[s.chipText, filtro === t && s.chipTextAtivo]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <StoriesHeader />
            <VerificadosSection navigation={navigation} user={user} />
          </>
        }
      />
    </View>
  );
}

// Estilos (Mantidos exatamente como os seus)
const sv = StyleSheet.create({
  container: { marginBottom: 16 },
  tituloRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  titulo: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  subtitulo: { color: '#555', fontSize: 11 },
  scroll: { gap: 12, paddingRight: 4 },
  card: { width: 148, backgroundColor: '#111', borderRadius: 20, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  fotoContainer: { position: 'relative', marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  seloWrap: { position: 'absolute', bottom: -4, right: -4, backgroundColor: '#111', borderRadius: 14, padding: 2, borderWidth: 1.5, borderColor: '#111' },
  nome: { color: '#FFF', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 3 },
  tipo: { color: '#555', fontSize: 10, textAlign: 'center', marginBottom: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginBottom: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 10, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingStar: { color: GOLD, fontSize: 12 },
  ratingVal: { color: GOLD, fontSize: 11, fontWeight: '700' },
  eliteBadge: { backgroundColor: 'rgba(156,39,176,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  eliteText: { color: '#9C27B0', fontSize: 9, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  header: {
    backgroundColor: '#000', paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 52,
    paddingBottom: 20,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerSub: { color: GOLD, fontSize: 12 },
  headerTitulo: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  headerAcoes: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifBtn: { position: 'relative', padding: 5 },
  notifBadge: {
    position: 'absolute', top: 0, right: 0, backgroundColor: '#F44336', borderRadius: 10,
    minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#000', paddingHorizontal: 3,
  },
  notifBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  loginBtn: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  loginBtnText: { color: '#000', fontWeight: '700' },
  sairBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  sairBtnText: { color: GOLD },
  buscaWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 14, paddingHorizontal: 14 },
  buscaInput: { flex: 1, color: '#fff', paddingVertical: 10 },
  filtroWrap: { backgroundColor: '#000', paddingVertical: 12 },
  filtroScroll: { paddingHorizontal: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', marginRight: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: '#1A1A1A' },
  chipAtivo: { backgroundColor: GOLD },
  chipIcon: { marginRight: 6 },
  chipText: { color: '#888' },
  chipTextAtivo: { color: '#000', fontWeight: '700' },
  lista: { paddingHorizontal: 16, paddingBottom: 32 },
  card: { backgroundColor: '#111', borderRadius: 28, marginBottom: 24, borderWidth: 1, borderColor: '#222', paddingBottom: 8 },
  distRow: {
    alignSelf: 'flex-end', marginTop: 12, marginRight: 14,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,169,110,0.4)',
    flexDirection: 'row', alignItems: 'center',
  },
  distBadgeText: { color: GOLD, fontSize: 11, fontWeight: '800' },
  cardHeaderCircular: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  imageContainer: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', borderWidth: 2, overflow: 'hidden' },
  circleImage: { width: '100%', height: '100%' },
  cardEmojiLarge: { fontSize: 45 },
  cardBodyCentral: { paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' },
  nomeIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  cardNome: { fontSize: 20, fontWeight: '800', color: '#FFF', textAlign: 'center', flexShrink: 1 },
  miniIcon: { fontSize: 18 },
  cardTipo: { fontSize: 12, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '600' },
  statusRowCentral: { flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 13, fontWeight: '600' },
  horarioTexto: { fontSize: 12, color: '#666' },
  distInfoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  distanciaInfoSub: { fontSize: 12, color: '#888', fontWeight: '500' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  starsRow: { flexDirection: 'row' },
  starIcon: { fontSize: 16, marginHorizontal: 1 },
  avaliacaoNumero: { color: '#888', fontSize: 13, marginLeft: 8, fontWeight: '700' },
  cardBtn: { marginHorizontal: 24, marginBottom: 20, marginTop: 12, borderRadius: 16, padding: 16, alignItems: 'center' },
  cardBtnText: { fontWeight: '800', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
});