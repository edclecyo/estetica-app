import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, Alert, StatusBar,
  Dimensions, TextInput, ScrollView, FlatList,
  Animated, KeyboardAvoidingView, Platform
} from "react-native";
import { launchImageLibrary, launchCamera } from "react-native-image-picker";
import storage from "@react-native-firebase/storage";
import firestore from "@react-native-firebase/firestore";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useAuth } from "../contexts/AuthContext";
import Video from 'react-native-video';
import RNFS from 'react-native-fs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
const { width } = Dimensions.get("window");
import auth from '@react-native-firebase/auth';
type MediaItem = {
  uri: string;
  type: 'image' | 'video';
  caption: string;
  duration?: number;
  file?: any;
  fileSize?: number;
};

const normalizarPlano = (plano?: string) =>
  String(plano || 'free').toLowerCase().trim();

const normalizarDuracaoSegundos = (duration?: number) => {
  const valor = Number(duration || 0);
  return valor > 1000 ? valor / 1000 : valor;
};

const limiteMidiasPorPlano = (plano: string) => {
  if (plano === 'trial' || plano === 'essencial') return 5;
  if (plano === 'pro' || plano === 'elite') return 10;
  return 0;
};

const DICAS = [
  "📸 Mostre seus trabalhos mais recentes",
  "🎨 Antes e depois transformam seguidores em clientes",
  "💬 Promoções exclusivas geram urgência",
  "⏰ Stories somem em 24h — crie senso de oportunidade",
  "✨ Qualidade visual atrai clientes premium",
];

export default function PostarStory() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { admin } = useAuth();

  const [estabId, setEstabId] = useState(route.params?.estabelecimentoId || "");
  const [midias, setMidias] = useState<MediaItem[]>([]);
  const [indexAtivo, setIndexAtivo] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dicaIdx] = useState(Math.floor(Math.random() * DICAS.length));
  const [planoStory, setPlanoStory] = useState(normalizarPlano(admin?.plano as any));

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (!estabId && admin?.id) {
      firestore().collection('estabelecimentos')
        .where('adminId', '==', admin.id).limit(1).get()
        .then(snap => { if (!snap.empty) setEstabId(snap.docs[0].id); })
        .catch(console.error);
    }
  }, [admin?.id]);

  useEffect(() => {
    if (!estabId) {
      setPlanoStory(normalizarPlano(admin?.plano as any));
      return;
    }

    firestore().collection('estabelecimentos').doc(estabId).get()
      .then(snap => {
        const data = snap.data() as any;
        setPlanoStory(normalizarPlano(
          data?.planoAprovado ||
            data?.plano ||
            admin?.plano
        ));
      })
      .catch(console.error);
  }, [admin?.plano, estabId]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: uploadProgress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [uploadProgress]);
  
const planoAtual = normalizarPlano(planoStory || (admin?.plano as any));
const permiteVideo =
  planoAtual === 'pro' ||
  planoAtual === 'elite';
const limiteMidias = limiteMidiasPorPlano(planoAtual);
const limiteVideoSegundos =
  planoAtual === 'pro'
    ? 15
    : planoAtual === 'elite'
    ? 30
    : 0;
