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
  Linking,
} from "react-native";

import firestore, {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  deleteDoc,
  increment,
  serverTimestamp,
} from "@react-native-firebase/firestore";

import auth from "@react-native-firebase/auth";
import { useRoute, useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Share from "react-native-share";
import Video from "react-native-video";

import Ionicons from "react-native-vector-icons/Ionicons";
import Feather from "react-native-vector-icons/Feather";

const { width, height } = Dimensions.get("window");

const getStoryViews = (data: any) =>
  Number(
    data?.visualizacoes ??
    data?.views ??
    data?.viewsCount ??
    0
  );

const getStoryMediaUri = (story: any) =>
  story?.url ||
  story?.imagem ||
  story?.mediaUrl ||
  story?.imageUrl ||
  story?.videoUrl ||
  story?.fotoUrl ||
  "";

const getStoryType = (story: any) => {
  if (story?.type === "video" || story?.tipo === "video") return "video";
  const uri = getStoryMediaUri(story).split("?")[0].toLowerCase();
  return /\.(mp4|mov|m4v|webm)$/i.test(uri) ? "video" : "image";
};

const webStoryImageStyle = (uri: string) => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: "100%",
  height: "100%",
  backgroundImage: `url("${uri.replace(/"/g, '\\"')}")`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundColor: "#000",
});

const webStoryImgStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  backgroundColor: "#000",
  WebkitUserSelect: "none",
  userSelect: "none",
  WebkitTouchCallout: "none",
  zIndex: 2,
};


export default function StoryView() {
  const route: any = useRoute();
  const navigation: any = useNavigation();

  const storyDireto = route.params?.story;
  const adminSimple = route.params?.adminSimple === true;
  const stories = route.params?.stories || (storyDireto ? [storyDireto] : []);
  const startIndex = route.params?.startIndex || 0;
  const onVisto = route.params?.onVisto;

  const storiesFiltrados = stories.filter((s: any) => s && s.id);

  const [index, setIndex] = useState(startIndex);
  const [isLiked, setIsLiked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [quemCurtiu, setQuemCurtiu] = useState<any[]>([]);
  const [quemCompartilhou, setQuemCompartilhou] = useState<any[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [totalShares, setTotalShares] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);
  const [videoDuration, setVideoDuration] = useState(5000);
  const [mediaError, setMediaError] = useState(false);
  const [mediaLoadStatus, setMediaLoadStatus] = useState<
    "idle" | "loading" | "loaded" | "error" | "timeout"
  >("idle");

  const story = storiesFiltrados[index] || storyDireto;
  const mediaUri = getStoryMediaUri(story);
  const storyType = getStoryType(story);
  const isWebVideo = Platform.OS === "web" && storyType === "video";
  const isWebImage = Platform.OS === "web" && storyType !== "video";
  const user = auth().currentUser;
  const isAdmin = user?.uid === story?.adminId;

  const progress = useRef(new Animated.Value(0)).current;
  const likeAnim = useRef(new Animated.Value(1)).current;
  const statsAnim = useRef(new Animated.Value(height)).current;
  const isPaused = useRef(false);
  const pausedValue = useRef(0);

const insets = useSafeAreaInsets();

const bottomSafe =
  Math.max(insets.bottom, Platform.OS === "android" ? 24 : 16);

const footerBottom = bottomSafe + 28;
const actionBottom = bottomSafe + 24;
const captionBottom = bottomSafe + 115;

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
    setMediaError(false);
    setMediaLoadStatus(isWebImage && mediaUri ? "loading" : "idle");

    registrarView();
    onVisto?.(story.id);

    if (storyType !== "video" && !isWebImage) {
      startAnimation(0, 5000);
    }

    return () => progress.stopAnimation();
  }, [index, isWebImage, mediaUri, storyType]);

  useEffect(() => {
    if (!isWebImage || !mediaUri) return;

    const timeout = setTimeout(() => {
      setMediaLoadStatus(current =>
        current === "loaded" || current === "error" ? current : "timeout"
      );
    }, 3500);

    return () => clearTimeout(timeout);
  }, [isWebImage, mediaUri, story?.id]);

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

