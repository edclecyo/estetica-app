import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";

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

const pwaBottomInset = "calc(34px + env(safe-area-inset-bottom))" as any;
const pwaSheetPaddingBottom = "calc(34px + env(safe-area-inset-bottom))" as any;
const IMAGE_STORY_DURATION_MS = 5000;

export default function StoryViewWeb() {
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const storyDireto = route.params?.story;
  const stories = route.params?.stories || (storyDireto ? [storyDireto] : []);
  const startIndex = route.params?.startIndex || 0;
  const [index, setIndex] = useState(startIndex);
  const [mediaError, setMediaError] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [stats, setStats] = useState({ views: 0, likes: 0, shares: 0 });
  const [isLiked, setIsLiked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [storyDurationMs, setStoryDurationMs] = useState(IMAGE_STORY_DURATION_MS);
  const timerRef = useRef<any>(null);
  const holdTimeoutRef = useRef<any>(null);
  const didHoldRef = useRef(false);
  const progressRef = useRef(0);
  const videoElementRef = useRef<any>(null);
  const startedAtRef = useRef(0);

  const storiesFiltrados = useMemo(
    () => stories.filter((s: any) => s && s.id),
    [stories]
  );
  const story = storiesFiltrados[index] || storyDireto;
  const mediaUri = getStoryMediaUri(story);
  const storyType = getStoryType(story);
  const user = auth().currentUser;
  const isAdmin = user?.uid === story?.adminId;

  function stopTimer() {
    if (timerRef.current) {
      (globalThis as any).clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopHoldTimer() {
    if (holdTimeoutRef.current) {
      (globalThis as any).clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }

  function fechar() {
    stopTimer();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("HomeTabs");
  }

  function voltarStory() {
    stopTimer();
    if (index > 0) setIndex(index - 1);
    else setProgress(0);
  }

  function proximoStory() {
    stopTimer();
    if (index + 1 < storiesFiltrados.length) {
      setIndex(index + 1);
    } else {
      fechar();
    }
  }

  function startTimer(durationMs = IMAGE_STORY_DURATION_MS, initialProgress = 0) {
    stopTimer();
    const safeDuration = Math.max(Number(durationMs) || IMAGE_STORY_DURATION_MS, 1500);
    const safeProgress = Math.min(Math.max(Number(initialProgress) || 0, 0), 0.98);
    setStoryDurationMs(safeDuration);
    progressRef.current = safeProgress;
    setProgress(safeProgress);
    startedAtRef.current = Date.now() - safeProgress * safeDuration;

    timerRef.current = (globalThis as any).setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const nextProgress = Math.min(elapsed / safeDuration, 1);
      progressRef.current = nextProgress;
      setProgress(nextProgress);

      if (nextProgress >= 1) {
        proximoStory();
      }
    }, 80);
  }

  function pauseStoryTimer() {
    stopTimer();
    videoElementRef.current?.pause?.();
  }

  function resumeStoryTimer() {
    if (!story?.id || showStats) return;
    if (progressRef.current >= 1) return;
    if (storyType === "video") {
      videoElementRef.current?.play?.().catch?.(() => {});
    }
    startTimer(storyDurationMs, progressRef.current);
  }

  function handleStoryPressIn() {
    didHoldRef.current = false;
    pauseStoryTimer();
    stopHoldTimer();
    holdTimeoutRef.current = (globalThis as any).setTimeout(() => {
      didHoldRef.current = true;
    }, 220);
  }

  function handleStoryPressOut(action: () => void) {
    stopHoldTimer();
    if (didHoldRef.current) {
      didHoldRef.current = false;
      resumeStoryTimer();
      return;
    }

    action();
  }

  useEffect(() => {
    setMediaError(false);
    setProgress(0);
    progressRef.current = 0;
    setStoryDurationMs(IMAGE_STORY_DURATION_MS);
    stopTimer();
    stopHoldTimer();
    if (!story?.id || !user?.uid) return;

    const registrar = async () => {
      try {
        const viewId = `${story.id}_${user.uid}`;
        const viewRef = firestore().collection("storyViews").doc(viewId);
        const viewSnap = await viewRef.get();
        if (viewSnap.exists) return;

        await viewRef.set({
          storyId: story.id,
          userId: user.uid,
          timestamp: firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.log("Erro view story web:", error);
      }
    };

    registrar();
  }, [story?.id, user?.uid]);

  useEffect(() => {
    if (!story?.id || showStats) {
      stopTimer();
      return;
    }

    if (storyType !== "video") {
      startTimer(IMAGE_STORY_DURATION_MS, progressRef.current);
    } else if (progressRef.current > 0) {
      videoElementRef.current?.play?.().catch?.(() => {});
      startTimer(storyDurationMs, progressRef.current);
    }

    return () => {
      stopTimer();
      stopHoldTimer();
    };
  }, [story?.id, storyType, showStats]);

  useEffect(() => {
    if (!story?.id || !user?.uid) {
      setIsLiked(false);
      return;
    }

    const likeId = `${story.id}_${user.uid}`;
    const unsub = firestore()
      .collection("storyLikes")
      .doc(likeId)
      .onSnapshot((snap: any) => {
        setIsLiked(snap.exists);
      });

    return () => unsub();
  }, [story?.id, user?.uid]);

  const abrirAgendamento = () => {
    stopTimer();
    if (!story?.estabelecimentoId) return;
    navigation.replace(user ? "Detalhe" : "ClienteLogin", {
      estabelecimentoId: story.estabelecimentoId,
    });
  };

  const abrirStats = async () => {
    if (!story?.id || !isAdmin) return;
    stopTimer();
    setShowStats(true);
    setLoadingStats(true);
    try {
      const storySnap = await firestore().collection("stories").doc(story.id).get();
      const storyData = storySnap.data() || {};
      const likesSnap = await firestore()
        .collection("storyLikes")
        .where("storyId", "==", story.id)
        .get();
      const sharesSnap = await firestore()
        .collection("storyShares")
        .where("storyId", "==", story.id)
        .get();

      setStats({
        views: Number(storyData?.visualizacoes ?? storyData?.views ?? 0),
        likes: likesSnap.size,
        shares: Number(storyData?.compartilhamentos ?? sharesSnap.size ?? 0),
      });
    } catch (error) {
      console.log("Erro stats story web:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const curtir = async () => {
    if (!user?.uid) {
      navigation.navigate("ClienteLogin");
      return;
    }
    if (!story?.id) return;

    const estavaCurtido = isLiked;
    setIsLiked(!estavaCurtido);

    try {
      const storyRef = firestore().collection("stories").doc(story.id);
      const likeRef = firestore()
        .collection("storyLikes")
        .doc(`${story.id}_${user.uid}`);

      if (estavaCurtido) {
        await likeRef.delete();
        await storyRef.update({
          likesCount: firestore.FieldValue.increment(-1),
        });
      } else {
        await likeRef.set({
          storyId: story.id,
          userId: user.uid,
          userName: user.displayName || "Cliente",
          timestamp: firestore.FieldValue.serverTimestamp(),
        });
        await storyRef.update({
          likesCount: firestore.FieldValue.increment(1),
        });
      }
    } catch (error) {
      console.log("Erro curtir story web:", error);
      setIsLiked(estavaCurtido);
    }
  };

  const compartilhar = async () => {
    if (!user?.uid) {
      navigation.navigate("ClienteLogin");
      return;
    }
    if (!story?.id) return;

    try {
      const webNavigator = (globalThis as any).navigator;
      const webLocation = (globalThis as any).location;
      const shareData = {
        title: "BeautyHub",
        text: `Olha o que vi no perfil de ${story.nome || "BeautyHub"}!`,
        url: mediaUri || webLocation?.href || "",
      };

      if (webNavigator?.share) {
        await webNavigator.share(shareData);
      } else if (webNavigator?.clipboard?.writeText) {
        await webNavigator.clipboard.writeText(shareData.url);
      }

      await firestore().collection("stories").doc(story.id).update({
        compartilhamentos: firestore.FieldValue.increment(1),
      });

      await firestore()
        .collection("storyShares")
        .doc(`${story.id}_${user.uid}`)
        .set(
          {
            storyId: story.id,
            userId: user.uid,
            userName: user.displayName || "Cliente",
            timestamp: firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (error) {
      console.log("Compartilhar story web cancelado/erro:", error);
    }
  };

  if (!story?.id) {
    return (
      <View style={s.container}>
        <Text style={s.fallbackTitle}>Story indisponivel</Text>
        <TouchableOpacity style={s.closeCenter} onPress={fechar}>
          <Text style={s.closeCenterText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {mediaUri && !mediaError ? (
        <View style={s.mediaLayer} pointerEvents="none">
          {storyType === "video"
            ? React.createElement("video" as any, {
                key: `story-video-${story.id}`,
                src: mediaUri,
                controls: true,
                autoPlay: true,
                playsInline: true,
                muted: true,
                preload: "auto",
                "webkit-playsinline": "true",
                style: videoStyle,
                ref: (element: any) => {
                  videoElementRef.current = element;
                },
                onLoadedMetadata: (event: any) => {
                  const duration = Number(event?.currentTarget?.duration || 5) * 1000;
                  startTimer(duration);
                },
                onEnded: proximoStory,
                onError: () => setMediaError(false),
              })
            : React.createElement("img" as any, {
                key: `story-img-${story.id}`,
                src: mediaUri,
                alt: story.caption || story.nome || "Story",
                decoding: "sync",
                loading: "eager",
                style: imageStyle,
                onLoad: () => startTimer(IMAGE_STORY_DURATION_MS),
                onError: () => setMediaError(false),
              })}
        </View>
      ) : (
        <View style={s.fallback}>
          <Ionicons name="image-outline" size={44} color="#C9A96E" />
          <Text style={s.fallbackTitle}>Story indisponivel</Text>
          <Text style={s.fallbackText}>Nao foi possivel carregar esta midia.</Text>
        </View>
      )}

      <View style={s.topShade} />
      <View style={s.progressRow}>
        {storiesFiltrados.map((_: any, i: number) => (
          <View key={i} style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                {
                  width:
                    i < index
                      ? "100%"
                      : i === index
                        ? `${Math.round(progress * 100)}%`
                        : "0%",
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={s.header}>
        <Text style={s.title}>{story.nome || story.nomeAdmin || "Story"}</Text>
        <TouchableOpacity style={s.iconBtn} onPress={fechar}>
          <Ionicons name="close" size={30} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={s.touchLayer} pointerEvents="box-none">
        <TouchableOpacity
          style={s.touchHalf}
          activeOpacity={1}
          onPressIn={handleStoryPressIn}
          onPressOut={() => handleStoryPressOut(voltarStory)}
        />
        <TouchableOpacity
          style={s.touchHalf}
          activeOpacity={1}
          onPressIn={handleStoryPressIn}
          onPressOut={() => handleStoryPressOut(proximoStory)}
        />
      </View>

      {story.caption ? (
        <View style={s.caption}>
          <Text style={s.captionText}>{story.caption}</Text>
        </View>
      ) : null}

      <View style={s.sideActions}>
        <TouchableOpacity style={s.sideButton} onPress={curtir}>
          <Ionicons
            name={isLiked ? "heart" : "heart-outline"}
            size={30}
            color={isLiked ? "#FF3B5F" : "#FFF"}
          />
        </TouchableOpacity>
        <TouchableOpacity style={s.sideButton} onPress={compartilhar}>
          <Ionicons name="send-outline" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={[s.bottom, { bottom: pwaBottomInset }]}>
        {isAdmin ? (
          <TouchableOpacity style={s.adminBtn} onPress={abrirStats}>
            <Ionicons name="chevron-up" size={20} color="#FFF" />
            <Text style={s.adminBtnText}>Atividade</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.agendarBtn} onPress={abrirAgendamento}>
            <Text style={s.agendarText}>Faca seu agendamento!</Text>
            <Ionicons name="calendar-outline" size={20} color="#000" />
          </TouchableOpacity>
        )}
      </View>

      {showStats ? (
        <View style={s.statsOverlay}>
          <TouchableOpacity
            style={s.statsBackdrop}
            onPress={() => {
              setShowStats(false);
            }}
          />
          <View style={[s.statsSheet, { paddingBottom: pwaSheetPaddingBottom }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Atividade do Story</Text>
            {loadingStats ? (
              <ActivityIndicator color="#C9A96E" />
            ) : (
              <View style={s.statsRow}>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{stats.views}</Text>
                  <Text style={s.statLabel}>Vistas</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{stats.likes}</Text>
                  <Text style={s.statLabel}>Curtidas</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{stats.shares}</Text>
                  <Text style={s.statLabel}>Compart.</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const imageStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  backgroundColor: "#000",
  display: "block",
  pointerEvents: "none",
  WebkitTransform: "translateZ(0)",
  transform: "translateZ(0)",
};

const videoStyle = {
  ...imageStyle,
};

const s = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    height: "100vh" as any,
    minHeight: "-webkit-fill-available" as any,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  mediaLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
    backgroundColor: "#050505",
  },
  fallbackTitle: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },
  fallbackText: {
    color: "#AAA",
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  closeCenter: {
    minHeight: 46,
    borderRadius: 8,
    marginTop: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C9A96E",
  },
  closeCenterText: {
    color: "#000",
    fontWeight: "900",
  },
  topShade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 130,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 4,
  },
  progressRow: {
    position: "absolute",
    top: "calc(8px + env(safe-area-inset-top))" as any,
    left: 10,
    right: 10,
    height: 3,
    zIndex: 16,
    flexDirection: "row",
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#FFF",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: "env(safe-area-inset-top)" as any,
    paddingHorizontal: 14,
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    flex: 1,
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
  },
  iconBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    flexDirection: "row",
  },
  touchHalf: {
    flex: 1,
  },
  caption: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 120,
    zIndex: 20,
    borderRadius: 8,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  captionText: {
    color: "#FFF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  sideActions: {
    position: "absolute",
    right: 14,
    bottom: 118,
    zIndex: 32,
    alignItems: "center",
    gap: 16,
  },
  sideButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  bottom: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 34,
    zIndex: 30,
    alignItems: "center",
  },
  adminBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  adminBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
  },
  agendarBtn: {
    width: "100%",
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#C9A96E",
  },
  agendarText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
  },
  statsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    justifyContent: "flex-end",
  },
  statsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  statsSheet: {
    minHeight: 220,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 34,
    backgroundColor: "#121212",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
    backgroundColor: "#555",
  },
  sheetTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statBox: {
    flex: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#1F1F1F",
  },
  statValue: {
    color: "#C9A96E",
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: "#CCC",
    fontSize: 12,
    marginTop: 4,
  },
});
