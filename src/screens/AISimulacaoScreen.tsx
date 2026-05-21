import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';

import { launchImageLibrary } from 'react-native-image-picker';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import storage from '@react-native-firebase/storage';

const GOLD = '#C9A96E';

export default function AISimulacaoScreen({ route, navigation }: any) {
  const { estabelecimentoId } = route.params || {};

  const [imagem, setImagem] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [categoria, setCategoria] = useState('cabelo');
  const [loading, setLoading] = useState(false);

  const escolherImagem = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    });

    if (res.didCancel) return;

    const uri = res.assets?.[0]?.uri;

    if (uri) {
      setImagem(uri);
      setResultado(null);
    }
  };

  const gerar = async () => {
    if (!imagem) {
      Alert.alert('Atenção', 'Escolha uma foto primeiro.');
      return;
    }

    try {
      setLoading(true);

      const user = getAuth().currentUser;

      if (!user?.uid) {
        Alert.alert('Sessao expirada', 'Faca login novamente.');
        return;
      }

      if (!estabelecimentoId) {
        Alert.alert('Erro', 'Estabelecimento invalido.');
        return;
      }

      const uploadUri = imagem.startsWith('file://')
        ? imagem.replace('file://', '')
        : imagem;

      const ref = storage().ref(
        `simulacoesIA/originais/${user.uid}/${estabelecimentoId}_${Date.now()}.jpg`
      );

      await ref.putFile(uploadUri);
      const imagemUrl = await ref.getDownloadURL();

      const fn = httpsCallable(
        getFunctions(getApp(), 'southamerica-east1'),
        'gerarSimulacaoIA'
      );

      const res: any = await fn({
        estabelecimentoId,
        categoria,
        imagemUrl,
      });

      setResultado(res.data?.imagemGerada || imagem);
    } catch (e: any) {
      Alert.alert(
        'Erro',
        e?.message || 'Não foi possível gerar a simulação.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>←</Text>
        </TouchableOpacity>

        <Text style={s.title}>Prévia com IA</Text>
      </View>

      <Text style={s.sub}>
        Simule uma prévia visual antes de agendar.
      </Text>

      <View style={s.categorias}>
        {['cabelo', 'maquiagem', 'sobrancelha'].map(c => (
          <TouchableOpacity
            key={c}
            style={[
              s.chip,
              categoria === c && s.chipAtivo,
            ]}
            onPress={() => setCategoria(c)}
          >
            <Text
              style={[
                s.chipText,
                categoria === c && s.chipTextAtivo,
              ]}
            >
              {c}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.btn} onPress={escolherImagem}>
        <Text style={s.btnText}>Escolher foto</Text>
      </TouchableOpacity>

      {imagem && (
        <>
          <Text style={s.label}>Foto enviada</Text>
          <Image source={{ uri: imagem }} style={s.preview} />
        </>
      )}

      <TouchableOpacity
        style={[s.btnGerar, !imagem && { opacity: 0.5 }]}
        onPress={gerar}
        disabled={loading || !imagem}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={s.btnGerarText}>Gerar simulação IA</Text>
        )}
      </TouchableOpacity>

      {resultado && (
        <>
          <Text style={s.resultTitle}>Resultado</Text>
          <Image source={{ uri: resultado }} style={s.preview} />

          <TouchableOpacity
            style={s.agendarBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.agendarText}>Agendar agora</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={s.aviso}>
        A prévia é uma simulação aproximada. O resultado real pode variar conforme técnica, pele, cabelo, produto e avaliação profissional.
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 35,
    marginBottom: 10,
  },

  back: {
    color: GOLD,
    fontSize: 30,
    marginRight: 14,
  },

  title: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '900',
  },

  sub: {
    color: '#AAA',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 20,
  },

  categorias: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },

  chip: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  chipAtivo: {
    backgroundColor: GOLD,
  },

  chipText: {
    color: '#AAA',
    fontWeight: '800',
    textTransform: 'capitalize',
  },

  chipTextAtivo: {
    color: '#000',
  },

  btn: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: GOLD,
  },

  btnText: {
    color: GOLD,
    fontWeight: '900',
  },

  btnGerar: {
    backgroundColor: GOLD,
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
    marginTop: 14,
  },

  btnGerarText: {
    color: '#000',
    fontWeight: '900',
  },

  label: {
    color: '#AAA',
    fontSize: 12,
    marginTop: 18,
    fontWeight: '700',
  },

  preview: {
    width: '100%',
    height: 260,
    borderRadius: 18,
    marginTop: 10,
    backgroundColor: '#1A1A1A',
  },

  resultTitle: {
    color: '#FFF',
    fontWeight: '900',
    marginTop: 18,
    fontSize: 18,
  },

  agendarBtn: {
    backgroundColor: '#25D366',
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 14,
  },

  agendarText: {
    color: '#FFF',
    fontWeight: '900',
  },

  aviso: {
    color: '#777',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
    textAlign: 'center',
  },
});
