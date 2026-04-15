import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';

export default function PagamentoClienteScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const {
    agendamentoId,
    valor,
    servicoNome,
    nomeEstabelecimento
  } = route.params;

  const [loading, setLoading] = useState(false);
  const [metodo, setMetodo] = useState<'pix' | 'cartao' | 'local'>('pix');

  const pagar = async () => {
    try {
      setLoading(true);

      // 🔥 salva forma de pagamento no seu modelo atual
      await firestore()
        .collection('agendamentos')
        .doc(agendamentoId)
        .update({
          formaPagamento: metodo
        });

      Alert.alert(
        'Pagamento iniciado',
        metodo === 'local'
          ? 'Você escolheu pagar no local.'
          : 'Pagamento registrado. Continue o processo.'
      );

      navigation.goBack();

    } catch (e: any) {
      console.error(e);

      Alert.alert(
        'Erro',
        'Não foi possível processar o pagamento'
      );
    } finally {
      setLoading(false);
    }
  };

  const renderMetodo = (tipo: 'pix' | 'cartao' | 'local', label: string) => {
    const ativo = metodo === tipo;

    return (
      <TouchableOpacity
        style={[s.metodo, ativo && s.metodoAtivo]}
        onPress={() => setMetodo(tipo)}
      >
        <Text style={[s.metodoText, ativo && s.metodoTextAtivo]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>

      <Text style={s.titulo}>Pagamento</Text>

      {/* 🧾 CARD DO PEDIDO */}
      <View style={s.card}>
        <Text style={s.estab}>{nomeEstabelecimento}</Text>

        <View style={s.linha}>
          <Text style={s.label}>Serviço</Text>
          <Text style={s.valor}>{servicoNome}</Text>
        </View>

        <View style={s.linha}>
          <Text style={s.label}>Total</Text>
          <Text style={s.preco}>R$ {valor}</Text>
        </View>
      </View>

      {/* 💳 FORMAS DE PAGAMENTO */}
      <Text style={s.subtitulo}>Forma de pagamento</Text>

      <View style={s.metodosWrap}>
        {renderMetodo('pix', 'PIX')}
        {renderMetodo('cartao', 'Cartão')}
        {renderMetodo('local', 'Pagar no local')}
      </View>

      {/* 🔥 BOTÃO */}
      <TouchableOpacity
        style={s.botao}
        onPress={pagar}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.botaoText}>Confirmar</Text>
        )}
      </TouchableOpacity>

    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 20,
    justifyContent: 'center'
  },

  titulo: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center'
  },

  subtitulo: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30
  },

  estab: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10
  },

  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10
  },

  label: {
    color: '#666'
  },

  valor: {
    fontWeight: '600'
  },

  preco: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A'
  },

  metodosWrap: {
    gap: 10,
    marginBottom: 30
  },

  metodo: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd'
  },

  metodoAtivo: {
    borderColor: '#1A1A1A',
    backgroundColor: '#1A1A1A'
  },

  metodoText: {
    textAlign: 'center',
    fontWeight: '600',
    color: '#333'
  },

  metodoTextAtivo: {
    color: '#fff'
  },

  botao: {
    backgroundColor: '#1A1A1A',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center'
  },

  botaoText: {
    color: '#fff',
    fontWeight: '700'
  }
});