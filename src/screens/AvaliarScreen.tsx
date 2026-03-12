import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation, useRoute } from '@react-navigation/native';

const TAGS = [
  '👏 Ótimo atendimento',
  '⏰ Pontual',
  '✨ Ambiente limpo',
  '💰 Preço justo',
  '😊 Profissional simpático',
  '🎯 Resultado perfeito',
  '📱 Fácil de agendar',
  '🔄 Voltarei mais vezes',
];

export default function AvaliarScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { agendamentoId, estabelecimentoNome, estabelecimentoId } = route.params;

  const [estrelas, setEstrelas] = useState(0);
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const toggleTag = (tag: string) => {
    setTagsSel(p =>
      p.includes(tag) ? p.filter(t => t !== tag) : [...p, tag]
    );
  };

  const salvar = async () => {
    if (estrelas === 0) {
      Alert.alert('Atenção', 'Selecione pelo menos uma estrela!');
      return;
    }
    try {
      setSalvando(true);

      // 1 — Salva avaliação no agendamento
      await firestore().collection('agendamentos').doc(agendamentoId).update({
        avaliacao: {
          estrelas,
          tags: tagsSel,
          criadoEm: firestore.FieldValue.serverTimestamp(),
        },
      });

      // 2 — Atualiza média do estabelecimento
      const estabRef = firestore().collection('estabelecimentos').doc(estabelecimentoId);
      await firestore().runTransaction(async tx => {
        const estabSnap = await tx.get(estabRef);
        if (!estabSnap.exists) return;

        const data = estabSnap.data()!;
        const totalAtual = data.totalAvaliacoes || 0;
        const mediaAtual = data.avaliacao || 0;
        const novoTotal = totalAtual + 1;
        const novaMedia = ((mediaAtual * totalAtual) + estrelas) / novoTotal;

        tx.update(estabRef, {
          avaliacao: Math.round(novaMedia * 10) / 10,
          totalAvaliacoes: novoTotal,
        });
      });

      Alert.alert('Obrigado! 🎉', 'Sua avaliação foi enviada!', [
  { text: 'OK', onPress: () => navigation.navigate('HomeTabs', { screen: 'Agendamentos' }) },
]);
    } catch (e: any) {
      Alert.alert('Erro', 'Não foi possível enviar a avaliação.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}>
          <Text style={s.voltarBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitulo}>Avaliar</Text>
        <Text style={s.headerSub}>{estabelecimentoNome}</Text>
      </View>

      <View style={s.body}>
        {/* Estrelas */}
        <View style={s.card}>
          <Text style={s.cardTitulo}>Como foi sua experiência?</Text>
          <View style={s.estrelasWrap}>
            {[1, 2, 3, 4, 5].map(i => (
              <TouchableOpacity key={i} onPress={() => setEstrelas(i)}>
                <Text style={[s.estrela, i <= estrelas && s.estrelaAtiva]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.estrelasLabel}>
            {estrelas === 0 ? 'Toque para avaliar'
              : estrelas === 1 ? 'Ruim 😞'
              : estrelas === 2 ? 'Regular 😐'
              : estrelas === 3 ? 'Bom 🙂'
              : estrelas === 4 ? 'Muito bom 😊'
              : 'Excelente! 🤩'}
          </Text>
        </View>

        {/* Tags */}
        <View style={s.card}>
          <Text style={s.cardTitulo}>O que você achou? <Text style={s.cardSub}>(opcional)</Text></Text>
          <View style={s.tagsWrap}>
            {TAGS.map(tag => (
              <TouchableOpacity
                key={tag}
                onPress={() => toggleTag(tag)}
                style={[s.tag, tagsSel.includes(tag) && s.tagAtiva]}>
                <Text style={[s.tagText, tagsSel.includes(tag) && s.tagTextAtiva]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Resumo */}
        {estrelas > 0 && (
          <View style={s.resumo}>
            <View style={s.resumoEstrelas}>
              {[1, 2, 3, 4, 5].map(i => (
                <Text key={i} style={[s.resumoEstrela, i <= estrelas && { color: '#F4A261' }]}>★</Text>
              ))}
            </View>
            {tagsSel.length > 0 && (
              <Text style={s.resumoTags}>{tagsSel.join(' · ')}</Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[s.btnPrimario, estrelas === 0 && s.btnDisabled]}
          disabled={estrelas === 0 || salvando}
          onPress={salvar}>
          {salvando
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnPrimarioText}>Enviar Avaliação →</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.btnSecundario} onPress={() => navigation.navigate('Agendamentos')}>
          <Text style={s.btnSecundarioText}>Agora não</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { backgroundColor: '#1A1A1A', padding: 24, paddingTop: 52, alignItems: 'center' },
  voltarBtn: { position: 'absolute', top: 52, left: 20, backgroundColor: '#2A2A2A', borderRadius: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  voltarBtnText: { color: '#fff', fontSize: 18 },
  headerTitulo: { color: '#FAF7F4', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  headerSub: { color: '#C9A96E', fontSize: 13 },
  body: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, elevation: 1 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 16, textAlign: 'center' },
  cardSub: { fontSize: 12, color: '#aaa', fontWeight: '400' },
  estrelasWrap: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 },
  estrela: { fontSize: 44, color: '#E0E0E0' },
  estrelaAtiva: { color: '#F4A261' },
  estrelasLabel: { textAlign: 'center', fontSize: 14, color: '#888', fontWeight: '500' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: '#E0E0E0' },
  tagAtiva: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  tagText: { fontSize: 13, color: '#555' },
  tagTextAtiva: { color: '#fff', fontWeight: '600' },
  resumo: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center' },
  resumoEstrelas: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  resumoEstrela: { fontSize: 20, color: '#E0E0E0' },
  resumoTags: { fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 18 },
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnPrimarioText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSecundario: { borderWidth: 2, borderColor: '#E0E0E0', borderRadius: 16, padding: 14, alignItems: 'center', marginBottom: 30 },
  btnSecundarioText: { color: '#999', fontSize: 14 },
  btnDisabled: { backgroundColor: '#ccc' },
});