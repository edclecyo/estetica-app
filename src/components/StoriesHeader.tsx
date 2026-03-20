import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

// IMPORTAÇÕES MODULARES (Novo padrão)
import firestore, { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from '@react-native-firebase/firestore';

export default function StoriesHeader() {
  const navigation = useNavigation<any>();
  const [storiesAgrupados, setStoriesAgrupados] = useState<any[]>([]);

  useEffect(() => {
    const dataLimite = Date.now() - (24 * 60 * 60 * 1000);

    // 1. Criamos a referência da coleção
    const collectionRef = collection(firestore(), 'stories');

    // 2. Criamos a query usando a função query()
    const q = query(
      collectionRef,
      where('ativo', '==', true),
      orderBy('timestamp', 'desc')
    );

    // 3. Usamos o onSnapshot modular
    const unsub = onSnapshot(q, (snap) => {
      if (!snap) return;

      const todosOsDados = snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data() 
      })) as any[];

      const dadosFiltrados = todosOsDados.filter((item) => {
        const time = item.timestamp?.seconds ? item.timestamp.seconds * 1000 : (item.createdAt || 0);
        return time > dataLimite;
      });

      const grupos = dadosFiltrados.reduce((acc: any, curr: any) => {
        const idEstab = curr.estabelecimentoId || curr.adminId;
        if (!idEstab) return acc;

        if (!acc[idEstab]) {
          acc[idEstab] = {
            ...curr,
            todosOsStories: [] 
          };
        }
        acc[idEstab].todosOsStories.push(curr);
        return acc;
      }, {});

      setStoriesAgrupados(Object.values(grupos));
    }, err => {
      console.error("Erro ao escutar stories:", err);
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
        keyExtractor={item => (item.estabelecimentoId || item.adminId)} 
        renderItem={({ item }) => {
          const temNaoVisto = item.todosOsStories.some((st: any) => st.visto === false);
          const corBorda = temNaoVisto ? '#4CAF50' : '#444'; 

          return (
            <TouchableOpacity 
              style={s.storyItem}
              onPress={() => navigation.navigate('StoryView', { 
                stories: item.todosOsStories,    
                startIndex: 0    
              })}
            >
              <View style={[s.bordaColorida, { backgroundColor: corBorda }]}>
                <View style={s.fundoIcone}>
                  <Image source={{ uri: item.avatar || item.imagem }} style={s.fotoCirculo} />
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

// ... Estilos (s) permanecem os mesmos
const s = StyleSheet.create({
  container: { paddingVertical: 15 },
  titulo: { fontSize: 14, fontWeight: '800', color: '#FFF', marginLeft: 20, marginBottom: 10 },
  storyItem: { alignItems: 'center', marginRight: 15, width: 70 },
  bordaColorida: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center' },
  fundoIcone: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#333', overflow: 'hidden', borderWidth: 3, borderColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fotoCirculo: { width: '100%', height: '100%' },
  nomeAdmin: { fontSize: 11, marginTop: 5, fontWeight: '600', textAlign: 'center' }
});