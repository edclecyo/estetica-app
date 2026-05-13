import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  Animated,
  StatusBar,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  PanResponder,
  Platform,
} from "react-native";

import firestore, {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  increment,
  serverTimestamp,
} from "@react-native-firebase/firestore";

import auth from "@react-native-firebase/auth";
import { useRoute, useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import Share from "react-native-share";
import Video from "react-native-video";

import Ionicons from "react-native-vector-icons/Ionicons";
import Feather from "react-native-vector-icons/Feather";

const { width, height } = Dimensions.get("window");

const FOOTER_BOTTOM = Platform.OS === "ios" ? 48 : 36;
const STORY_BOTTOM_SAFE = Platform.OS === "ios" ? 125 : 110;

export default function StoryView() {
  const route: any = useRoute();
  const navigation: any = useNavigation();

  const stories = route.params?.stories || [];
  const startIndex = route.params?.startIndex || 0;
  const onVisto = route.params?.onVisto;

  const storiesFiltrados = stories.filter((s: any) => s && s.id);

  const [index, setIndex] = useState(startIndex);
  const [isLiked, setIsLiked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [quemCurtiu, setQuemCurtiu] = useState<any[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);
  const [videoDuration, setVideoDuration] = useState(5000);

  const story = storiesFiltrados[index];
  const user = auth().currentUser;
  const isAdmin = user?.uid === story?.adminId;

  const progress = useRef(new Animated.Value(0)).current;
  const likeAnim = useRef(new Animated.Value(1)).current;
  const statsAnim = useRef(new Animated.Value(height)).current;
  const isPaused = useRef(false);
  const pausedValue = useRef(0);

const panResponder = useRef(
  PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dy) > 20;
    },

    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy < -50 && isAdmin) {
        abrirStats();
      }
    },
  })
).current;
  useEffect(() => {
    if (!story || !story.id) return;

    progress.setValue(0);
    pausedValue.current = 0;

    registrarView();
    onVisto?.(story.id);

    if (story.type !== "video") {
      startAnimation(0, 5000);
    }

    return () => progress.stopAnimation();
  }, [index]);

  useEffect(() => {
  if (!story?.id || !user?.uid) {
    setIsLiked(false);
    return;
  }

  const likeId = `${story.id}_${user.uid}`;

  const unsub = firestore()
    .collection('storyLikes')
    .doc(likeId)
    .onSnapshot(doc => {
      setIsLiked(doc.exists);
    });

  return () => unsub();
}, [story?.id, user?.uid]);

