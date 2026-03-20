import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, Alert, SafeAreaView, StatusBar,
  Dimensions, TextInput, ScrollView, FlatList,
  Animated, KeyboardAvoidingView, Platform
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import storage from "@react-native-firebase/storage";
import firestore from "@react-native-firebase/firestore";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useAuth } from "../contexts/AuthContext";
import Video from 'react-native-video';

const { width, height } = Dimensions.get("window");
const STORY_H = width * 1.55;

type MediaItem = {
  uri: string;
  type: 'image' | 'video';
  caption: string;
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
  const [editandoLegenda, setEditandoLegenda] = useState(false);

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
    Animated.timing(progressAnim, {
      toValue: uploadProgress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [uploadProgress]);

  const escolherMidias = async () => {
    const res = await launchImageLibrary({
      mediaType: "mixed",
      quality: 0.85,
      videoQuality: 'high',
      selectionLimit: 10,
    });
    if (res.assets && res.assets.length > 0) {
      const novas: MediaItem[] = res.assets.map(a => ({
        uri: a.uri || '',
        type: a.type?.includes('video') ? 'video' : 'image',
        caption: '',
      }));
      setMidias(prev => [...prev, ...novas].slice(0, 10));
      setIndexAtivo(midias.length);
    }
  };

  const removerMidia = (idx: number) => {
    setMidias(prev => prev.filter((_, i) => i !== idx));
    setIndexAtivo(i => Math.max(0, i - (idx <= i ? 1 : 0)));
  };

  const atualizarLegenda = (texto: string) => {
    setMidias(prev => prev.map((m, i) => i === indexAtivo ? { ...m, caption: texto } : m));
  };

  const postar = async () => {
    if (midias.length === 0) { Alert.alert("Atenção", "Adicione pelo menos uma mídia."); return; }
    if (!estabId) { Alert.alert("Erro", "Estabelecimento não encontrado."); return; }

    setUploading(true);
    try {
      const estabDoc = await firestore().collection('estabelecimentos').doc(estabId).get();
      const d = estabDoc.data();
      const nome = d?.nome || admin?.nome || "Empresa";
      const avatar = d?.fotoPerfil || d?.capa || admin?.fotoPerfil || "";
      const agora = firestore.Timestamp.now();

      for (let i = 0; i < midias.length; i++) {
        const m = midias[i];
        setUploadProgress(Math.round((i / midias.length) * 90));

        const ext = m.type === 'video' ? 'mp4' : 'jpg';
        const fileName = `story_${estabId}_${Date.now()}_${i}.${ext}`;
        const ref = storage().ref(`stories/${estabId}/${fileName}`);
        await ref.putFile(m.uri);
        const url = await ref.getDownloadURL();

        await firestore().collection("stories").add({
          adminId: admin?.id || "",
          estabelecimentoId: estabId,
          url, imagem: url,
          type: m.type,
          caption: m.caption,
          nome, nomeAdmin: nome, avatar,
          ativo: true, visto: false,
          timestamp: agora,
          createdAt: Date.now(),
          expiresAt: Date.now() + 86400000,
          views: 0, likesCount: 0,
        });
      }

      setUploadProgress(100);
      await new Promise(r => setTimeout(r, 500));
      Alert.alert("Publicado! 🎉", `${midias.length} story${midias.length > 1 ? 's' : ''} no ar!`);
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Erro", "Não foi possível publicar.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const midiaAtiva = midias[indexAtivo];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* HEADER */}
        <Animated.View style={[s.header, { opacity: fadeAnim }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backIcon}>✕</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Novo Story</Text>
            {midias.length > 0 && (
              <Text style={s.headerSub}>{midias.length}/10 mídias</Text>
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
        </Animated.View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* BANNER EDUCATIVO */}
          {midias.length === 0 && (
            <Animated.View style={[s.banner, { opacity: fadeAnim }]}>
              <View style={s.bannerIcon}>
                <Text style={{ fontSize: 28 }}>✨</Text>
              </View>
              <Text style={s.bannerTitulo}>Stories que vendem</Text>
              <Text style={s.bannerDesc}>
                Publique fotos e vídeos que aparecem para todos os clientes nas próximas 24 horas.
                Use para mostrar promoções, resultados e novidades do seu espaço.
              </Text>
              <View style={s.bannerDica}>
                <Text style={s.bannerDicaText}>{DICAS[dicaIdx]}</Text>
              </View>

              <View style={s.featuresRow}>
                {[
                  { icon: '🖼️', label: 'Até 10\nmídias' },
                  { icon: '✍️', label: 'Texto\npersonalizado' },
                  { icon: '⏱️', label: '24h\nvisível' },
                  { icon: '📊', label: 'Ver\natividade' },
                ].map((f, i) => (
                  <View key={i} style={s.featureItem}>
                    <Text style={s.featureIcon}>{f.icon}</Text>
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

                {/* Overlay de legenda */}
                {midiaAtiva.caption ? (
                  <View style={s.captionOverlay}>
                    <Text style={s.captionOverlayText}>{midiaAtiva.caption}</Text>
                  </View>
                ) : null}

                {/* Badge tipo */}
                <View style={s.typeBadge}>
                  <Text style={s.typeBadgeText}>{midiaAtiva.type === 'video' ? '🎥 Vídeo' : '📷 Foto'}</Text>
                </View>

                {/* Contador */}
                <View style={s.counterBadge}>
                  <Text style={s.counterText}>{indexAtivo + 1}/{midias.length}</Text>
                </View>
              </>
            ) : (
              <View style={s.emptyPreview}>
                <View style={s.emptyIconWrap}>
                  <Text style={{ fontSize: 44 }}>📱</Text>
                </View>
                <Text style={s.emptyTitle}>Adicionar mídia</Text>
                <Text style={s.emptySub}>Fotos e vídeos da galeria</Text>
                <View style={s.emptyBtn}>
                  <Text style={s.emptyBtnText}>+ Selecionar</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* CAMPO DE LEGENDA */}
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
                onFocus={() => setEditandoLegenda(true)}
                onBlur={() => setEditandoLegenda(false)}
              />
              <Text style={s.captionCount}>{midiaAtiva.caption.length}/120</Text>
            </View>
          )}

          {/* THUMBNAILS */}
          {midias.length > 0 && (
            <View style={s.thumbSection}>
              <FlatList
                data={[...midias, { uri: '__add__', type: 'image', caption: '' }]}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => i.toString()}
                contentContainerStyle={s.thumbList}
                renderItem={({ item, index }) => {
                  if (item.uri === '__add__' && midias.length < 10) {
                    return (
                      <TouchableOpacity style={s.thumbAdd} onPress={escolherMidias}>
                        <Text style={s.thumbAddIcon}>+</Text>
                        <Text style={s.thumbAddText}>Adicionar</Text>
                      </TouchableOpacity>
                    );
                  }
                  if (item.uri === '__add__') return null;
                  const ativo = index === indexAtivo;
                  return (
                    <TouchableOpacity
                      onPress={() => setIndexAtivo(index)}
                      style={[s.thumb, ativo && s.thumbAtivo]}
                    >
                      <Image source={{ uri: item.uri }} style={s.thumbImg} />
                      {item.type === 'video' && (
                        <View style={s.thumbVideoBadge}>
                          <Text style={{ fontSize: 10 }}>▶</Text>
                        </View>
                      )}
                      {item.caption ? (
                        <View style={s.thumbCaptionDot} />
                      ) : null}
                      <TouchableOpacity style={s.thumbRemove} onPress={() => removerMidia(index)}>
                        <Text style={s.thumbRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}

          {/* DICAS RÁPIDAS */}
          {midias.length > 0 && (
            <View style={s.dicasWrap}>
              <Text style={s.dicasTitle}>💡 Dica do dia</Text>
              <Text style={s.dicasText}>{DICAS[dicaIdx]}</Text>
            </View>
          )}

          {/* BOTÃO UPLOAD PROGRESS */}
          {uploading && (
            <View style={s.progressWrap}>
              <View style={s.progressTrack}>
                <Animated.View style={[s.progressBar, {
                  width: progressAnim.interpolate({
                    inputRange: [0, 100], outputRange: ['0%', '100%']
                  })
                }]} />
              </View>
              <Text style={s.progressText}>Publicando... {uploadProgress}%</Text>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* BOTÃO PRINCIPAL FIXO */}
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
    </SafeAreaView>
  );
}

const GOLD = '#C9A96E';
const GREEN = '#4CAF50';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },

  // HEADER
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { color: GOLD, fontSize: 11, fontWeight: '600', marginTop: 2 },
  postBtnHeader: { backgroundColor: GOLD, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  postBtnHeaderText: { color: '#000', fontWeight: '800', fontSize: 13 },

  // BANNER EDUCATIVO
  banner: { margin: 16, backgroundColor: '#111', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#222' },
  bannerIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(201,169,110,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 14, alignSelf: 'center' },
  bannerTitulo: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  bannerDesc: { color: '#888', fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 16 },
  bannerDica: { backgroundColor: 'rgba(201,169,110,0.08)', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(201,169,110,0.2)' },
  bannerDicaText: { color: GOLD, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  featuresRow: { flexDirection: 'row', justifyContent: 'space-around' },
  featureItem: { alignItems: 'center', gap: 6 },
  featureIcon: { fontSize: 22 },
  featureLabel: { color: '#666', fontSize: 11, textAlign: 'center', lineHeight: 15 },

  // PREVIEW
  preview: { marginHorizontal: 16, height: STORY_H, borderRadius: 20, overflow: 'hidden', backgroundColor: '#111', marginTop: 8 },
  previewMedia: { width: '100%', height: '100%' },
  captionOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(0,0,0,0.55)' },
  captionOverlayText: { color: '#FFF', fontSize: 15, fontWeight: '600', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  typeBadge: { position: 'absolute', top: 14, left: 14, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  typeBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  counterBadge: { position: 'absolute', top: 14, right: 14, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  counterText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  emptyPreview: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#2A2A2A', borderStyle: 'dashed', borderRadius: 20, margin: 0 },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptySub: { color: '#555', fontSize: 14, marginBottom: 20 },
  emptyBtn: { backgroundColor: GOLD, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16 },
  emptyBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },

  // LEGENDA
  captionWrap: { marginHorizontal: 16, marginTop: 14 },
  captionLabel: { color: GOLD, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  captionInput: { backgroundColor: '#111', borderRadius: 14, padding: 14, color: '#FFF', fontSize: 14, borderWidth: 1, borderColor: '#222', minHeight: 60, textAlignVertical: 'top' },
  captionCount: { color: '#444', fontSize: 11, textAlign: 'right', marginTop: 6 },

  // THUMBNAILS
  thumbSection: { marginTop: 16 },
  thumbList: { paddingHorizontal: 16, gap: 10 },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbAtivo: { borderColor: GOLD },
  thumbImg: { width: '100%', height: '100%' },
  thumbVideoBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: 3 },
  thumbCaptionDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  thumbRemove: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.75)', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  thumbRemoveText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  thumbAdd: { width: 72, height: 72, borderRadius: 12, borderWidth: 2, borderColor: '#2A2A2A', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  thumbAddIcon: { color: GOLD, fontSize: 22, fontWeight: '300' },
  thumbAddText: { color: '#555', fontSize: 9, fontWeight: '700' },

  // DICAS
  dicasWrap: { marginHorizontal: 16, marginTop: 16, backgroundColor: 'rgba(201,169,110,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(201,169,110,0.15)' },
  dicasTitle: { color: GOLD, fontSize: 12, fontWeight: '800', marginBottom: 6 },
  dicasText: { color: '#888', fontSize: 13, lineHeight: 20 },

  // PROGRESS
  progressWrap: { marginHorizontal: 16, marginTop: 16 },
  progressTrack: { height: 6, backgroundColor: '#1A1A1A', borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  progressText: { color: '#666', fontSize: 12, textAlign: 'center', marginTop: 8 },

  // FOOTER
  fixedFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  publishBtn: { backgroundColor: GOLD, borderRadius: 18, padding: 18, alignItems: 'center', shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  publishBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
});