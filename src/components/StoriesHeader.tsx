import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore, {
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from '@react-native-firebase/firestore';

// Chave única por usuário para não vazar entre contas
const getChaveStorage = (uid: string) => `stories_vistos_${uid}`;

export default function StoriesHeader() {
  const navigation = useNavigation<any>();
  const [storiesAgrupados, setStoriesAgrupados] = useState<any[]>([]);
  // ✅ IDs dos stories já vistos, por usuário
  const [storyIdsVistos, setStoryIdsVistos] = useState<Set<string>>(new Set());
  const uid = auth().currentUser?.uid;

  // ✅ Carrega os vistos do AsyncStorage ao montar ou trocar de usuário
  useEffect(() => {
    const carregar = async () => {
      if (!uid) {
        setStoryIdsVistos(new Set()); // sem login = nenhum visto
        return;
      }
      try {
        const salvo = await AsyncStorage.getItem(getChaveStorage(uid));
        const ids: string[] = salvo ? JSON.parse(salvo) : [];
        setStoryIdsVistos(new Set(ids));
      } catch {
        setStoryIdsVistos(new Set());
      }
    };
    carregar();
  }, [uid]);

  // ✅ Chamado pelo StoryView ao terminar de ver um story
  const marcarComoVisto = useCallback(async (storyId: string) => {
    if (!uid) return;
    setStoryIdsVistos(prev => {
      const novo = new Set(prev);
      novo.add(storyId);
      // Salva no AsyncStorage de forma assíncrona
      AsyncStorage.setItem(getChaveStorage(uid), JSON.stringify([...novo])).catch(() => {});
      return novo;
    });
  }, [uid]);

  useEffect(() => {
    const dataLimite = Date.now() - 24 * 60 * 60 * 1000;
    const collectionRef = collection(firestore(), 'stories');
    const q = query(
      collectionRef,
      where('ativo', '==', true),
      orderBy('timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap) return;

      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const filtrados = todos.filter((item) => {
        const time = item.timestamp?.seconds
          ? item.timestamp.seconds * 1000
          : (item.createdAt || 0);
        return time > dataLimite;
      });

      const grupos = filtrados.reduce((acc: any, curr: any) => {
        const idEstab = curr.estabelecimentoId || curr.adminId;
        if (!idEstab) return acc;
        if (!acc[idEstab]) {
          acc[idEstab] = { ...curr, todosOsStories: [] };
        }
        acc[idEstab].todosOsStories.push(curr);
        return acc;
      }, {});

      setStoriesAgrupados(Object.values(grupos));
    }, err => {
      console.error('Erro ao escutar stories:', err);
    });

    return unsub;
  }, []);

  if (storiesAgrupados.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.titulo}>Novidades</Text>
      <FlatList
        data={storiesAgrupados}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.estabelecimentoId || item.adminId}
        renderItem={({ item }) => {
          // ✅ Verifica por storyId no AsyncStorage local, não no Firestore
          const temNaoVisto = item.todosOsStories.some(
            (st: any) => !storyIdsVistos.has(st.id)
          );
          const corBorda = temNaoVisto ? '#4CAF50' : '#444';

          return (
            <TouchableOpacity
              style={s.storyItem}
              onPress={() => navigation.navigate('StoryView', {
                stories: item.todosOsStories,
                startIndex: 0,
                onVisto: marcarComoVisto, // ✅ passa callback para o StoryView
              })}
            >
              <View style={[s.bordaColorida, { backgroundColor: corBorda }]}>
                <View style={s.fundoIcone}>
                  <Image
                    source={{ uri: item.avatar || item.imagem }}
                    style={s.fotoCirculo}
                  />
                </View>
              </View>
              <Text style={[s.nomeAdmin, { color: temNaoVisto ? '#FFF' : '#888' }]}>
                {item.nome?.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingVertical: 15 },
  titulo: { fontSize: 14, fontWeight: '800', color: '#FFF', marginLeft: 20, marginBottom: 10 },
  storyItem: { alignItems: 'center', marginRight: 15, width: 70 },
  bordaColorida: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center' },
  fundoIcone: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#333', overflow: 'hidden', borderWidth: 3, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fotoCirculo: { width: '100%', height: '100%' },
  nomeAdmin: { fontSize: 11, marginTop: 5, fontWeight: '600', textAlign: 'center' },
});