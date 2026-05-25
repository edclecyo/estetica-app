import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import antesCabelo from '../../../../src/assets/ia_demo/antes_cabelo.png';
import depoisCabelo from '../../../../src/assets/ia_demo/depois_cabelo.png';
import antesMaquiagem from '../../../../src/assets/ia_demo/antes_maquiagem.png';
import depoisMaquiagem from '../../../../src/assets/ia_demo/depois_maquiagem.png';
import antesSobrancelha from '../../../../src/assets/ia_demo/antes_sobrancelha.png';
import depoisSobrancelha from '../../../../src/assets/ia_demo/depois_sobrancelha.png';

const GOLD = '#C9A96E';

const demos = {
  cabelo: { titulo: 'Cabelo', antes: antesCabelo, depois: depoisCabelo },
  maquiagem: { titulo: 'Maquiagem', antes: antesMaquiagem, depois: depoisMaquiagem },
  sobrancelha: { titulo: 'Sobrancelha', antes: antesSobrancelha, depois: depoisSobrancelha },
};

export default function IADemoScreen({ navigation }: any) {
  const [tipo, setTipo] = useState<keyof typeof demos>('cabelo');
  const demo = demos[tipo];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={s.back}>Voltar</Text>
      </TouchableOpacity>
      <Text style={s.title}>Previa IA para clientes</Text>
      <Text style={s.sub}>Gere previas realistas com IA antes do atendimento e aumente a confianca do cliente.</Text>
      <View style={s.chips}>
        {Object.keys(demos).map(k => (
          <TouchableOpacity key={k} onPress={() => setTipo(k as keyof typeof demos)} style={[s.chip, tipo === k && s.chipAtivo]}>
            <Text style={[s.chipText, tipo === k && s.chipTextAtivo]}>{demos[k as keyof typeof demos].titulo}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.compareRow}>
        <View style={s.imageBox}><Text style={s.imageLabel}>Antes</Text><Image source={{ uri: demo.antes }} style={s.image} /></View>
        <View style={s.imageBox}><Text style={s.imageLabel}>Depois IA</Text><Image source={{ uri: demo.depois }} style={s.image} /></View>
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>Como funciona</Text>
        <Text style={s.item}>1. Cliente escolhe uma foto</Text>
        <Text style={s.item}>2. Escolhe o tipo de servico</Text>
        <Text style={s.item}>3. A IA gera uma previa visual</Text>
        <Text style={s.item}>4. Cliente agenda com mais confianca</Text>
      </View>
      <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Assinatura')}>
        <Text style={s.btnText}>Ativar Previa IA</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 20, paddingBottom: 40 },
  back: { color: GOLD, fontWeight: '800', marginBottom: 18 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  sub: { color: '#888', fontSize: 14, lineHeight: 21, marginBottom: 20 },
  chips: { flexDirection: 'row', gap: 10, marginBottom: 18, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#1A1A1A' },
  chipAtivo: { backgroundColor: GOLD },
  chipText: { color: '#888', fontWeight: '800' },
  chipTextAtivo: { color: '#000' },
  compareRow: { flexDirection: 'row', gap: 12 },
  imageBox: { flex: 1, backgroundColor: '#111', borderRadius: 18, padding: 10 },
  imageLabel: { color: GOLD, fontWeight: '900', marginBottom: 8 },
  image: { width: '100%', aspectRatio: 0.75, borderRadius: 14 },
  card: { marginTop: 18, backgroundColor: '#111', borderRadius: 18, padding: 16 },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '900', marginBottom: 12 },
  item: { color: '#BBB', marginBottom: 8 },
  btn: { marginTop: 18, backgroundColor: GOLD, borderRadius: 16, padding: 16, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: '900' },
});
