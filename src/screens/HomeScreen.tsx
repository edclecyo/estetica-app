import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
} from 'react-native';

import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import type { Estabelecimento } from '../types';

const TIPOS = [
  'Todos', 'Salão de Beleza', 'Barbearia Premium', 'Espaço de Unhas', 'Manicure & Pedicure',
  'Clínica de Estética', 'Estética Avançada', 'Spa & Relaxamento', 'Especialista em Cabelos',
  'Terapia Capilar', 'Estúdio de Maquiagem', 'Design de Sobrancelhas', 'Extensão de Cílios',
  'Micropigmentação', 'Depilação a Laser', 'Depilação com Cera', 'Estúdio de Tatuagem',
  'Body Piercing', 'Massoterapia', 'Bronzeamento Artificial', 'Podologia',
  'Harmonização Facial', 'Estúdio de Yoga', 'Centro Holístico'
];

const TIPO_ICONS: Record<string, string> = {
  'Todos': '✦',
  'Salão de Beleza': '✂️',
  'Barbearia Premium': '💈',
  'Espaço de Unhas': '💅',
  'Manicure & Pedicure': '🎨',
  'Clínica de Estética': '🏥',
  'Estética Avançada': '🧬',
  'Spa & Relaxamento': '🧖‍♀️',
  'Especialista em Cabelos': '💇‍♀️',
  'Terapia Capilar': '🧴',
  'Estúdio de Maquiagem': '💄',
  'Design de Sobrancelhas': '📐',
  'Extensão de Cílios': '👁️',
  'Micropigmentação': '✒️',
  'Depilação a Laser': '⚡',
  'Depilação com Cera': '🍯',
  'Estúdio de Tatuagem': '🎨',
  'Body Piercing': '💎',
  'Massoterapia': '💆‍♂️',
  'Bronzeamento Artificial': '☀️',
  'Podologia': '👣',
  'Harmonização Facial': '✨',
  'Estúdio de Yoga': '🧘',
  'Centro Holístico': '🌿',
};

function calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 9999;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
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
  const [stories, setStories] = useState<any[]>([]);

  // Pede permissão e obtém localização com retry
  useEffect(() => {
    const obter = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      try {
        navigator.geolocation?.getCurrentPosition(
          (pos) => {
            setLocalizacao({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          (err) => {
            console.log('GPS erro:', err);
            // Tenta novamente com menor precisão se falhar
            navigator.geolocation?.getCurrentPosition(
              (pos) => setLocalizacao({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => {},
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
            );
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
      } catch { }
    };
    obter();
  }, []);

  useEffect(() => {
    const unsub = firestore()
      .collection('stories')
      .where('ativo', '==', true)
      .limit(20)
      .onSnapshot((snapshot) => {
        if (!snapshot) return;
        setStories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = auth().onAuthStateChanged((u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = firestore()
      .collection('estabelecimentos')
      .where('ativo', '==', true)
      .onSnapshot((snap) => {
        const lista = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Estabelecimento[];
        setEstabelecimentos(lista);
        setLoading(false);
      });
    return unsub;
  }, []);

  // ✅ Ordenação: 1º abertos, 2º por distância (dentro de cada grupo)
  const filtrados = estabelecimentos
    .filter((e) => {
      const mb = e.nome?.toLowerCase().includes(busca.toLowerCase());
      const mt = filtro === 'Todos' || e.tipo === filtro;
      return mb && mt;
    })
    .map((e) => {
      const lat = e.coords?.lat ?? e.lat;
      const lng = e.coords?.lng ?? e.lng;
      const dist = localizacao && lat && lng
        ? calcularDistancia(localizacao.lat, localizacao.lng, lat, lng)
        : 9999;
      return { ...e, _dist: dist, _aberto: estaAberto(e.horarioFuncionamento) };
    })
    .sort((a, b) => {
      // Prioridade 1: abertos antes de fechados
      if (a._aberto && !b._aberto) return -1;
      if (!a._aberto && b._aberto) return 1;
      // Prioridade 2: mais próximo primeiro (dentro do mesmo grupo aberto/fechado)
      return a._dist - b._dist;
    });

  if (loading) {
    return (
      <View style={[s.loadingWrap, { backgroundColor: '#000' }]}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.headerSub}>
              {user
                ? `Olá, ${user.displayName?.split(' ')[0] || user.email?.split('@')[0]} 👋`
                : 'Bem-vindo 👋'}
            </Text>
            <Text style={s.headerTitulo}>Encontre seu espaço</Text>
          </View>

          {user ? (
            <TouchableOpacity
              style={s.sairBtn}
              onPress={() => {
                Alert.alert('Sair', 'Deseja sair da sua conta?', [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Sair',
                    style: 'destructive',
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

      <View style={s.filtroWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtroScroll}>
          {TIPOS.map((t) => (
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

      <View style={s.storiesArea}>
        <FlatList
          horizontal
          data={stories}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={s.story}
              onPress={() => navigation.navigate('StoryView', { stories, startIndex: index })}
            >
              <View style={[s.storyBorder, { borderColor: '#C9A96E' }]}>
                <View style={s.storyAvatar}>
                  {item.imagem ? (
                    <Image source={{ uri: item.imagem }} style={{ width: 60, height: 60, borderRadius: 30 }} />
                  ) : (
                    <Text style={s.storyEmoji}>🏪</Text>
                  )}
                </View>
              </View>
              <Text numberOfLines={1} style={s.storyName}>{item.nome}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={(e) => e.id}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
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
              {/* ✅ Badge de distância no canto superior direito do card */}
              {dist !== null && (
                <View style={s.distBadge}>
                  <Text style={s.distBadgeText}>📍 {formatarDistancia(dist)}</Text>
                </View>
              )}

              <View style={s.cardHeaderCircular}>
                <View style={[s.imageContainer, { borderColor: item.cor || '#C9A96E' }]}>
                  {imagemUri ? (
                    <Image source={{ uri: imagemUri }} style={s.circleImage} />
                  ) : (
                    <Text style={s.cardEmojiLarge}>{item.img || '🏢'}</Text>
                  )}
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

                {/* ✅ Linha de distância abaixo do status */}
                {dist !== null && (
                  <Text style={s.distanciaInfoSub}>A {formatarDistancia(dist)} de você</Text>
                )}

                <View style={s.starsRow}>
                  <Text style={s.starsText}>⭐⭐⭐⭐⭐</Text>
                  <Text style={s.avaliacaoNumero}>({item.avaliacao || '5.0'})</Text>
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
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#000', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  headerSub: { color: '#C9A96E', fontSize: 12 },
  headerTitulo: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  loginBtn: { backgroundColor: '#C9A96E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  loginBtnText: { color: '#000', fontWeight: '700' },
  sairBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  sairBtnText: { color: '#C9A96E' },
  buscaWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 14, paddingHorizontal: 14 },
  buscaInput: { flex: 1, color: '#fff', paddingVertical: 10 },
  buscaIcon: { marginRight: 8 },
  filtroWrap: { backgroundColor: '#000', paddingBottom: 16 },
  filtroScroll: { paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', marginRight: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: '#1A1A1A' },
  chipAtivo: { backgroundColor: '#C9A96E' },
  chipIcon: { marginRight: 6 },
  chipText: { color: '#888' },
  chipTextAtivo: { color: '#000', fontWeight: '700' },
  lista: { padding: 16 },

  // ✅ Card com position relative para o badge absoluto funcionar
  card: {
    backgroundColor: '#111',
    borderRadius: 28,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
    paddingBottom: 8,
    position: 'relative',
  },

  // ✅ Badge de distância no canto superior direito
  distBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.4)',
  },
  distBadgeText: {
    color: '#C9A96E',
    fontSize: 11,
    fontWeight: '800',
  },

  cardHeaderCircular: { alignItems: 'center', paddingTop: 24, paddingBottom: 8 },
  imageContainer: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', borderWidth: 2, overflow: 'hidden', elevation: 5, shadowColor: '#C9A96E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5 },
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
  starsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  starsText: { fontSize: 15, letterSpacing: 3 },
  avaliacaoNumero: { color: '#888', fontSize: 13, marginLeft: 8, fontWeight: '700' },
  cardBtn: { marginHorizontal: 24, marginBottom: 20, marginTop: 12, borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#C9A96E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
  cardBtnText: { fontWeight: '800', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
  storiesArea: { paddingVertical: 12, paddingLeft: 12, backgroundColor: '#000' },
  story: { alignItems: 'center', marginRight: 14, width: 72 },
  storyBorder: { width: 68, height: 68, borderRadius: 34, padding: 3, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  storyAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  storyEmoji: { fontSize: 28 },
  storyName: { fontSize: 11, marginTop: 4, textAlign: 'center', color: '#888' },
});