function abrirMidiaDireta() {
  if (!mediaUri) return;

  const webWindow = (globalThis as any)?.window;
  if (Platform.OS === "web" && webWindow?.open) {
    webWindow.open(mediaUri, "_blank", "noopener,noreferrer");
    return;
  }

  Linking.openURL(mediaUri).catch(() => {});
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
        storyType === "video" ? videoDuration : 5000
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

      if (!docView.exists) {
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
  if (!user?.uid) {
    navigation.navigate('ClienteLogin');
    return;
  }

  if (!story?.id) return;

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

    if (!user?.uid) {
      navigation.navigate('ClienteLogin');
      return;
    }

    handlePressIn();

    try {
      await Share.open({
        title: "Compartilhar Story",
        url: mediaUri,
        message: `Olha o que vi no perfil de ${story.nome || "BeautyHub"}!`,
      });

      await updateDoc(
        doc(firestore(), "stories", story.id),
        {
          compartilhamentos: increment(1),
        }
      );

      if (user?.uid) {
        await setDoc(
          doc(firestore(), "storyShares", `${story.id}_${user.uid}`),
          {
            storyId: story.id,
            userId: user.uid,
            userName: user.displayName || "Cliente",
            timestamp: serverTimestamp(),
          },
          { merge: true }
        );
      }
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

      const viewsSnap = await getDocs(
        query(
          collection(firestore(), "storyViews"),
          where("storyId", "==", story.id),
          limit(200)
        )
      );

      const likesSnap = await getDocs(
        query(
          collection(firestore(), "storyLikes"),
          where("storyId", "==", story.id),
          limit(200)
        )
      );

      let shares: any[] = [];
      let sharesCount = 0;

      try {
        const sharesSnap = await getDocs(
          query(
            collection(firestore(), "storyShares"),
            where("storyId", "==", story.id),
            limit(200)
          )
        );

        shares = sharesSnap.docs.map(d => d.data());
        sharesCount = sharesSnap.size;
      } catch (e) {
        console.log("Erro compartilhamentos:", e);
      }

      setTotalViews(
        Math.max(
          getStoryViews(storyData),
          viewsSnap.size
        )
      );

      setQuemCurtiu(
        likesSnap.docs.map(d => d.data())
      );

      setQuemCompartilhou(
        shares
      );

      setTotalShares(
        Math.max(
          Number(storyData?.compartilhamentos || 0),
          sharesCount
        )
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
    if (isWebImage) return;

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

  if (isWebImage) {
    return (
      <View style={s.simpleContainer}>
        {mediaUri && !mediaError ? (
          <>
            {React.createElement("div" as any, {
              key: `bg-${story.id}`,
              role: "img",
              "aria-label": story.caption || story.nome || "Story",
              style: {
                ...webStoryImageStyle(mediaUri),
                zIndex: 1,
              },
            })}
            {React.createElement("img" as any, {
              key: `img-${story.id}`,
              src: mediaUri,
              alt: story.caption || story.nome || "Story",
              decoding: "async",
              loading: "eager",
              onLoad: () => setMediaLoadStatus("loaded"),
              onError: () => {
                setMediaLoadStatus("error");
                setMediaError(true);
              },
              style: webStoryImgStyle,
            })}
          </>
        ) : (
          <View style={[s.image, s.mediaFallback]}>
            <Ionicons name="image-outline" size={42} color="#C9A96E" />
            <Text style={s.mediaFallbackTitle}>Story indisponivel</Text>
          </View>
        )}

        {mediaLoadStatus === "timeout" || mediaLoadStatus === "error" ? (
          <View style={s.storyDebugBox}>
            <Text style={s.storyDebugTitle}>
              {mediaLoadStatus === "error"
                ? "Imagem bloqueada ou indisponivel"
                : "Imagem nao renderizou no iPhone"}
            </Text>
            <Text style={s.storyDebugText}>
              Teste abrindo a imagem direta. Se abrir fora do app, o problema e
              renderizacao do Safari. Se nao abrir, e permissao ou URL.
            </Text>
            <TouchableOpacity
              style={s.storyDebugButton}
              onPress={abrirMidiaDireta}
              activeOpacity={0.85}
            >
              <Text style={s.storyDebugButtonText}>Abrir imagem</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={s.simpleTopOverlay} />

        <SafeAreaView style={s.simpleHeader} edges={["top"]}>
          <View style={s.headerInfo}>
            <Image source={{ uri: story.avatar }} style={s.avatarImg} />
            <Text style={s.nomeEstab}>
              {story.nome || story.nomeAdmin || "Story"}
            </Text>
            <TouchableOpacity style={{ padding: 10 }} onPress={fecharStories}>
              <Ionicons name="close" size={30} color="#FFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {story.caption ? (
          <View style={[s.captionOverlay, { bottom: captionBottom }]}>
            <Text style={s.captionOverlayText}>{story.caption}</Text>
          </View>
        ) : null}

        <View style={[s.bottomActionArea, { bottom: actionBottom }]}>
          {isAdmin ? (
            <TouchableOpacity
              style={s.adminSwipeBox}
              onPress={abrirStats}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-up" size={20} color="#FFF" />
              <Text style={s.swipeLabel}>Atividade</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.agendarStoryBtn}
              onPress={abrirAgendamento}
              activeOpacity={0.9}
            >
              <Text style={s.agendarStoryText}>Faça seu agendamento!</Text>
              <Ionicons name="calendar-outline" size={20} color="#000" />
            </TouchableOpacity>
          )}
        </View>

        {showStats ? (
          <View style={s.webStatsOverlay}>
            <Pressable style={s.webStatsBackdrop} onPress={fecharStats} />
            <View style={s.webStatsSheet}>
              <View style={s.sheetHandle} />
              <Text style={s.sheetTitle}>Atividade do Story</Text>
              <View style={s.statsHeader}>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{totalViews}</Text>
                  <Text style={s.statLabel}>Vistas</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{quemCurtiu.length}</Text>
                  <Text style={s.statLabel}>Curtidas</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{totalShares}</Text>
                  <Text style={s.statLabel}>Compart.</Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar hidden />

      {mediaUri && !mediaError && storyType === "video" ? (
        <Video
          source={{ uri: mediaUri }}
          style={s.image}
          resizeMode="cover"
          paused={isWebVideo ? false : isPaused.current || showStats}
          controls={Platform.OS === "web"}
          onLoad={data => {
            const duration = Math.max(Number(data.duration || 5) * 1000, 3000);
            setVideoDuration(duration);
            startAnimation(0, duration);
          }}
          onEnd={proximo}
          onError={() => {
            setMediaError(true);
            startAnimation(0, 5000);
          }}
        />
      ) : mediaUri && !mediaError && Platform.OS === "web" ? (
        React.createElement("div" as any, {
          role: "img",
          "aria-label": story.caption || story.nome || "Story",
          style: webStoryImageStyle(mediaUri),
        })
      ) : mediaUri && !mediaError ? (
        <Image
          source={{ uri: mediaUri }}
          style={s.image}
          resizeMode="cover"
          onError={() => {
            setMediaError(true);
            startAnimation(0, 5000);
          }}
        />
      ) : (
        <View style={[s.image, s.mediaFallback]}>
          <Ionicons name="image-outline" size={42} color="#C9A96E" />
          <Text style={s.mediaFallbackTitle}>Story indisponivel</Text>
          <Text style={s.mediaFallbackText}>
            Nao foi possivel carregar esta midia.
          </Text>
        </View>
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

      <View
        style={s.touchLayer}
        pointerEvents={isWebVideo ? "none" : "auto"}
      >
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
       <View
  style={[
    s.captionOverlay,
    { bottom: captionBottom }
  ]}
>
          <Text style={s.captionOverlayText}>
            {story.caption}
          </Text>
        </View>
      ) : null}

      <View
  style={[
    s.footer,
    { bottom: footerBottom }
  ]}
>
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
  style={[
    s.bottomActionArea,
    { bottom: actionBottom }
  ]}
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

              <View style={s.statBox}>
                <Text style={s.statValue}>
                  {totalShares}
                </Text>
                <Text style={s.statLabel}>
                  Compart.
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

              <Text style={s.sectionTitle}>
                Compartilhamentos
              </Text>

              {loadingStats ? null : quemCompartilhou.length === 0 ? (
                <Text style={s.emptyText}>
                  Nenhum compartilhamento identificado.
                </Text>
              ) : (
                quemCompartilhou.map((item, i) => (
                  <View key={`${item.userId || "share"}_${i}`} style={s.userRow}>
                    <View style={s.userAvatar}>
                      <Feather
                        name="send"
                        size={16}
                        color="#888"
                      />
                    </View>

                    <Text style={s.userName}>
                      {item.userName || "Usuario"}
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

  simpleContainer: {
    flex: 1,
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: Platform.OS === "web" ? ("100dvh" as any) : undefined,
    backgroundColor: "#000",
    overflow: "hidden",
  },

  simpleTopOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 130,
    backgroundColor: "rgba(0,0,0,0.28)",
    zIndex: 5,
  },

  simpleHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },

  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },

  mediaFallback: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "#050505",
  },

  mediaFallbackTitle: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 12,
  },

  mediaFallbackText: {
    color: "#999",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: "center",
  },

  storyDebugBox: {
    position: "absolute",
    left: 18,
    right: 18,
    top: "32%",
    zIndex: 80,
    borderRadius: 8,
    padding: 16,
    backgroundColor: "rgba(12,12,12,0.94)",
    borderWidth: 1,
    borderColor: "rgba(201,169,110,0.45)",
  },

  storyDebugTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },

  storyDebugText: {
    color: "#D8D8D8",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center",
  },

  storyDebugButton: {
    minHeight: 44,
    borderRadius: 8,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C9A96E",
  },

  storyDebugButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
  },

  webStatsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 90,
    justifyContent: "flex-end",
  },

  webStatsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  webStatsSheet: {
    minHeight: 220,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 34,
    backgroundColor: "#121212",
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
  left: 20,
  right: 20,
  backgroundColor: "rgba(0,0,0,0.45)",
  borderRadius: 16,
  padding: 14,
  zIndex: 40,
},

bottomActionArea: {
  position: "absolute",
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
