import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';

const GOLD = '#C9A96E';

const demos = {
  cabelo: {
    titulo: 'Cabelo',
    antes: require('../assets/ia_demo/antes_cabelo.png'),
    depois: require('../assets/ia_demo/depois_cabelo.png'),
  },
  maquiagem: {
    titulo: 'Maquiagem',
    antes: require('../assets/ia_demo/antes_maquiagem.png'),
    depois: require('../assets/ia_demo/depois_maquiagem.png'),
  },
  sobrancelha: {
    titulo: 'Sobrancelha',
    antes: require('../assets/ia_demo/antes_sobrancelha.png'),
    depois: require('../assets/ia_demo/depois_sobrancelha.png'),
  },
};

export default function IADemoScreen({ navigation }: any) {
  const [tipo, setTipo] = useState<'cabelo' | 'maquiagem' | 'sobrancelha'>('cabelo');

  const demo = demos[tipo];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={s.back}>← Voltar</Text>
      </TouchableOpacity>

      <Text style={s.title}>Prévia IA para clientes</Text>

     <Text style={s.sub}>
  Gere prévias realistas com IA antes do atendimento e aumente a confiança do cliente.
</Text>

      <View style={s.chips}>
        {Object.keys(demos).map(k => (
          <TouchableOpacity
            key={k}
            onPress={() => setTipo(k as any)}
            style={[
              s.chip,
              tipo === k && s.chipAtivo,
            ]}
          >
            <Text
              style={[
                s.chipText,
                tipo === k && s.chipTextAtivo,
              ]}
            >
              {demos[k as keyof typeof demos].titulo}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.compareRow}>
        <View style={s.imageBox}>
          <Text style={s.imageLabel}>Antes</Text>
          <Image source={demo.antes} style={s.image} />
        </View>

        <View style={s.imageBox}>
          <Text style={s.imageLabel}>Depois IA</Text>
          <Image source={demo.depois} style={s.image} />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Como funciona</Text>

        <Text style={s.item}>1. Cliente escolhe uma foto</Text>
        <Text style={s.item}>2. Escolhe o tipo de serviço</Text>
        <Text style={s.item}>3. A IA gera uma prévia visual</Text>
        <Text style={s.item}>4. Cliente agenda com mais confiança</Text>
      </View>

      <View style={s.priceCard}>
        <Text style={s.priceTitle}>Adicionar ao Elite</Text>

        <Text style={s.price}>
          + R$ 19,90/mês
        </Text>

       <Text style={s.priceSub}>
  Gere até 2 prévias IA mensais para seus clientes
</Text>
      </View>

      <TouchableOpacity
        style={s.btn}
        onPress={() => navigation.navigate('Assinatura')}
      >
       <Text style={s.btnText}>Ativar Prévia IA</Text>
      </TouchableOpacity>

      <Text style={s.aviso}>
       As prévias IA são apenas simulações visuais e não substituem avaliação profissional.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  back: {
    color: GOLD,
    fontWeight: '800',
    marginTop: 40,
    marginBottom: 18,
  },

  title: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '900',
  },

  sub: {
    color: '#AAA',
    marginTop: 8,
    lineHeight: 20,
    marginBottom: 18,
  },

  chips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
    flexWrap: 'wrap',
  },

  chip: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },

  chipAtivo: {
    backgroundColor: GOLD,
  },

  chipText: {
    color: '#AAA',
    fontWeight: '800',
  },

  chipTextAtivo: {
    color: '#000',
  },

  compareRow: {
    flexDirection: 'row',
    gap: 10,
  },

  imageBox: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 10,
  },

  imageLabel: {
    color: GOLD,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },

  image: {
    width: '100%',
    height: 210,
    borderRadius: 14,
    backgroundColor: '#333',
  },

  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#C9A96E33',
  },

  cardTitle: {
    color: GOLD,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },

  item: {
    color: '#EEE',
    marginBottom: 8,
    fontWeight: '600',
  },

  priceCard: {
    backgroundColor: 'rgba(201,169,110,0.10)',
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#C9A96E55',
    alignItems: 'center',
  },

  priceTitle: {
    color: '#FFF',
    fontWeight: '800',
  },

  price: {
    color: GOLD,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
  },

  priceSub: {
    color: '#AAA',
    fontSize: 12,
    marginTop: 4,
  },

  btn: {
    backgroundColor: GOLD,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },

  btnText: {
    color: '#000',
    fontWeight: '900',
  },

  aviso: {
    color: '#777',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 16,
  },
});
