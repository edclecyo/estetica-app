import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
} from 'react-native';

import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';

const GOLD = '#C9A96E';

export default function RelatorioFinanceiroScreen({ route, navigation }: any) {
  const { estabelecimentoId } = route.params || {};

  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const formatar = (d: Date) =>
    d.toLocaleDateString('pt-BR');

  const [dataInicio, setDataInicio] = useState(formatar(primeiroDia));
  const [dataFim, setDataFim] = useState(formatar(hoje));
  const [loading, setLoading] = useState(false);
  const [urlPdf, setUrlPdf] = useState('');
  const [resumo, setResumo] = useState<any>(null);

  const gerar = async () => {
    if (!estabelecimentoId) {
      Alert.alert('Erro', 'Estabelecimento não informado.');
      return;
    }

    try {
      setLoading(true);

      const fn = httpsCallable(
        getFunctions(getApp(), 'southamerica-east1'),
        'gerarRelatorioFinanceiro'
      );

      const res: any = await fn({
        estabelecimentoId,
        dataInicio,
        dataFim,
      });

      setUrlPdf(res.data?.url || '');
      setResumo(res.data || null);

      Alert.alert(
        'Relatório gerado',
        'Seu PDF financeiro foi gerado com sucesso.'
      );
    } catch (e: any) {
      Alert.alert(
        'Erro',
        e?.message || 'Não foi possível gerar o relatório.'
      );
    } finally {
      setLoading(false);
    }
  };

  const abrirPdf = async () => {
    if (!urlPdf) return;

    const can = await Linking.canOpenURL(urlPdf);

    if (!can) {
      Alert.alert('Erro', 'Não foi possível abrir o PDF.');
      return;
    }

    Linking.openURL(urlPdf);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>←</Text>
        </TouchableOpacity>

        <Text style={s.title}>Relatório financeiro</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Período do relatório</Text>

        <Text style={s.label}>Data inicial</Text>
        <TextInput
          style={s.input}
          value={dataInicio}
          onChangeText={setDataInicio}
          placeholder="DD/MM/AAAA"
          placeholderTextColor="#777"
        />

        <Text style={s.label}>Data final</Text>
        <TextInput
          style={s.input}
          value={dataFim}
          onChangeText={setDataFim}
          placeholder="DD/MM/AAAA"
          placeholderTextColor="#777"
        />

        <TouchableOpacity
          style={s.btn}
          onPress={gerar}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={s.btnText}>Gerar PDF seguro</Text>
          )}
        </TouchableOpacity>
      </View>

      {resumo && (
        <View style={s.resumoCard}>
          <Text style={s.resumoTitle}>Resumo gerado</Text>

          <Text style={s.resumoText}>
            Receita: R$ {Number(resumo.receitaTotal || 0)
              .toFixed(2)
              .replace('.', ',')}
          </Text>

          <Text style={s.resumoText}>
            Agendamentos: {resumo.totalAgendamentos || 0}
          </Text>

          <Text style={s.resumoText}>
            Plano: {(resumo.plano || '').toUpperCase()}
          </Text>
        </View>
      )}

      {!!urlPdf && (
        <TouchableOpacity style={s.btnPdf} onPress={abrirPdf}>
          <Text style={s.btnPdfText}>Abrir PDF</Text>
        </TouchableOpacity>
      )}

      <Text style={s.aviso}>
        Relatório auxiliar para organização financeira. Para declaração oficial de imposto de renda, consulte seu contador.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: 20,
  },

  header: {
    marginTop: 40,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },

  back: {
    color: GOLD,
    fontSize: 28,
    marginRight: 14,
  },

  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
  },

  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#C9A96E33',
  },

  cardTitle: {
    color: GOLD,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 16,
  },

  label: {
    color: '#AAA',
    fontSize: 12,
    marginBottom: 6,
    marginTop: 10,
  },

  input: {
    backgroundColor: '#0D0D0D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    color: '#FFF',
    padding: 12,
  },

  btn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
    marginTop: 18,
  },

  btnText: {
    color: '#000',
    fontWeight: '900',
  },

  resumoCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
  },

  resumoTitle: {
    color: '#1A1A1A',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
  },

  resumoText: {
    color: '#333',
    fontSize: 13,
    marginBottom: 4,
    fontWeight: '700',
  },

  btnPdf: {
    backgroundColor: '#25D366',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },

  btnPdfText: {
    color: '#FFF',
    fontSize: 15,
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