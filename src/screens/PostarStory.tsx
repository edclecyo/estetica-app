import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Dimensions
} from "react-native";

import { launchImageLibrary } from "react-native-image-picker";
import storage from "@react-native-firebase/storage";
import firestore from "@react-native-firebase/firestore";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useAuth } from "../contexts/AuthContext";
import Video from 'react-native-video'; 

const { width } = Dimensions.get("window");

export default function PostarStory() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { admin } = useAuth();

  const [estabId, setEstabId] = useState(route.params?.estabelecimentoId || "");
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!estabId && admin?.id) {
      const fetchId = async () => {
        try {
          const snap = await firestore()
            .collection('estabelecimentos')
            .where('adminId', '==', admin.id)
            .limit(1)
            .get();
          
          if (!snap.empty) {
            setEstabId(snap.docs[0].id);
          }
        } catch (error) {
          console.error("Erro ao buscar estabelecimento:", error);
        }
      };
      fetchId();
    }
  }, [admin?.id]);

  const escolherMidia = async () => {
    const res = await launchImageLibrary({
      mediaType: "mixed", 
      quality: 0.8,
      videoQuality: 'high',
    });

    if (res.assets && res.assets.length > 0) {
      const asset = res.assets[0];
      setMediaUri(asset.uri || null);
      setMediaType(asset.type?.includes('video') ? 'video' : 'image');
    }
  };

  const postarStory = async () => {
    if (!mediaUri) {
      Alert.alert("Atenção", "Selecione uma mídia antes de publicar.");
      return;
    }

    if (!estabId) {
      Alert.alert("Erro", "ID do estabelecimento não encontrado.");
      return;
    }

    setUploading(true);

    try {
      const estabDoc = await firestore().collection('estabelecimentos').doc(estabId).get();
      const dadosEstab = estabDoc.data();
      
      const nomeFinal = dadosEstab?.nome || admin?.nome || "Empresa";
      const fotoPerfilFinal = dadosEstab?.fotoPerfil || dadosEstab?.capa || admin?.fotoPerfil || "";

      const ext = mediaType === 'video' ? 'mp4' : 'jpg';
      const fileName = `story_${estabId}_${Date.now()}.${ext}`;
      const ref = storage().ref(`stories/${estabId}/${fileName}`);
      
      await ref.putFile(mediaUri);
      const urlBaixada = await ref.getDownloadURL();
      
      const agora = firestore.Timestamp.now();

      await firestore()
        .collection("stories")
        .add({
          adminId: admin?.id || "",        
          estabelecimentoId: estabId,      
          url: urlBaixada,                  
          imagem: urlBaixada, 
          type: mediaType, 
          nome: nomeFinal,                  
          nomeAdmin: nomeFinal,            
          avatar: fotoPerfilFinal,         
          ativo: true,                      
          visto: false,                    
          timestamp: agora,                
          createdAt: Date.now(),           
          expiresAt: Date.now() + 86400000, 
          views: 0,
          likesCount: 0,
        });

      Alert.alert("Sucesso!", "Story publicado!");
      navigation.goBack();
    } catch (e) {
      console.error("Erro ao postar:", e);
      Alert.alert("Erro", "Não foi possível publicar seu story.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Novo Story</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.content}>
        <TouchableOpacity 
          style={[s.previewCard, !mediaUri && s.previewEmpty]} 
          onPress={escolherMidia}
          activeOpacity={0.8}
        >
          {mediaUri ? (
            mediaType === 'video' ? (
              <Video 
                source={{ uri: mediaUri }} 
                style={s.previewImg} 
                resizeMode="cover"
                paused={false}
                repeat={true}
                muted={true}
              />
            ) : (
              <Image source={{ uri: mediaUri }} style={s.previewImg} />
            )
          ) : (
            <View style={s.placeholder}>
              <View style={s.iconCircle}>
                <Text style={s.iconText}>🎥</Text>
              </View>
              <Text style={s.placeholderTitle}>Fotos ou Vídeos</Text>
              <Text style={s.placeholderSub}>Toque para abrir a galeria</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={s.footer}>
          <Text style={s.hint}>Visível por 24 horas para seus clientes.</Text>
          <TouchableOpacity
            style={[s.postBtn, (!mediaUri || uploading) && s.btnDisabled]}
            onPress={postarStory}
            disabled={uploading || !mediaUri}
          >
            {uploading ? <ActivityIndicator color="#111" /> : <Text style={s.postText}>Publicar agora</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D0D0D" },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  headerTitle: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  content: { flex: 1, padding: 20, justifyContent: 'space-between' },
  previewCard: { width: '100%', height: width * 1.3, borderRadius: 24, overflow: 'hidden', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333' },
  previewEmpty: { borderStyle: 'dashed', borderColor: '#4CAF50', borderWidth: 2 },
  previewImg: { width: '100%', height: '100%' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(76, 175, 80, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  iconText: { fontSize: 32 },
  placeholderTitle: { color: '#4CAF50', fontSize: 18, fontWeight: '700' },
  placeholderSub: { color: '#666', fontSize: 14, marginTop: 5 },
  footer: { gap: 20, marginBottom: 10 },
  hint: { color: '#555', fontSize: 12, textAlign: 'center' },
  postBtn: { backgroundColor: "#4CAF50", padding: 20, borderRadius: 18, alignItems: "center" },
  btnDisabled: { backgroundColor: '#333' },
  postText: { color: "#111", fontWeight: "800", fontSize: 16, textTransform: 'uppercase' }
});