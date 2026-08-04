import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function RotaMapaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { estabelecimentoNome, endereco, origem, destino } = route.params || {};
  const origemTexto = origem ? `${origem.lat},${origem.lng}` : '';
  const destinoTexto = destino ? `${destino.lat},${destino.lng}` : '';
  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origemTexto)}&destination=${encodeURIComponent(destinoTexto)}&travelmode=driving`;

  return (
    <View style={s.container}>
      {React.createElement('iframe', { src: url, title: 'Rota até o estabelecimento', style: s.iframe as any })}
      <View style={s.topo}>
        <TouchableOpacity style={s.voltar} onPress={() => navigation.goBack()}><Icon name="arrow-left" size={23} color="#fff" /></TouchableOpacity>
        <View style={s.info}><Text style={s.rotulo}>COMO CHEGAR</Text><Text style={s.nome}>{estabelecimentoNome || 'Estabelecimento'}</Text>{!!endereco && <Text style={s.endereco}>{endereco}</Text>}</View>
      </View>
      <TouchableOpacity style={s.botao} onPress={() => Linking.openURL(url)}><Text style={s.botaoTexto}>Abrir rota no Google Maps</Text></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' }, iframe: { position: 'absolute', borderWidth: 0, width: '100%', height: '100%' },
  topo: { position: 'absolute', top: 24, left: 18, right: 18, flexDirection: 'row', alignItems: 'center' }, voltar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' }, info: { flex: 1, marginLeft: 12, padding: 12, borderRadius: 15, backgroundColor: '#1A1A1A' }, rotulo: { color: '#C9A96E', fontSize: 10, fontWeight: '800' }, nome: { color: '#fff', fontWeight: '800', marginTop: 2 }, endereco: { color: '#ccc', fontSize: 12, marginTop: 2 }, botao: { position: 'absolute', bottom: 28, left: 20, right: 20, padding: 17, borderRadius: 16, alignItems: 'center', backgroundColor: '#C9A96E' }, botaoTexto: { color: '#000', fontWeight: '800' },
});
