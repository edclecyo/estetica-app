import React from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type Coordenada = { lat: number; lng: number };

function criarUrlRota(origem: Coordenada, destino: Coordenada) {
  const origemTexto = `${origem.lat},${origem.lng}`;
  const destinoTexto = `${destino.lat},${destino.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origemTexto)}&destination=${encodeURIComponent(destinoTexto)}&travelmode=driving`;
}

export default function RotaMapaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { estabelecimentoNome, endereco, origem, destino } = route.params || {};

  if (!origem || !destino) {
    return (
      <View style={s.erro}>
        <Text style={s.erroTexto}>Não foi possível carregar a rota.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.voltarErro}>
          <Text style={s.voltarErroTexto}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const urlRota = criarUrlRota(origem, destino);
  const abrirNoMaps = () => Linking.openURL(urlRota).catch(() => undefined);
  const latitudeDelta = Math.max(Math.abs(Number(origem.lat) - Number(destino.lat)) * 2.6, 0.02);
  const longitudeDelta = Math.max(Math.abs(Number(origem.lng) - Number(destino.lng)) * 2.6, 0.02);
  const region = {
    latitude: (Number(origem.lat) + Number(destino.lat)) / 2,
    longitude: (Number(origem.lng) + Number(destino.lng)) / 2,
    latitudeDelta,
    longitudeDelta,
  };
  const pontos = [
    { latitude: Number(origem.lat), longitude: Number(origem.lng) },
    { latitude: Number(destino.lat), longitude: Number(destino.lng) },
  ];

  return (
    <View style={s.container}>
      <MapView
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        style={s.mapa}
      >
        <Marker coordinate={pontos[0]} title="Sua localização" pinColor="#1A1A1A" />
        <Marker coordinate={pontos[1]} title={estabelecimentoNome || 'Estabelecimento'} description={endereco || undefined} pinColor="#C9A96E" />
        <Polyline coordinates={pontos} strokeColor="#C9A96E" strokeWidth={5} />
      </MapView>

      <View style={s.topo} pointerEvents="box-none">
        <TouchableOpacity
          style={s.voltar}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Icon name="arrow-left" size={23} color="#fff" />
        </TouchableOpacity>

        <View style={s.info}>
          <Text style={s.rotulo}>COMO CHEGAR</Text>
          <Text style={s.nome} numberOfLines={1}>{estabelecimentoNome || 'Estabelecimento'}</Text>
          {!!endereco && <Text style={s.endereco} numberOfLines={1}>{endereco}</Text>}
        </View>
      </View>

      <TouchableOpacity style={s.botaoMaps} onPress={abrirNoMaps} activeOpacity={0.84}>
        <Icon name={Platform.OS === 'ios' ? 'map-outline' : 'google-maps'} size={19} color="#000" />
        <Text style={s.botaoMapsTexto}>Abrir no Google Maps</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  mapa: { flex: 1 },
  topo: { position: 'absolute', top: 50, left: 18, right: 18, flexDirection: 'row', alignItems: 'center' },
  voltar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', elevation: 5 },
  info: { flex: 1, marginLeft: 12, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 15, backgroundColor: 'rgba(26,26,26,0.96)', elevation: 5 },
  rotulo: { color: '#C9A96E', fontSize: 10, letterSpacing: 1.3, fontWeight: '800' },
  nome: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 2 },
  endereco: { color: '#C8C8C8', fontSize: 12, marginTop: 2 },
  botaoMaps: { position: 'absolute', left: 20, right: 20, bottom: 28, minHeight: 54, borderRadius: 16, backgroundColor: '#C9A96E', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, elevation: 6 },
  botaoMapsTexto: { color: '#000', fontSize: 15, fontWeight: '800' },
  erro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', padding: 24 },
  erroTexto: { color: '#fff', fontSize: 16, marginBottom: 16 },
  voltarErro: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: '#C9A96E' },
  voltarErroTexto: { color: '#000', fontWeight: '800' },
});
