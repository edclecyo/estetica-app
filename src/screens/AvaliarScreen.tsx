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
  const { agendamentoId, estabelecimentoNome, estabelecimentoId } = route.params || {};

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
        status: 'concluido'
      });

      // 2 — Atualiza média e lógica de penalidade por avaliação negativa
      const estabRef = firestore().collection('estabelecimentos').doc(estabelecimentoId);
      
      await firestore().runTransaction(async tx => {
        const estabSnap = await tx.get(estabRef);
        if (!estabSnap.exists) return;

        const data = estabSnap.data()!;
        
        // Contadores básicos
        const totalAtual = data.totalAvaliacoes || 0;
        const somaNotasAtual = (data.avaliacao || 5) * totalAtual; 
        const novoTotal = totalAtual + 1;
        
        // Lógica de Negativas (1 ou 2 estrelas contam como negativo)
        let novasNegativas = data.avaliacoesNegativas || 0;
        if (estrelas <= 2) {
          novasNegativas += 1;
        }

        // Cálculo da média aritmética simples
        let novaMedia = (somaNotasAtual + estrelas) / novoTotal;

        // --- LÓGICA DE PENALIDADE ---
        // Se tiver 10, 20, 30... negativas, subtraímos 0.5 da média por cada "dezena"
        // Isso força a perda de estrelas visualmente
        const penalidade = Math.floor(novasNegativas / 10) * 0.5;
        novaMedia = novaMedia - penalidade;

        // Garante que a nota não seja menor que 1 nem maior que 5
        if (novaMedia < 1) novaMedia = 1;

        tx.update(estabRef, {
          avaliacao: Math.round(novaMedia * 10) / 10,
          totalAvaliacoes: novoTotal,
          avaliacoesNegativas: novasNegativas,
          ultimaAvaliacaoEm: firestore.FieldValue.serverTimestamp()
        });
      });

      Alert.alert('Obrigado! 🎉', 'Sua avaliação foi enviada!', [
        { text: 'OK', onPress: () => navigation.navigate('HomeTabs', { screen: 'Agendamentos' }) },
      ]);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível enviar a avaliação.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}>
          <Text style={s.voltarBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerSub}>AVALIAÇÃO</Text>
        <Text style={s.headerTitulo}>{estabelecimentoNome || 'Estabelecimento'}</Text>
      </View>

      <View style={s.body}>
        <View style={s.card}>
          <Text style={s.cardTitulo}>Como foi sua experiência?</Text>
          <View style={s.estrelasWrap}>
            {[1, 2, 3, 4, 5].map(i => (
              <TouchableOpacity 
                activeOpacity={0.7} 
                key={i} 
                onPress={() => setEstrelas(i)}
              >
                <Text style={[s.estrela, i <= estrelas && s.estrelaAtiva]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.estrelasLabel, estrelas > 0 && { color: estrelas <= 2 ? '#E76F51' : '#1A1A1A' }]}>
            {estrelas === 0 ? 'Toque para avaliar'
              : estrelas === 1 ? 'Muito Ruim 😞'
              : estrelas === 2 ? 'Ruim 😐'
              : estrelas === 3 ? 'Bom 🙂'
              : estrelas === 4 ? 'Muito bom 😊'
              : 'Excelente! 🤩'}
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitulo}>
            O que você mais gostou? {'\n'}
            <Text style={s.cardSub}>(Opcional)</Text>
          </Text>
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

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.btnPrimario, (estrelas === 0 || salvando) && s.btnDisabled]}
            disabled={estrelas === 0 || salvando}
            onPress={salvar}>
            {salvando
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnPrimarioText}>Enviar Avaliação</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity 
            style={s.btnSecundario} 
            onPress={() => navigation.goBack()}
          >
            <Text style={s.btnSecundarioText}>Agora não, voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { backgroundColor: '#1A1A1A', padding: 24, paddingTop: 52, alignItems: 'center' },
  voltarBtn: { position: 'absolute', top: 52, left: 20, backgroundColor: '#2A2A2A', borderRadius: 12, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  voltarBtnText: { color: '#fff', fontSize: 20 },
  headerSub: { color: '#C9A96E', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  headerTitulo: { color: '#FAF7F4', fontSize: 22, fontWeight: '800' },
  body: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, marginBottom: 16, elevation: 2 },
  cardTitulo: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 20, textAlign: 'center' },
  cardSub: { fontSize: 12, color: '#999', fontWeight: '400' },
  estrelasWrap: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 12 },
  estrela: { fontSize: 46, color: '#E9ECEF' },
  estrelaAtiva: { color: '#F4A261' },
  estrelasLabel: { textAlign: 'center', fontSize: 14, color: '#ADB5BD', fontWeight: '600' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  tag: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF' },
  tagAtiva: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  tagText: { fontSize: 13, color: '#495057', fontWeight: '500' },
  tagTextAtiva: { color: '#fff', fontWeight: '700' },
  footer: { marginTop: 8 },
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 12 },
  btnPrimarioText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecundario: { borderRadius: 18, padding: 16, alignItems: 'center', marginBottom: 40 },
  btnSecundarioText: { color: '#ADB5BD', fontSize: 14, fontWeight: '600' },
  btnDisabled: { backgroundColor: '#DEE2E6' },
});