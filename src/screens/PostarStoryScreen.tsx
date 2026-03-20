import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import storage from '@react-native-firebase/storage';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import Video from 'react-native-video';

export default function PostarStoryScreen() {
  const { admin } = useAuth();
  const navigation: any = useNavigation();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);

  const selecionarMidia = () => {
    // Alterado para 'mixed' para aceitar vídeo e foto
    launchImageLibrary({ mediaType: 'mixed', quality: 0.8 }, (response) => {
      if (response.didCancel) return;
      if (response.assets && response.assets[0].uri) {
        const asset = response.assets[0];
        setMediaUri(asset.uri);
        // Identifica se o que foi selecionado é vídeo ou imagem
        setMediaType(asset.type?.includes('video') ? 'video' : 'image');
      }
    });
  };

  const enviarStory = async () => {
    if (!mediaUri || !admin) return;

    setUploading(true);
    try {
      // 1. Definir extensão baseada no tipo
      const ext = mediaType === 'video' ? 'mp4' : 'jpg';
      const filename = `stories/${admin.id}_${Date.now()}.${ext}`;
      const reference = storage().ref(filename);
      
      // Upload para o Storage
      await reference.putFile(mediaUri);
      const url = await reference.getDownloadURL();

      // 2. Salvar no Firestore com os campos ATUALIZADOS
      await firestore().collection('stories').add({
        adminId: admin.id,
        estabelecimentoId: admin.id, // Garante o agrupamento correto no Header
        nomeAdmin: admin.nome,
        nome: admin.nome,      
        avatar: admin.fotoPerfil || '', // Importante para o StoriesHeader
        url: url,              
        imagem: url,           
        type: mediaType,       // Salva se é 'video' ou 'image'
        likesCount: 0,
        views: 0,
        visto: false,          // NOVO: Começa como falso para a borda ficar verde
        ativo: true,           
        timestamp: firestore.Timestamp.now(), 
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000, // 24 horas
      });

      Alert.alert("Sucesso!", "Seu story foi publicado.");
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Erro", "Não foi possível postar o story.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={st.voltar}>Voltar</Text>
        </TouchableOpacity>
        <Text style={st.titulo}>Novo Story</Text>
        <View style={{ width: 40 }} />
      </View>

      <TouchableOpacity style={st.previewContainer} onPress={selecionarMidia}>
        {mediaUri ? (
          mediaType === 'video' ? (
            <Video 
              source={{ uri: mediaUri }} 
              style={st.preview} 
              resizeMode="cover"
              paused={false}
              repeat={true}
              muted={true}
            />
          ) : (
            <Image source={{ uri: mediaUri }} style={st.preview} />
          )
        ) : (
          <Text style={st.placeholder}>Clique para selecionar foto ou vídeo 📸🎥</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={[st.btnEnviar, (!mediaUri || uploading) && { opacity: 0.5 }]} 
        onPress={enviarStory}
        disabled={!mediaUri || uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#1A1A1A" />
        ) : (
          <Text style={st.btnTexto}>Publicar Agora</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40, alignItems: 'center' },
  voltar: { color: '#C9A96E', fontSize: 16 },
  titulo: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  previewContainer: { 
    flex: 1, 
    backgroundColor: '#333', 
    borderRadius: 20, 
    marginVertical: 30, 
    justifyContent: 'center', 
    alignItems: 'center', 
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#444'
  },
  preview: { width: '100%', height: '100%' },
  placeholder: { color: '#666', fontSize: 16, textAlign: 'center', paddingHorizontal: 20 },
  btnEnviar: { backgroundColor: '#C9A96E', padding: 18, borderRadius: 15, alignItems: 'center' },
  btnTexto: { color: '#1A1A1A', fontWeight: '800', fontSize: 16 }
});