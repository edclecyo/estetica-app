import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, StatusBar, ScrollView,
  Alert, Image, PermissionsAndroid, Platform,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import StoriesHeader from '../components/StoriesHeader';
import type { Estabelecimento } from '../types';

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

function calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 9999;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatarDistancia(km: number): string {
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

function estaAberto(horario?: string): boolean {
  if (!horario || !horario.includes('-')) return false;
  const agora = new Date();
  const atual = agora.getHours() * 60 + agora.getMinutes();
  const [inicio, fim] = horario.split('-');
  const toMin = (h: string) => {
    const [hr, mn] = h.trim().split(':');
    return parseInt(hr) * 60 + (mn ? parseInt(mn) : 0);
  };
  return atual >= toMin(inicio) && atual < toMin(fim);
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth().currentUser);
  const [localizacao, setLocalizacao] = useState<{ lat: number; lng: number } | null>(null);
  const [notificacoesNaoLidas, setNotificacoesNaoLidas] = useState(0);

  // ✅ Listener de notificações não lidas do cliente
  useEffect(() => {
  if (!user?.uid) {
    setNotificacoesNaoLidas(0);
    return;
  }
  const unsub = firestore()
    .collection('notificacoes')
    .where('clienteId', '==', user.uid)
    .where('lida', '==', false)
    .onSnapshot(
      snap => setNotificacoesNaoLidas(snap?.size || 0),
      err => {
        // ✅ Silencioso — índice pode não existir ainda
        console.log('Notif badge erro (pode precisar de índice):', err.code);
        setNotificacoesNaoLidas(0);
      }
    );
  return unsub;
}, [user?.uid]);

  // ✅ GPS
  useEffect(() => {
    const obter = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      try {
        // @ts-ignore
        navigator.geolocation?.getCurrentPosition(
          (pos: any) => setLocalizacao({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err: any) => console.log('GPS erro:', err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
      } catch {}
    };
    obter();
  }, []);

  // ✅ Auth state
  useEffect(() => {
    const unsub = auth().onAuthStateChanged(u => setUser(u));
    return unsub;
  }, []);

  // ✅ Estabelecimentos ativos
  useEffect(() => {
    const unsub = firestore()
      .collection('estabelecimentos')
      .where('ativo', '==', true)
      .onSnapshot(snap => {
        setEstabelecimentos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Estabelecimento[]);
        setLoading(false);
      });
    return unsub;
  }, []);

  const filtrados = estabelecimentos
    .filter(e => {
      const mb = e.nome?.toLowerCase().includes(busca.toLowerCase());
      const mt = filtro === 'Todos' || e.tipo === filtro;
      return mb && mt;
    })
    .map(e => {
      const lat = e.coords?.lat ?? e.lat;
      const lng = e.coords?.lng ?? e.lng;
      const dist = localizacao && lat && lng
        ? calcularDistancia(localizacao.lat, localizacao.lng, lat, lng)
        : 9999;
      return { ...e, _dist: dist, _aberto: estaAberto(e.horarioFuncionamento) };
    })
    .sort((a, b) => {
      if (a._aberto && !b._aberto) return -1;
      if (!a._aberto && b._aberto) return 1;
      return a._dist - b._dist;
    });

  const renderStars = (rating: number) => (
    <View style={s.starsRow}>
      {[1, 2, 3, 4, 5].map(star => (
        <Text key={star} style={[s.starIcon, { color: star <= Math.round(rating || 5) ? '#C9A96E' : '#444' }]}>★</Text>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerSub}>
              {user
                ? `Olá, ${user.displayName?.split(' ')[0] || user.email?.split('@')[0]} 👋`
                : 'Bem-vindo 👋'}
            </Text>
            <Text style={s.headerTitulo}>Encontre seu espaço</Text>
          </View>

          <View style={s.headerAcoes}>
            {/* ✅ Sininho — só aparece se logado */}
            {user && (
              <TouchableOpacity
                style={s.notifBtn}
                onPress={() => navigation.navigate('NotificacoesCliente')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={s.notifIcon}>🔔</Text>
                {/* ✅ Badge só aparece se tiver notificações não lidas */}
                {notificacoesNaoLidas > 0 && (
                  <View style={s.notifBadge}>
                    <Text style={s.notifBadgeText}>
                      {notificacoesNaoLidas > 9 ? '9+' : notificacoesNaoLidas}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {user ? (
              <TouchableOpacity
                style={s.sairBtn}
                onPress={() => {
                  Alert.alert('Sair', 'Deseja sair da sua conta?', [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Sair', style: 'destructive',
                      onPress: async () => {
                        await auth().signOut();
                        try { await GoogleSignin.signOut(); } catch {}
                      },
                    },
                  ]);
                }}
              >
                <Text style={s.sairBtnText}>Sair</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.loginBtn} onPress={() => navigation.navigate('ClienteLogin')}>
                <Text style={s.loginBtnText}>👤 Entrar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={s.buscaWrap}>
          <Text style={s.buscaIcon}>🔍</Text>
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
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={s.filtroWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtroScroll}>
                {TIPOS.map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setFiltro(t)}
                    style={[s.chip, filtro === t && s.chipAtivo]}
                  >
                    <Text style={s.chipIcon}>{TIPO_ICONS[t] || '✦'}</Text>
                    <Text style={[s.chipText, filtro === t && s.chipTextAtivo]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <StoriesHeader />
          </>
        }
        renderItem={({ item }) => {
          const aberto = item._aberto;
          const dist = item._dist < 9999 ? item._dist : null;
          const imagemUri = item.fotoPerfil || (item.img?.startsWith('http') ? item.img : null);

          return (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.9}
              onPress={() =>
                navigation.navigate(user ? 'Detalhe' : 'ClienteLogin', { estabelecimentoId: item.id })
              }
            >
              {dist !== null && (
                <View style={s.distBadge}>
                  <Text style={s.distBadgeText}>📍 {formatarDistancia(dist)}</Text>
                </View>
              )}

              <View style={s.cardHeaderCircular}>
                <View style={[s.imageContainer, { borderColor: item.cor || '#C9A96E' }]}>
                  {imagemUri
                    ? <Image source={{ uri: imagemUri }} style={s.circleImage} />
                    : <Text style={s.cardEmojiLarge}>{item.img || '🏢'}</Text>
                  }
                </View>
              </View>

              <View style={s.cardBodyCentral}>
                <View style={s.nomeIconRow}>
                  <Text style={s.cardNome}>{item.nome}</Text>
                  <Text style={s.miniIcon}>{TIPO_ICONS[item.tipo] || '✨'}</Text>
                </View>
                <Text style={[s.cardTipo, { color: item.cor || '#C9A96E' }]}>{item.tipo}</Text>
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
                  <Text style={s.distanciaInfoSub}>A {formatarDistancia(dist)} de você</Text>
                )}
                <View style={s.ratingRow}>
                  {renderStars(item.avaliacao || 5)}
                  <Text style={s.avaliacaoNumero}>({item.avaliacao ? item.avaliacao.toFixed(1) : '5.0'})</Text>
                </View>
              </View>

              <View style={[s.cardBtn, { backgroundColor: item.cor || '#C9A96E' }]}>
                <Text style={[s.cardBtnText, { color: '#000' }]}>Agendar Horário →</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },

  // ✅ paddingTop correto para Android e iOS
  header: {
    backgroundColor: '#000',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 52,
    paddingBottom: 20,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerSub: { color: '#C9A96E', fontSize: 12 },
  headerTitulo: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  headerAcoes: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  notifBtn: { position: 'relative', padding: 5 },
  notifIcon: { fontSize: 22 },
  notifBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#F44336', borderRadius: 10,
    minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#000',
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },

  loginBtn: { backgroundColor: '#C9A96E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  loginBtnText: { color: '#000', fontWeight: '700' },
  sairBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  sairBtnText: { color: '#C9A96E' },

  buscaWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 14, paddingHorizontal: 14 },
  buscaInput: { flex: 1, color: '#fff', paddingVertical: 10 },
  buscaIcon: { marginRight: 8 },

  filtroWrap: { backgroundColor: '#000', paddingVertical: 12 },
  filtroScroll: { paddingHorizontal: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', marginRight: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: '#1A1A1A' },
  chipAtivo: { backgroundColor: '#C9A96E' },
  chipIcon: { marginRight: 6 },
  chipText: { color: '#888' },
  chipTextAtivo: { color: '#000', fontWeight: '700' },

  lista: { paddingHorizontal: 16, paddingBottom: 32 },
  card: { backgroundColor: '#111', borderRadius: 28, marginBottom: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#222', paddingBottom: 8, position: 'relative' },
  distBadge: { position: 'absolute', top: 14, right: 14, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,169,110,0.4)' },
  distBadgeText: { color: '#C9A96E', fontSize: 11, fontWeight: '800' },
  cardHeaderCircular: { alignItems: 'center', paddingTop: 24, paddingBottom: 8 },
  imageContainer: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', borderWidth: 2, overflow: 'hidden' },
  circleImage: { width: '100%', height: '100%' },
  cardEmojiLarge: { fontSize: 45 },
  cardBodyCentral: { padding: 16, alignItems: 'center' },
  nomeIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  cardNome: { fontSize: 22, fontWeight: '800', color: '#FFF', textAlign: 'center' },
  miniIcon: { fontSize: 18, marginLeft: 10 },
  cardTipo: { fontSize: 12, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '600' },
  statusRowCentral: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 13, fontWeight: '600' },
  horarioTexto: { fontSize: 13, color: '#666' },
  distanciaInfoSub: { fontSize: 12, color: '#888', marginTop: 6, fontWeight: '500' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  starsRow: { flexDirection: 'row' },
  starIcon: { fontSize: 16, marginHorizontal: 1 },
  avaliacaoNumero: { color: '#888', fontSize: 13, marginLeft: 8, fontWeight: '700' },
  cardBtn: { marginHorizontal: 24, marginBottom: 20, marginTop: 12, borderRadius: 16, padding: 16, alignItems: 'center' },
  cardBtnText: { fontWeight: '800', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
});