const textoPlanoStory =
  planoAtual === 'essencial'
    ? 'Essencial: ate 5 fotos por postagem'
    : planoAtual === 'trial'
    ? 'Teste Essencial: ate 5 fotos'
    : planoAtual === 'pro'
    ? 'Pro: fotos e videos ate 15 segundos'
    : planoAtual === 'elite'
    ? 'Elite: fotos e videos ate 30 segundos'
    : 'Ative um plano para publicar';

  const adicionarMidias = (novas: MediaItem[]) => {
    if (!limiteMidias) {
      Alert.alert('Plano necessario', 'Ative um plano para publicar stories.');
      return;
    }

    const videos = novas.filter(m => m.type === 'video');

    if (videos.length && !permiteVideo) {
      Alert.alert(
        'Video indisponivel',
        'Seu plano atual permite publicar fotos. Para postar videos, use Pro ou Elite.'
      );
      return;
    }

    const videoLongo = videos.find(m =>
      normalizarDuracaoSegundos(m.duration) > limiteVideoSegundos
    );

    if (videoLongo) {
      Alert.alert(
        'Video muito longo',
        `Publique videos com ate ${limiteVideoSegundos} segundos.`
      );
      return;
    }

    setMidias(prev => {
      const total = [...prev, ...novas].slice(0, limiteMidias);

      if (prev.length + novas.length > limiteMidias) {
        Alert.alert(
          'Limite do plano',
          `Seu plano permite ate ${limiteMidias} midia(s) por postagem.`
        );
      }

      return total;
    });

    if (midias.length === 0) setIndexAtivo(0);
  };
  
  const abrirCameraModo = async (mediaType: 'photo' | 'video') => {
    const cameraOptions: any = {
      mediaType,
      quality: 0.85 as any,
      videoQuality: 'high',
      saveToPhotos: true,
    };

    if (mediaType === 'video') {
      cameraOptions.durationLimit = limiteVideoSegundos;
    }

    const res = await launchCamera(cameraOptions);

    if (res.assets && res.assets.length > 0) {
      const nova: MediaItem = {
  uri: res.assets[0].uri || '',

  type:
    res.assets[0].type?.includes('video')
      ? 'video'
      : 'image',

  caption: '',

  // ✅ duração real
  duration:
    res.assets[0].duration || 0,
  file:
    (res.assets[0] as any).file,
  fileSize:
    res.assets[0].fileSize || 0,
};
      adicionarMidias([nova]);
    }
  };

  const abrirCamera = async () => {
    if (!permiteVideo) {
      await abrirCameraModo('photo');
      return;
    }

    Alert.alert(
      'Camera',
      'Escolha o tipo de story que deseja criar.',
      [
        {
          text: 'Tirar foto',
          onPress: () => abrirCameraModo('photo'),
        },
        {
          text: 'Gravar video',
          onPress: () => abrirCameraModo('video'),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const escolherMidias = async () => {
    if (!limiteMidias) {
      Alert.alert('Plano necessario', 'Ative um plano para publicar stories.');
      return;
    }

    const res = await launchImageLibrary({
      mediaType: permiteVideo ? 'mixed' : 'photo',
      quality: 0.85 as any,
      videoQuality: 'high',
      selectionLimit: Math.max(1, limiteMidias - midias.length),
    });
    if (res.assets && res.assets.length > 0) {
      const novas: MediaItem[] = res.assets.map(a => ({
  uri: a.uri || '',

  type:
    a.type?.includes('video')
      ? 'video'
      : 'image',

  caption: '',

  // ✅ duração real
  duration:
    a.duration || 0,
  file:
    (a as any).file,
  fileSize:
    a.fileSize || 0,
}));
      adicionarMidias(novas);
    }
  };

  const removerMidia = (idx: number) => {
    setMidias(prev => prev.filter((_, i) => i !== idx));
    setIndexAtivo(i => Math.max(0, idx <= i ? i - 1 : i));
  };

  const atualizarLegenda = (texto: string) => {
    setMidias(prev => prev.map((m, i) => i === indexAtivo ? { ...m, caption: texto } : m));
  };

  const postar = async () => {
    if (midias.length === 0) { Alert.alert("Atenção", "Adicione pelo menos uma mídia."); return; }
    if (!admin) { Alert.alert("Erro", "Faça login novamente."); return; }

    setUploading(true);
    try {
      const nome = admin.nome || "Empresa";
const avatar = admin.fotoPerfil || "";
const adminId = admin.id;

if (!estabId) {
  Alert.alert(
    'Estabelecimento não encontrado',
    'Selecione um estabelecimento.'
  );
  return;
}

const estId = estabId;
const totalFotos = midias.filter(m => m.type === 'image').length;
const totalVideos = midias.filter(m => m.type === 'video').length;
const quantidade = midias.length;

if (limiteMidias && quantidade > limiteMidias) {
  throw new Error(`Seu plano permite ate ${limiteMidias} midia(s) por postagem.`);
}

if (totalVideos > 0 && !permiteVideo) {
  throw new Error('Seu plano atual permite publicar fotos. Para postar videos, use Pro ou Elite.');
}

      for (let i = 0; i < midias.length; i++) {
        const m = midias[i];
        setUploadProgress(Math.round(((i + 0.5) / midias.length) * 95));
// 🔒 VALIDA PLANO

const user = auth().currentUser;

console.log('AUTH UID:', user?.uid);
console.log('ADMIN ID:', adminId);
console.log('ESTAB ID:', estId);

if (!user) {
  Alert.alert(
    'Sessão expirada',
    'Faça login novamente.'
  );
  return;
}

if (user.uid !== adminId) {
  Alert.alert(
    'Conta diferente',
    'Saia e entre novamente na conta admin correta.'
  );
  return;
}

const token = await user.getIdToken(true);

console.log('TOKEN OK:', !!token);

// tamanho arquivo MB
let sizeMB =
  Number(m.fileSize || 0) /
  1024 /
  1024;

if (!sizeMB) try {
  const stat = await RNFS.stat(m.uri);

  sizeMB =
    Number(stat.size || 0) /
    1024 /
    1024;

} catch (e) {
  console.log('ERRO SIZE:', e);
}

// duração vídeo
const duration =
  normalizarDuracaoSegundos(m.duration);

if (m.type === 'video' && duration > limiteVideoSegundos) {
  throw new Error(`Publique videos com ate ${limiteVideoSegundos} segundos.`);
}

const validacao = await fetch(
  'https://southamerica-east1-agenda-beleza-75106.cloudfunctions.net/validarPostagemStoryHttp',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      estabelecimentoId: estId,
      type: m.type,
      duration,
      sizeMB,
      totalFotos,
      totalVideos,
      quantidade,
    }),
  }
);

const validacaoData = await validacao.json().catch(() => null);

if (!validacao.ok) {
  throw new Error(
    validacaoData?.message ||
    'Nao foi possivel validar este story.'
  );
}
const ext = m.type === 'video' ? 'mp4' : 'jpg';

const filename =
  `stories/${adminId}_${Date.now()}_${i}.${ext}`;

const ref = storage().ref(filename);

const uploadUri = m.uri.startsWith('file://')
  ? m.uri.replace('file://', '')
  : m.uri;

(await (ref as any).putFile(
  Platform.OS === 'web' && m.file
    ? { file: m.file }
    : uploadUri,
  {
    contentType:
      m.type === 'video'
        ? 'video/mp4'
        : 'image/jpeg',
  }
));
        const url = await ref.getDownloadURL();

       await firestore().collection('stories').add({
  adminId,
  estabelecimentoId: estId,

  nomeAdmin: nome,
  nome,
  avatar,

  url,
  imagem: url,

  storagePath: filename,

  type: m.type,
  caption: m.caption || '',
  duration,
  sizeMB,

  likesCount: 0,
  visualizacoes: 0,
  compartilhamentos: 0,

  visto: false,

  ativo: true,
  apagado: false,

  timestamp: firestore.Timestamp.now(),

  criadoEm:
    firestore.FieldValue.serverTimestamp(),

  expiraEm:
    firestore.Timestamp.fromMillis(
      Date.now() + 86400000
    ),

  deletarEm:
    firestore.Timestamp.fromMillis(
      Date.now() + 86400000
    ),

  createdAt: Date.now(),

  expiresAt:
    Date.now() + 86400000,
});
      }

      setUploadProgress(100);
      await new Promise<void>(resolve => setTimeout(() => resolve(), 400));
      Alert.alert("Publicado! 🎉", `${midias.length} story${midias.length > 1 ? 's' : ''} no ar!`);
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert(
  "Não foi possível publicar",
  (e as any)?.message ||
  "Verifique seu plano."
);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const midiaAtiva = midias[indexAtivo];

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* HEADER */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={s.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={s.backIcon}>✕</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Novo Story</Text>
            {midias.length > 0 && (
              <Text style={s.headerSub}>{midias.length}/{limiteMidias || 0} mídias</Text>
            )}
          </View>
          {midias.length > 0 ? (
            <TouchableOpacity style={s.postBtnHeader} onPress={postar} disabled={uploading}>
              {uploading
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={s.postBtnHeaderText}>Publicar</Text>
              }
            </TouchableOpacity>
          ) : <View style={{ width: 80 }} />}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* BANNER EDUCATIVO */}
          {midias.length === 0 && (
            <Animated.View style={[s.banner, { opacity: fadeAnim }]}>
              <View style={s.bannerIcon}>
                <Icon name="star-four-points-outline" size={30} color="#C9A96E" />
              </View>
              <Text style={s.bannerTitulo}>Stories que vendem</Text>
              <Text style={s.bannerDesc}>
        <Text style={s.planoInfo}>{textoPlanoStory}</Text>
			  <Text style={[s.planoInfo, { display: 'none' }]}>
  {admin?.plano === 'essencial'
    ? 'Seu plano permite apenas fotos'
    : admin?.plano === 'trial'
    ? 'Teste Essencial: apenas fotos'
    : admin?.plano === 'pro'
    ? 'Vídeos até 15 segundos'
    : admin?.plano === 'elite'
    ? 'Vídeos até 30 segundos'
    : 'Ative um plano para publicar'}
</Text>
                Publique fotos e vídeos visíveis para todos os clientes por 24 horas.
                Use para mostrar promoções, resultados e novidades do seu espaço.
              </Text>
              <View style={s.bannerDica}>
                <Text style={s.bannerDicaText}>{DICAS[dicaIdx]}</Text>
              </View>
              <View style={s.featuresRow}>
                {[
                  { icon: 'image-multiple-outline', label: `Até ${limiteMidias || 0}\nmídias` },
                  { icon: 'text-box-edit-outline', label: 'Texto\npersonalizado' },
                  { icon: 'clock-outline', label: '24h\nvisível' },
                  { icon: 'chart-line', label: 'Ver\natividade' },
                ].map((f, i) => (
                  <View key={i} style={s.featureItem}>
                    <Icon name={f.icon} size={22} color="#C9A96E" style={s.featureIcon} />
                    <Text style={s.featureLabel}>{f.label}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* PREVIEW PRINCIPAL */}
          <TouchableOpacity
            style={s.preview}
            onPress={midiaAtiva ? undefined : escolherMidias}
            activeOpacity={midiaAtiva ? 1 : 0.85}
          >
            {midiaAtiva ? (
              <>
                {midiaAtiva.type === 'video'
                  ? <Video source={{ uri: midiaAtiva.uri }} style={s.previewMedia} resizeMode="cover" paused={false} repeat muted />
                  : <Image source={{ uri: midiaAtiva.uri }} style={s.previewMedia} />
                }
                {midiaAtiva.caption ? (
                  <View style={s.captionOverlay}>
                    <Text style={s.captionOverlayText}>{midiaAtiva.caption}</Text>
                  </View>
                ) : null}
                <View style={s.typeBadge}>
                  <View style={s.typeBadgeRow}>
                    <Icon name={midiaAtiva.type === 'video' ? 'video-outline' : 'camera-outline'} size={14} color="#FFF" />
                    <Text style={s.typeBadgeText}>{midiaAtiva.type === 'video' ? 'Vídeo' : 'Foto'}</Text>
                  </View>
                </View>
                {midias.length > 1 && (
                  <View style={s.counterBadge}>
                    <Text style={s.counterText}>{indexAtivo + 1}/{midias.length}</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={s.emptyPreview}>
                <View style={s.emptyIconWrap}>
                  <Icon name="cellphone-plus" size={44} color="#C9A96E" />
                </View>
                <Text style={s.emptyTitle}>Adicionar mídia</Text>
                <Text style={s.emptySub}>Fotos e vídeos da galeria</Text>
                
                {/* BOTÕES DE AÇÃO */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                  <TouchableOpacity style={s.emptyBtn} onPress={escolherMidias}>
                    <Text style={s.emptyBtnText}>+ Galeria</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.emptyBtn, { backgroundColor: '#FFF' }]} onPress={abrirCamera}>
                    <View style={s.emptyBtnRow}>
                      <Icon name="camera-outline" size={16} color="#000" />
                      <Text style={[s.emptyBtnText, { color: '#000' }]}>Câmera</Text>
                    </View>
                  </TouchableOpacity>
                </View>

              </View>
            )}
          </TouchableOpacity>

          {/* LEGENDA */}
          {midiaAtiva && (
            <View style={s.captionWrap}>
              <Text style={s.captionLabel}>LEGENDA (opcional)</Text>
              <TextInput
                style={s.captionInput}
                placeholder="Ex: Promoção especial hoje! Agende agora 🔥"
                placeholderTextColor="#444"
                value={midiaAtiva.caption}
                onChangeText={atualizarLegenda}
                multiline
                maxLength={120}
              />
              <Text style={s.captionCount}>{midiaAtiva.caption.length}/120</Text>
            </View>
          )}

          {/* THUMBNAILS */}
          {midias.length > 0 && (
            <FlatList
              data={[...midias, ...(midias.length < limiteMidias ? [{ uri: '__add__', type: 'image' as const, caption: '' }] : [])]}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => i.toString()}
              contentContainerStyle={s.thumbList}
              style={{ marginTop: 16 }}
              renderItem={({ item, index }) => {
                if (item.uri === '__add__') {
                  return (
                    <TouchableOpacity style={s.thumbAdd} onPress={escolherMidias}>
                      <Text style={s.thumbAddIcon}>+</Text>
                      <Text style={s.thumbAddText}>Mais</Text>
                    </TouchableOpacity>
                  );
                }
                const ativo = index === indexAtivo;
                return (
                  <TouchableOpacity onPress={() => setIndexAtivo(index)} style={[s.thumb, ativo && s.thumbAtivo]}>
                    <Image source={{ uri: item.uri }} style={s.thumbImg} />
                    {item.type === 'video' && (
                      <View style={s.thumbVideoBadge}><Text style={{ fontSize: 9, color: '#FFF' }}>▶</Text></View>
                    )}
                    {item.caption ? <View style={s.thumbCaptionDot} /> : null}
                    <TouchableOpacity style={s.thumbRemove} onPress={() => removerMidia(index)}>
                      <Text style={s.thumbRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* DICA */}
          {midias.length > 0 && (
            <View style={s.dicasWrap}>
              <Text style={s.dicasTitle}>💡 Dica</Text>
              <Text style={s.dicasText}>{DICAS[dicaIdx]}</Text>
            </View>
          )}

          {/* PROGRESS */}
          {uploading && (
            <View style={s.progressWrap}>
              <View style={s.progressTrack}>
                <Animated.View style={[s.progressBar, {
                  width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] })
                }]} />
              </View>
              <Text style={s.progressText}>Publicando... {uploadProgress}%</Text>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* BOTÃO FIXO */}
        {midias.length > 0 && !uploading && (
          <View style={s.fixedFooter}>
            <TouchableOpacity style={s.publishBtn} onPress={postar}>
              <Text style={s.publishBtnText}>
                Publicar {midias.length} story{midias.length > 1 ? 's' : ''} →
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </KeyboardAvoidingView>
    </View>
  );
}

const GOLD = '#C9A96E';
const GREEN = '#4CAF50';

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  planoInfo: {
  color: GOLD,
  fontSize: 13,
  fontWeight: '700',
  textAlign: 'center',
  marginTop: 10,
},
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { color: GOLD, fontSize: 11, fontWeight: '600', marginTop: 2 },
  postBtnHeader: { backgroundColor: GOLD, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  postBtnHeaderText: { color: '#000', fontWeight: '800', fontSize: 13 },
  banner: { margin: 16, backgroundColor: '#111', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#222' },
  bannerIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(201,169,110,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 14, alignSelf: 'center' },
  bannerTitulo: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  bannerDesc: { color: '#888', fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 16 },
  bannerDica: { backgroundColor: 'rgba(201,169,110,0.08)', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(201,169,110,0.2)' },
  bannerDicaText: { color: GOLD, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  featuresRow: { flexDirection: 'row', justifyContent: 'space-around' },
  featureItem: { alignItems: 'center', gap: 6 },
  featureIcon: { marginBottom: 3 },
  featureLabel: { color: '#666', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  preview: { marginHorizontal: 16, height: width * 1.55, borderRadius: 20, overflow: 'hidden', backgroundColor: '#111', marginTop: 8 },
  previewMedia: { width: '100%', height: '100%' },
  captionOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(0,0,0,0.55)' },
  captionOverlayText: { color: '#FFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  typeBadge: { position: 'absolute', top: 14, left: 14, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  typeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  counterBadge: { position: 'absolute', top: 14, right: 14, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  counterText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  emptyPreview: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#2A2A2A', borderStyle: 'dashed', borderRadius: 20 },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptySub: { color: '#555', fontSize: 14, marginBottom: 20 },
  emptyBtn: { backgroundColor: GOLD, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16 },
  emptyBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
  captionWrap: { marginHorizontal: 16, marginTop: 14 },
  captionLabel: { color: GOLD, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  captionInput: { backgroundColor: '#111', borderRadius: 14, padding: 14, color: '#FFF', fontSize: 14, borderWidth: 1, borderColor: '#222', minHeight: 60, textAlignVertical: 'top' },
  captionCount: { color: '#444', fontSize: 11, textAlign: 'right', marginTop: 6 },
  thumbList: { paddingHorizontal: 16, gap: 10 },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbAtivo: { borderColor: GOLD },
  thumbImg: { width: '100%', height: '100%' },
  thumbVideoBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: 3 },
  thumbCaptionDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  thumbRemove: { position: 'absolute', top: 2, left: 2, backgroundColor: 'rgba(0,0,0,0.75)', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  thumbRemoveText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  thumbAdd: { width: 72, height: 72, borderRadius: 12, borderWidth: 2, borderColor: '#2A2A2A', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  thumbAddIcon: { color: GOLD, fontSize: 22, fontWeight: '300' },
  thumbAddText: { color: '#555', fontSize: 9, fontWeight: '700' },
  dicasWrap: { marginHorizontal: 16, marginTop: 16, backgroundColor: 'rgba(201,169,110,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(201,169,110,0.15)' },
  dicasTitle: { color: GOLD, fontSize: 12, fontWeight: '800', marginBottom: 6 },
  dicasText: { color: '#888', fontSize: 13, lineHeight: 20 },
  progressWrap: { marginHorizontal: 16, marginTop: 16 },
  progressTrack: { height: 6, backgroundColor: '#1A1A1A', borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  progressText: { color: '#666', fontSize: 12, textAlign: 'center', marginTop: 8 },
  fixedFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  publishBtn: { backgroundColor: GOLD, borderRadius: 18, padding: 18, alignItems: 'center', shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  publishBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
});
