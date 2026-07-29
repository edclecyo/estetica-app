import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// Chave única por usuário para não vazar entre contas
const getChaveStorage = (uid: string) => `stories_vistos_${uid}`;
const STORIES_PAGE_SIZE = 36;

const criarConsultaStories = (cursor?: any) => {
  const consulta = firestore()
    .collection('stories')
    .where('ativo', '==', true)
    .orderBy('timestamp', 'desc')
    .limit(STORIES_PAGE_SIZE);

  return cursor ? consulta.startAfter(cursor) : consulta;
};

const agruparStoriesAtivos = (stories: any[]) => {
  const dataLimite = Date.now() - 24 * 60 * 60 * 1000;

  const ativos = stories.filter((item) => {
    const time = item.timestamp?.seconds
      ? item.timestamp.seconds * 1000
      : (item.createdAt || 0);

    return time > dataLimite;
  });

  const grupos = ativos.reduce((acc: any, curr: any) => {
    const idEstab = curr.estabelecimentoId || curr.adminId;

    if (!idEstab) return acc;

    if (!acc[idEstab]) {
      acc[idEstab] = { ...curr, todosOsStories: [] };
    }

    acc[idEstab].todosOsStories.push(curr);
    return acc;
  }, {});

  return Object.values(grupos) as any[];
};

export default function StoriesHeader() {
  const navigation = useNavigation<any>();
  const [stories, setStories] = useState<any[]>([]);
  const [ultimoStory, setUltimoStory] = useState<any>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMaisStories, setTemMaisStories] = useState(true);
  // ✅ IDs dos stories já vistos, por usuário
  const [storyIdsVistos, setStoryIdsVistos] = useState<Set<string>>(new Set());
  const uid = auth().currentUser?.uid;
  const storiesAgrupados = useMemo(
    () => agruparStoriesAtivos(stories),
    [stories]
  );

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
    let ativo = true;

    const carregarPrimeiraPagina = async () => {
      setCarregandoMais(true);

      try {
        const snap = await criarConsultaStories().get();

        if (!ativo) return;

        setStories(
          snap.docs.map(d => ({ id: d.id, ...d.data() }))
        );
        setUltimoStory(snap.docs[snap.docs.length - 1] || null);
        setTemMaisStories(snap.size === STORIES_PAGE_SIZE);
      } catch (err) {
        console.error('Erro ao carregar stories:', err);
      } finally {
        if (ativo) setCarregandoMais(false);
      }
    };

    carregarPrimeiraPagina();

    return () => {
      ativo = false;
    };
  }, []);

  const carregarMaisStories = useCallback(async () => {
    if (carregandoMais || !temMaisStories || !ultimoStory) return;

    setCarregandoMais(true);

    try {
      const snap = await criarConsultaStories(ultimoStory).get();
      const novos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      setStories(prev => {
        const carregados = new Set(prev.map(item => item.id));

        return [
          ...prev,
          ...novos.filter(item => !carregados.has(item.id)),
        ];
      });

      setUltimoStory(snap.docs[snap.docs.length - 1] || ultimoStory);
      setTemMaisStories(snap.size === STORIES_PAGE_SIZE);
    } catch (err) {
      console.error('Erro ao paginar stories:', err);
    } finally {
      setCarregandoMais(false);
    }
  }, [carregandoMais, temMaisStories, ultimoStory]);

  if (storiesAgrupados.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.titulo}>Novidades</Text>
      <FlatList
        data={storiesAgrupados}
        horizontal
        showsHorizontalScrollIndicator={false}
        onEndReached={carregarMaisStories}
        onEndReachedThreshold={0.4}
        keyExtractor={item => item.estabelecimentoId || item.adminId}
        ListFooterComponent={
          carregandoMais ? (
            <View style={s.loadingMore}>
              <ActivityIndicator size="small" color="#C9A96E" />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          // ✅ Verifica por storyId no AsyncStorage local, não no Firestore
          const temNaoVisto = item.todosOsStories.some(
            (st: any) => !storyIdsVistos.has(st.id)
          );
          const corBorda = temNaoVisto ? '#4CAF50' : '#444';

          return (
            <TouchableOpacity
              style={s.storyItem}
              onPress={() => {
                if (!uid) {
                  Alert.alert(
                    'Entre para ver stories',
                    'Voce pode ver as novidades na lista, mas precisa entrar para abrir os stories.',
                    [
                      { text: 'Agora nao', style: 'cancel' },
                      {
                        text: 'Entrar',
                        onPress: () => navigation.navigate('ClienteLogin'),
                      },
                    ]
                  );
                  return;
                }

                navigation.navigate('StoryView', {
                stories: item.todosOsStories,
                startIndex: 0,
                onVisto: marcarComoVisto, // ✅ passa callback para o StoryView
              });
              }}
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
  loadingMore: { width: 42, justifyContent: 'center', alignItems: 'center' },
});
