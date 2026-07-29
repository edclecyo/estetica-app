import React, { useEffect, useMemo, useState } from "react";
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

  const storiesFiltrados = useMemo(
    () => stories.filter((s: any) => s && s.id),
    [stories]
  );
  const story = storiesFiltrados[index] || storyDireto;
  const mediaUri = getStoryMediaUri(story);
  const storyType = getStoryType(story);
  const user = auth().currentUser;
  const isAdmin = user?.uid === story?.adminId;

  useEffect(() => {
    setMediaError(false);
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

  const fechar = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("HomeTabs");
  };

  const abrirAgendamento = () => {
    if (!story?.estabelecimentoId) return;
    navigation.navigate(user ? "Detalhe" : "ClienteLogin", {
      estabelecimentoId: story.estabelecimentoId,
    });
  };

  const abrirStats = async () => {
    if (!story?.id || !isAdmin) return;
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

  const voltarStory = () => {
    if (index > 0) setIndex(index - 1);
  };

  const proximoStory = () => {
    if (index + 1 < storiesFiltrados.length) setIndex(index + 1);
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
        storyType === "video" ? (
          React.createElement("video" as any, {
            src: mediaUri,
            controls: true,
            autoPlay: true,
            playsInline: true,
            style: videoStyle,
            onError: () => setMediaError(true),
          })
        ) : (
          React.createElement("img" as any, {
            src: mediaUri,
            alt: story.caption || story.nome || "Story",
            decoding: "async",
            loading: "eager",
            style: imageStyle,
            onError: () => setMediaError(true),
          })
        )
      ) : (
        <View style={s.fallback}>
          <Ionicons name="image-outline" size={44} color="#C9A96E" />
          <Text style={s.fallbackTitle}>Story indisponivel</Text>
          <Text style={s.fallbackText}>Nao foi possivel carregar esta midia.</Text>
        </View>
      )}

      <View style={s.topShade} />
      <View style={s.header}>
        <Text style={s.title}>{story.nome || story.nomeAdmin || "Story"}</Text>
        <TouchableOpacity style={s.iconBtn} onPress={fechar}>
          <Ionicons name="close" size={30} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={s.touchLayer} pointerEvents="box-none">
        <TouchableOpacity style={s.touchHalf} onPress={voltarStory} />
        <TouchableOpacity style={s.touchHalf} onPress={proximoStory} />
      </View>

      {story.caption ? (
        <View style={s.caption}>
          <Text style={s.captionText}>{story.caption}</Text>
        </View>
      ) : null}

      <View style={s.bottom}>
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
          <TouchableOpacity style={s.statsBackdrop} onPress={() => setShowStats(false)} />
          <View style={s.statsSheet}>
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
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  backgroundColor: "#000",
};

const videoStyle = {
  ...imageStyle,
};

const s = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    minHeight: "100dvh" as any,
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
