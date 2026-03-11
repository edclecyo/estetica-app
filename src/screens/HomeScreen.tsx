import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
  StatusBar, ScrollView, Dimensions,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import type { Estabelecimento } from '../types';

const { width } = Dimensions.get('window');

const TIPOS = ['Todos', 'Salão de Beleza', 'Barbearia Premium', 'Espaço de Unhas', 'Clínica Estética', 'Spa & Relaxamento'];

const TIPO_ICONS: Record<string, string> = {
  'Todos': '✦',
  'Salão de Beleza': '💇',
  'Barbearia Premium': '✂️',
  'Espaço de Unhas': '💅',
  'Clínica Estética': '🌿',
  'Spa & Relaxamento': '🧘',
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('Todos');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = firestore()
      .collection('estabelecimentos')
      .where('ativo', '==', true)
      .onSnapshot(snap => {
        const lista = snap.docs.map(doc => ({
          id: doc.id, ...doc.data()
        })) as Estabelecimento[];
        setEstabelecimentos(lista);
        setLoading(false);
      });
    return unsubscribe;
  }, []);

  const filtrados = estabelecimentos.filter(e => {
    const mb = e.nome.toLowerCase().includes(busca.toLowerCase());
    const mt = filtro === 'Todos' || e.tipo === filtro;
    return mb && mt;
  });

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color="#1A1A1A" />
        <Text style={s.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.headerSub}>Bem-vindo 👋</Text>
            <Text style={s.headerTitulo}>Encontre seu espaço</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('AdminLogin')}
            style={s.adminBtn}>
            <Text style={s.adminBtnText}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* Busca */}
        <View style={s.buscaWrap}>
          <Text style={s.buscaIcon}>🔍</Text>
          <TextInput
            style={s.buscaInput}
            placeholder="Buscar salão, serviço..."
            placeholderTextColor="#999"
            value={busca}
            onChangeText={setBusca}
          />
          {busca.length > 0 && (
            <TouchableOpacity onPress={() => setBusca('')}>
              <Text style={s.buscaClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filtros */}
      <View style={s.filtroWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtroScroll}>
          {TIPOS.map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setFiltro(t)}
              style={[s.chip, filtro === t && s.chipAtivo]}>
              <Text style={s.chipIcon}>{TIPO_ICONS[t] || '✦'}</Text>
              <Text style={[s.chipText, filtro === t && s.chipTextAtivo]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Lista */}
      <FlatList
        data={filtrados}
        keyExtractor={e => e.id}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={s.resultadoText}>
            {filtrados.length} {filtrados.length === 1 ? 'resultado' : 'resultados'}
          </Text>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>🔍</Text>
            <Text style={s.emptyTitulo}>Nenhum resultado</Text>
            <Text style={s.emptySub}>Tente buscar por outro termo</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.92}
            onPress={() => navigation.navigate('Detalhe', { estabelecimentoId: item.id })}>

            {/* Topo colorido */}
            <View style={[s.cardHeader, { backgroundColor: item.cor + '33' }]}>
              <Text style={s.cardEmoji}>{item.img}</Text>
              <View style={s.cardBadge}>
                <Text style={s.cardBadgeText}>★ {item.avaliacao}</Text>
              </View>
            </View>

            {/* Corpo */}
            <View style={s.cardBody}>
              <View style={s.cardRow}>
                <Text style={s.cardNome} numberOfLines={1}>{item.nome}</Text>
                {item.servicos?.filter(sv => sv.ativo).length > 0 && (
                  <Text style={s.cardPreco}>
                    R${Math.min(...item.servicos.filter(sv => sv.ativo).map(sv => sv.preco))}+
                  </Text>
                )}
              </View>

              <Text style={s.cardTipo}>{item.tipo}</Text>

              <View style={s.cardFooter}>
                <View style={s.cardTag}>
                  <Text style={s.cardTagText}>📍 {item.cidade || item.endereco}</Text>
                </View>
                <View style={s.cardTag}>
                  <Text style={s.cardTagText}>
                    {item.servicos?.filter(sv => sv.ativo).length || 0} serviços
                  </Text>
                </View>
                {item.horarioFuncionamento && (
                  <View style={s.cardTag}>
                    <Text style={s.cardTagText}>🕐 {item.horarioFuncionamento}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Botão */}
            <View style={[s.cardBtn, { backgroundColor: item.cor }]}>
              <Text style={s.cardBtnText}>Agendar →</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
  loadingText: { marginTop: 12, color: '#888', fontSize: 13 },

  // Header
  header: { backgroundColor: '#1A1A1A', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerSub: { color: '#C9A96E', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  headerTitulo: { color: '#FAF7F4', fontSize: 22, fontWeight: '700' },
  adminBtn: { backgroundColor: '#2A2A2A', borderRadius: 12, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  adminBtnText: { fontSize: 18 },

  // Busca
  buscaWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2A', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  buscaIcon: { fontSize: 16, marginRight: 8 },
  buscaInput: { flex: 1, color: '#FAF7F4', fontSize: 14, paddingVertical: 10 },
  buscaClear: { color: '#666', fontSize: 16, padding: 4 },

  // Filtros
  filtroWrap: { backgroundColor: '#1A1A1A', paddingBottom: 16 },
  filtroScroll: { paddingHorizontal: 20, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2A2A2A' },
  chipAtivo: { backgroundColor: '#C9A96E' },
  chipIcon: { fontSize: 13 },
  chipText: { fontSize: 12, color: '#888', fontWeight: '500' },
  chipTextAtivo: { color: '#1A1A1A', fontWeight: '700' },

  // Lista
  lista: { padding: 16, paddingBottom: 32 },
  resultadoText: { color: '#999', fontSize: 12, marginBottom: 12, marginLeft: 2 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 20, marginBottom: 16, overflow: 'hidden', elevation: 2 },
  cardHeader: { padding: 20, alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  cardEmoji: { fontSize: 44 },
  cardBadge: { backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  cardBadgeText: { color: '#C9A96E', fontSize: 12, fontWeight: '700' },
  cardBody: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardNome: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', flex: 1, marginRight: 8 },
  cardPreco: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  cardTipo: { fontSize: 12, color: '#888', marginBottom: 10 },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardTag: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  cardTagText: { fontSize: 11, color: '#666' },
  cardBtn: { margin: 12, marginTop: 4, borderRadius: 12, padding: 12, alignItems: 'center' },
  cardBtnText: { color: '#1A1A1A', fontSize: 13, fontWeight: '700' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitulo: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#aaa' },
});