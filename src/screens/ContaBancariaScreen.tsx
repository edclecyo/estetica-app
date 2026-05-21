import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';

export default function ContaBancariaScreen({ route, navigation }: any) {
  const estabelecimentoId = route?.params?.estabelecimentoId;

  const [loading, setLoading] = useState(false);
  const [loadingFetch, setLoadingFetch] = useState(true);

  const [responsavelNome, setResponsavelNome] = useState('');
  const [responsavelCpf, setResponsavelCpf] = useState('');
  const [responsavelTelefone, setResponsavelTelefone] = useState('');
  const [responsavelEmail, setResponsavelEmail] = useState('');

  const [pixChave, setPixChave] = useState('');
  const [, setPixTipo] = useState('');

  const validarPix = (pix: string) => {
    const v = pix.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(v)) {
      return { valido: true, tipo: 'email' };
    }

    const tel = v.replace(/\D/g, '');
    if (tel.length >= 10 && tel.length <= 13) {
      return { valido: true, tipo: 'telefone' };
    }

    const cpf = v.replace(/\D/g, '');
    if (cpf.length === 11) {
      return { valido: true, tipo: 'cpf' };
    }

    if (v.length >= 20) {
      return { valido: true, tipo: 'aleatoria' };
    }

    return { valido: false, tipo: null };
  };

  useEffect(() => {
    if (!estabelecimentoId) {
      setLoadingFetch(false);
      return;
    }

    const load = async () => {
      try {
        const doc = await firestore()
          .collection('estabelecimentos')
          .doc(estabelecimentoId)
          .get();

        const data = doc.data();

        if (data) {
          setResponsavelNome(data.responsavelNome || '');
          setResponsavelCpf(data.responsavelCpf || '');
          setResponsavelTelefone(data.responsavelTelefone || '');
          setResponsavelEmail(data.responsavelEmail || '');

          setPixChave(data.pixChave || '');
          setPixTipo(data.pixTipo || '');
        }
      } catch (e) {
        console.log(e);
      } finally {
        setLoadingFetch(false);
      }
    };

    load();
  }, [estabelecimentoId]);

  const salvar = async () => {
    const pixValidacao = validarPix(pixChave);

    if (!responsavelNome) {
      Alert.alert('Erro', 'Nome e obrigatorio');
      return;
    }

    if (!pixValidacao.valido) {
      Alert.alert('PIX invalido', 'Use CPF, telefone, email ou chave PIX valida');
      return;
    }

    try {
      setLoading(true);

      const fn = httpsCallable(
        getFunctions(getApp(), 'southamerica-east1'),
        'salvarDadosConta'
      );

      await fn({
        estabelecimentoId,
        responsavelNome,
        responsavelCpf,
        responsavelTelefone,
        responsavelEmail,
        pixChave,
        pixTipo: pixValidacao.tipo,
      });

      Alert.alert('Sucesso', 'Dados PIX salvos!');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  if (loadingFetch) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  if (!estabelecimentoId) {
    return (
      <View style={s.center}>
        <Text>Erro: estabelecimento nao informado</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={s.title}>Dados para Recebimento PIX</Text>

      <Text style={s.label}>Nome responsavel</Text>
      <TextInput style={s.input} value={responsavelNome} onChangeText={setResponsavelNome} />

      <Text style={s.label}>CPF (identificacao)</Text>
      <TextInput style={s.input} value={responsavelCpf} onChangeText={setResponsavelCpf} />

      <Text style={s.label}>Telefone</Text>
      <TextInput style={s.input} value={responsavelTelefone} onChangeText={setResponsavelTelefone} />

      <Text style={s.label}>Email</Text>
      <TextInput style={s.input} value={responsavelEmail} onChangeText={setResponsavelEmail} />

      <Text style={s.label}>Chave PIX</Text>
      <TextInput
        style={s.input}
        value={pixChave}
        onChangeText={setPixChave}
        placeholder="CPF, email, telefone ou chave aleatoria"
      />

      <TouchableOpacity style={s.btn} onPress={salvar} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.btnText}>Salvar PIX</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 20,
    color: '#1A1A1A',
  },
  label: {
    fontSize: 12,
    color: '#777',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  btn: {
    marginTop: 25,
    backgroundColor: '#1A1A1A',
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnText: {
    color: '#C9A96E',
    fontWeight: '800',
  },
});