function abrirAgendamento() {
  if (!story?.estabelecimentoId) return;

  navigation.navigate(user ? "Detalhe" : "ClienteLogin", {
    estabelecimentoId: story.estabelecimentoId,
  });
}
  function startAnimation(resumeValue = 0, duration = 5000) {
    progress.setValue(resumeValue);

    Animated.timing(progress, {
      toValue: 1,
      duration: duration * (1 - resumeValue),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !isPaused.current) {
        proximo();
      }
    });
  }

  const handlePressIn = () => {
    isPaused.current = true;
    progress.stopAnimation(v => {
      pausedValue.current = v;
    });
  };

  const handlePressOut = () => {
    isPaused.current = false;

    if (!showStats && story) {
      startAnimation(
        pausedValue.current,
        story.type === "video" ? videoDuration : 5000
      );
    }
  };

  async function registrarView() {
    if (!story || !story.id || !user) return;

    try {
      const viewId = `${story.id}_${user.uid}`;

      const viewRef = doc(
        firestore(),
        "storyViews",
        viewId
      );

      const docView = await getDoc(viewRef);

      if (!docView.exists()) {
        await setDoc(viewRef, {
          storyId: story.id,
          userId: user.uid,
          timestamp: serverTimestamp(),
        });

        await updateDoc(
          doc(firestore(), "stories", story.id),
          {
            views: increment(1),
            visualizacoes: increment(1),
          }
        );
      }
    } catch (e) {
      console.log("Erro view:", e);
    }
  }

 

 async function curtir() {
  if (!story?.id || !user?.uid) return;

  const storyRef = doc(firestore(), 'stories', story.id);
  const likeRef = doc(
    firestore(),
    'storyLikes',
    `${story.id}_${user.uid}`
  );

  const estavaCurtido = isLiked;

  setIsLiked(!estavaCurtido);

  Animated.sequence([
    Animated.timing(likeAnim, {
      toValue: 1.4,
      duration: 100,
      useNativeDriver: true,
    }),
    Animated.timing(likeAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }),
  ]).start();

  try {
    if (estavaCurtido) {
      await deleteDoc(likeRef);

      await updateDoc(storyRef, {
        likesCount: increment(-1),
      });
    } else {
      await setDoc(likeRef, {
        storyId: story.id,
        userId: user.uid,
        userName: user.displayName || 'Cliente',
        timestamp: serverTimestamp(),
      });

      await updateDoc(storyRef, {
        likesCount: increment(1),
      });
    }
  } catch (e) {
    console.log('Erro curtir:', e);
    setIsLiked(estavaCurtido);
  }
}

  async function compartilhar() {
    if (!story || !story.id) return;

    handlePressIn();

    try {
      await Share.open({
        title: "Compartilhar Story",
        url: story.url || story.imagem,
        message: `Olha o que vi no perfil de ${story.nome || "BeautyHub"}!`,
      });

      await updateDoc(
        doc(firestore(), "stories", story.id),
        {
          compartilhamentos: increment(1),
        }
      );
    } catch (e) {
      // usuário cancelou ou erro silencioso
    }

    handlePressOut();
  }

  async function abrirStats() {
    if (!isAdmin || !story || !story.id) return;

    handlePressIn();
    setShowStats(true);
    setLoadingStats(true);

    try {
      const storySnap = await getDoc(
        doc(firestore(), "stories", story.id)
      );

      const storyData = storySnap.data();

      setTotalViews(
        storyData?.visualizacoes ||
          storyData?.views ||
          0
      );

      const likesSnap = await getDocs(
        query(
          collection(firestore(), "storyLikes"),
          where("storyId", "==", story.id)
        )
      );

      setQuemCurtiu(
        likesSnap.docs.map(d => d.data())
      );

      Animated.spring(statsAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    } catch (e) {
      console.log("Erro stats:", e);
    } finally {
      setLoadingStats(false);
    }
  }

  function fecharStats() {
    Animated.timing(statsAnim, {
      toValue: height,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowStats(false);
      handlePressOut();
    });
  }

  function fecharStories() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("HomeTabs");
    }
  }

  function proximo() {
    if (index + 1 >= storiesFiltrados.length) {
      fecharStories();
    } else {
      setIndex(index + 1);
    }
  }

  function voltar() {
    if (index > 0) {
      setIndex(index - 1);
    }
  }

  if (!story || !story.id) {
    fecharStories();
    return null;
  }

  return (
    <View style={s.container}>
      <StatusBar hidden />

      {story.type === "video" ? (
        <Video
          source={{ uri: story.url || story.imagem }}
          style={s.image}
          resizeMode="cover"
          paused={isPaused.current || showStats}
          onLoad={data => {
            const duration = data.duration * 1000;
            setVideoDuration(duration);
            startAnimation(0, duration);
          }}
          onEnd={proximo}
        />
      ) : (
        <Image
          source={{ uri: story.url || story.imagem }}
          style={s.image}
          resizeMode="cover"
        />
      )}

      <View style={s.topOverlay} />

      <SafeAreaView style={s.progressWrapper} edges={["top"]}>
        <View style={s.progressContainer}>
          {storiesFiltrados.map((_: any, i: number) => (
            <View key={i} style={s.progressBg}>
              <Animated.View
                style={[
                  s.progressFill,
                  {
                    width:
                      i === index
                        ? progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0%", "100%"],
                          })
                        : i < index
                        ? "100%"
                        : "0%",
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={s.headerInfo}>
          <Image
            source={{ uri: story.avatar }}
            style={s.avatarImg}
          />

          <Text style={s.nomeEstab}>
            {story.nome || story.nomeAdmin || "Story"}
          </Text>

          <TouchableOpacity
            style={{ padding: 10 }}
            onPress={fecharStories}
          >
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={s.touchLayer}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={voltar}
          style={s.touchSide}
        />

        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={proximo}
          onLongPress={abrirStats}
          style={s.touchSide}
        />
      </View>

      {story.caption ? (
        <View style={s.captionOverlay}>
          <Text style={s.captionOverlayText}>
            {story.caption}
          </Text>
        </View>
      ) : null}

      <View style={s.footer}>
        <TouchableOpacity
          onPress={curtir}
          style={s.likeBtn}
          hitSlop={{
            top: 20,
            bottom: 20,
            left: 20,
            right: 20,
          }}
        >
          <Animated.View
            style={{
              transform: [{ scale: likeAnim }],
            }}
          >
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={32}
              color={isLiked ? "#FF2D55" : "#FFF"}
            />
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={compartilhar}
          hitSlop={{
            top: 20,
            bottom: 20,
            left: 20,
            right: 20,
          }}
        >
          <Feather
  name="send"
  size={28}
  color="#FFF"
  style={{ marginTop: 24 }}
/>
        </TouchableOpacity>
      </View>

     <View
  style={s.bottomActionArea}
  {...panResponder.panHandlers}
>
  {isAdmin ? (
    <TouchableOpacity
      style={s.adminSwipeBox}
      onPress={abrirStats}
      activeOpacity={0.85}
    >
      <Ionicons name="chevron-up" size={20} color="#FFF" />

      <Text style={s.swipeLabel}>
        Arraste para cima • Atividade
      </Text>
    </TouchableOpacity>
  ) : (
    <TouchableOpacity
      style={s.agendarStoryBtn}
      onPress={abrirAgendamento}
      activeOpacity={0.9}
    >
      <Text style={s.agendarStoryText}>
        Faça seu agendamento!
      </Text>

      <Ionicons name="calendar-outline" size={20} color="#000" />
    </TouchableOpacity>
  )}
</View>

      <Modal
        visible={showStats}
        transparent
        animationType="none"
        onRequestClose={fecharStats}
      >
        <View style={s.modalOverlay}>
          <Pressable
            style={{ flex: 1 }}
            onPress={fecharStats}
          />

          <Animated.View
            style={[
              s.statsSheet,
              {
                transform: [
                  { translateY: statsAnim },
                ],
              },
            ]}
          >
            <View style={s.sheetHandle} />

            <Text style={s.sheetTitle}>
              Atividade do Story
            </Text>

            <View style={s.statsHeader}>
              <View style={s.statBox}>
                <Text style={s.statValue}>
                  {totalViews}
                </Text>
                <Text style={s.statLabel}>
                  Vistas 👁️
                </Text>
              </View>

              <View style={s.statBox}>
                <Text style={s.statValue}>
                  {quemCurtiu.length}
                </Text>
                <Text style={s.statLabel}>
                  Curtidas ❤️
                </Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 20 }}
            >
              <Text style={s.sectionTitle}>
                Interações
              </Text>

              {loadingStats ? (
                <ActivityIndicator color="#C9A96E" />
              ) : quemCurtiu.length === 0 ? (
                <Text style={s.emptyText}>
                  Sem curtidas.
                </Text>
              ) : (
                quemCurtiu.map((item, i) => (
                  <View key={i} style={s.userRow}>
                    <View style={s.userAvatar}>
                      <Feather
                        name="user"
                        size={18}
                        color="#888"
                      />
                    </View>

                    <Text style={s.userName}>
                      {item.userName || "Usuário"}
                    </Text>
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
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  image: {
    ...StyleSheet.absoluteFillObject,
  },

  topOverlay: {
    position: "absolute",
    top: 0,
    width: "100%",
    height: 100,
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  progressWrapper: {
    zIndex: 20,
  },

adminSwipeBox: {
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 10,
},

agendarStoryBtn: {
  height: 48,
  borderRadius: 24,
  backgroundColor: "#C9A96E",
  paddingHorizontal: 18,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
},

agendarStoryText: {
  color: "#000",
  fontSize: 14,
  fontWeight: "900",
},
  progressContainer: {
    flexDirection: "row",
    paddingHorizontal: 10,
    marginTop: 10,
    height: 2,
  },

  progressBg: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginHorizontal: 2,
    borderRadius: 2,
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
  },

  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },

  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#333",
  },

  nomeEstab: {
    color: "#fff",
    marginLeft: 10,
    fontWeight: "700",
    flex: 1,
  },

  touchLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 100,
    flexDirection: "row",
    zIndex: 10,
  },

  touchSide: {
    flex: 1,
  },

  captionOverlay: {
  position: "absolute",
  bottom: STORY_BOTTOM_SAFE,
  left: 20,
  right: 20,
  backgroundColor: "rgba(0,0,0,0.45)",
  borderRadius: 16,
  padding: 14,
  zIndex: 40,
},

bottomActionArea: {
  position: "absolute",
  bottom: FOOTER_BOTTOM,
  left: 18,
  right: 95,
  zIndex: 60,
  elevation: 60,
},

  captionOverlayText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },

  footer: {
  position: "absolute",
  right: 18,
  bottom: FOOTER_BOTTOM,
  alignItems: "center",
  justifyContent: "center",
  zIndex: 80,
  elevation: 80,
},
likeBtn: {
  marginBottom: 22,
  alignItems: "center",
  justifyContent: "center",
},
  likeBtn: {
    zIndex: 50,
    elevation: 50,
  },

  swipeUpIndicator: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
    zIndex: 30,
  },

  swipeLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },

  statsSheet: {
    backgroundColor: "#1A1A1A",
    height: height * 0.65,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: "#333",
    borderRadius: 3,
    alignSelf: "center",
    marginTop: 10,
  },

  sheetTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginVertical: 15,
  },

  statsHeader: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 20,
  },

  statBox: {
    flex: 1,
    alignItems: "center",
  },

  statValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },

  statLabel: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },

  sectionTitle: {
    color: "#C9A96E",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 15,
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  userName: {
    color: "#fff",
    fontWeight: "600",
  },

  emptyText: {
    color: "#666",
    textAlign: "center",
    marginTop: 20,
  },
});