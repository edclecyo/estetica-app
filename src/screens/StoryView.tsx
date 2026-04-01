import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Image, Animated, StatusBar, Pressable,
  Modal, ScrollView, ActivityIndicator
} from "react-native";
import firestore, {
  doc, getDoc, setDoc, updateDoc, collection,
  query, where, getDocs, deleteDoc, increment, serverTimestamp
} from "@react-native-firebase/firestore";
import auth from "@react-native-firebase/auth";
import { useRoute, useNavigation } from "@react-navigation/native";
import { SafeAreaView } from 'react-native-safe-area-context';
import Share from 'react-native-share';
import Video from 'react-native-video';

// Importação dos ícones (Certifique-se de ter instalado o react-native-vector-icons)
import Ionicons from 'react-native-vector-icons/Ionicons';
import Feather from 'react-native-vector-icons/Feather';

const { width, height } = Dimensions.get("window");

export default function StoryView() {
  const route: any = useRoute();
  const navigation: any = useNavigation();

  const stories = route.params?.stories || [];
  const startIndex = route.params?.startIndex || 0;
  const onVisto = route.params?.onVisto;

  const [index, setIndex] = useState(startIndex);
  const [isLiked, setIsLiked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [quemCurtiu, setQuemCurtiu] = useState<any[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);
  const [videoDuration, setVideoDuration] = useState(5000);

  const story = stories[index];
  const user = auth().currentUser;
  const isAdmin = user?.uid === story?.adminId;

  const progress = useRef(new Animated.Value(0)).current;
  const likeAnim = useRef(new Animated.Value(1)).current;
  const statsAnim = useRef(new Animated.Value(height)).current;
  const isPaused = useRef(false);
  const pausedValue = useRef(0);

  useEffect(() => {
    if (!story) return;
    progress.setValue(0);
    pausedValue.current = 0;
    registrarView();
    onVisto?.(story.id);
    if (story.type !== 'video') {
      startAnimation(0, 5000);
    }
    return () => progress.stopAnimation();
  }, [index]);

  useEffect(() => {
    if (!story?.id || !user) return;
    checkIfLiked();
  }, [story?.id, user?.uid]);

  function startAnimation(resumeValue = 0, duration = 5000) {
    progress.setValue(resumeValue);
    Animated.timing(progress, {
      toValue: 1,
      duration: duration * (1 - resumeValue),
      useNativeDriver: false
    }).start(({ finished }) => {
      if (finished && !isPaused.current) proximo();
    });
  }

  const handlePressIn = () => {
    isPaused.current = true;
    progress.stopAnimation(v => pausedValue.current = v);
  };

  const handlePressOut = () => {
    isPaused.current = false;
    if (!showStats) {
      startAnimation(pausedValue.current, story.type === 'video' ? videoDuration : 5000);
    }
  };

  async function registrarView() {
    if (!story?.id || !user) return;
    try {
      const viewId = `${story.id}_${user.uid}`;
      const viewRef = doc(firestore(), "storyViews", viewId);
      const docView = await getDoc(viewRef);
      if (!docView.exists()) {
        await setDoc(viewRef, {
          storyId: story.id,
          userId: user.uid,
          timestamp: serverTimestamp()
        });
        await updateDoc(doc(firestore(), "stories", story.id), { views: increment(1) });
      }
    } catch (e) { console.log("Erro view:", e); }
  }

  async function checkIfLiked() {
    if (!story?.id || !user) return;
    try {
      const likeId = `${story.id}_${user.uid}`;
      const snap = await getDoc(doc(firestore(), "storyLikes", likeId));
      setIsLiked(snap.exists());
    } catch (e) { setIsLiked(false); }
  }

  async function curtir() {
    if (!story?.id || !user) return;
    const estavaCurtido = isLiked;
    const novoEstado = !estavaCurtido;

    Animated.sequence([
      Animated.timing(likeAnim, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(likeAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    setIsLiked(novoEstado);
    const storyRef = doc(firestore(), "stories", story.id);
    const likeRef = doc(firestore(), "storyLikes", `${story.id}_${user.uid}`);

    try {
      if (novoEstado) {
        await setDoc(likeRef, {
          storyId: story.id,
          userName: user.displayName || "Cliente",
          userId: user.uid,
          timestamp: serverTimestamp()
        });
        await updateDoc(storyRef, { likesCount: increment(1) });
      } else {
        await deleteDoc(likeRef);
        await updateDoc(storyRef, { likesCount: increment(-1) });
      }
    } catch (e) { setIsLiked(estavaCurtido); }
  }

  async function compartilhar() {
    handlePressIn();
    try {
      await Share.open({
        title: 'Compartilhar Story',
        url: story.url || story.imagem,
        message: `Olha o que vi no perfil de ${story.nome}!`
      });
    } catch { console.log("Cancelado"); }
    handlePressOut();
  }

  async function abrirStats() {
    if (!isAdmin) return;
    handlePressIn();
    setShowStats(true);
    setLoadingStats(true);
    try {
      const storyData = await getDoc(doc(firestore(), "stories", story.id));
      setTotalViews(storyData.data()?.views || 0);
      const likesSnap = await getDocs(query(collection(firestore(), "storyLikes"), where("storyId", "==", story.id)));
      setQuemCurtiu(likesSnap.docs.map(d => d.data()));
      Animated.spring(statsAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    } catch (e) { console.log(e); } finally { setLoadingStats(false); }
  }

  function fecharStats() {
    Animated.timing(statsAnim, { toValue: height, duration: 300, useNativeDriver: true }).start(() => {
      setShowStats(false);
      handlePressOut();
    });
  }

  // Correção do Erro de navegação:
  function fecharStories() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Caso não tenha para onde voltar, redireciona para a Home ou tela principal
      navigation.navigate("Home"); 
    }
  }

  function proximo() {
    if (index + 1 >= stories.length) {
      fecharStories();
    } else {
      setIndex(index + 1);
    }
  }

  function voltar() {
    if (index > 0) setIndex(index - 1);
  }

  if (!story) return null;

  return (
    <View style={s.container}>
      <StatusBar hidden />

      {story.type === 'video' ? (
        <Video
          source={{ uri: story.url || story.imagem }}
          style={s.image}
          resizeMode="cover"
          paused={isPaused.current || showStats}
          onLoad={(data) => {
            const duration = data.duration * 1000;
            setVideoDuration(duration);
            startAnimation(0, duration);
          }}
          onEnd={proximo}
        />
      ) : (
        <Image source={{ uri: story.url || story.imagem }} style={s.image} resizeMode="cover" />
      )}

      <View style={s.topOverlay} />

      <SafeAreaView style={s.progressWrapper} edges={['top']}>
        <View style={s.progressContainer}>
          {stories.map((_: any, i: number) => (
            <View key={i} style={s.progressBg}>
              <Animated.View style={[
                s.progressFill,
                { width: i === index ? progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) : i < index ? "100%" : "0%" }
              ]} />
            </View>
          ))}
        </View>
        <View style={s.headerInfo}>
          <Image source={{ uri: story.avatar }} style={s.avatarImg} />
          <Text style={s.nomeEstab}>{story.nome}</Text>
          <TouchableOpacity style={{ padding: 10 }} onPress={fecharStories}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={s.touchLayer}>
        <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={voltar} style={s.touchSide} />
        <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={proximo} onLongPress={abrirStats} style={s.touchSide} />
      </View>

      <View style={s.footer}>
        <TouchableOpacity onPress={curtir} style={s.likeBtn} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
            <Ionicons 
                name={isLiked ? "heart" : "heart-outline"} 
                size={32} 
                color={isLiked ? '#FF2D55' : '#FFF'} 
            />
          </Animated.View>
        </TouchableOpacity>
        <TouchableOpacity onPress={compartilhar} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <Feather name="send" size={28} color="#FFF" style={{ marginLeft: 20 }} />
        </TouchableOpacity>
      </View>

      {isAdmin && (
        <TouchableOpacity style={s.swipeUpIndicator} onPress={abrirStats}>
          <Ionicons name="chevron-up" size={18} color="#FFF" />
          <Text style={s.swipeLabel}>Atividade</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showStats} transparent animationType="none" onRequestClose={fecharStats}>
        <View style={s.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={fecharStats} />
          <Animated.View style={[s.statsSheet, { transform: [{ translateY: statsAnim }] }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Atividade do Story</Text>
            <View style={s.statsHeader}>
              <View style={s.statBox}>
                <Text style={s.statValue}>{totalViews}</Text>
                <Text style={s.statLabel}>Vistas 👁️</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>{quemCurtiu.length}</Text>
                <Text style={s.statLabel}>Curtidas ❤️</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={s.sectionTitle}>Interações</Text>
              {loadingStats ? <ActivityIndicator color="#C9A96E" /> : (
                quemCurtiu.length === 0
                  ? <Text style={s.emptyText}>Sem curtidas.</Text>
                  : quemCurtiu.map((item, i) => (
                    <View key={i} style={s.userRow}>
                      <View style={s.userAvatar}><Feather name="user" size={18} color="#888" /></View>
                      <Text style={s.userName}>{item.userName || "Usuário"}</Text>
                    </View>
                  ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  image: { ...StyleSheet.absoluteFillObject },
  topOverlay: { position: 'absolute', top: 0, width: '100%', height: 100, backgroundColor: 'rgba(0,0,0,0.3)' },
  progressWrapper: { zIndex: 20 },
  progressContainer: { flexDirection: "row", paddingHorizontal: 10, marginTop: 10, height: 2 },
  progressBg: { flex: 1, height: 2, backgroundColor: "rgba(255,255,255,0.3)", marginHorizontal: 2, borderRadius: 2 },
  progressFill: { height: '100%', backgroundColor: "#fff" },
  headerInfo: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  avatarImg: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#333' },
  nomeEstab: { color: '#fff', marginLeft: 10, fontWeight: '700', flex: 1 },
  touchLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 100, flexDirection: "row", zIndex: 10 },
  touchSide: { flex: 1 },
  footer: {
    position: "absolute",
    bottom: 40,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  likeBtn: { zIndex: 50, elevation: 50 },
  swipeUpIndicator: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center', zIndex: 30 },
  swipeLabel: { color: '#fff', fontSize: 10, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  statsSheet: { backgroundColor: '#1A1A1A', height: height * 0.65, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#333', borderRadius: 3, alignSelf: 'center', marginTop: 10 },
  sheetTitle: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center', marginVertical: 15 },
  statsHeader: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 20 },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  sectionTitle: { color: '#C9A96E', fontSize: 14, fontWeight: '700', marginBottom: 15 },
  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userName: { color: '#fff', fontWeight: '600' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 20 }
});