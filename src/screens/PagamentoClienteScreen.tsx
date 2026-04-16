import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useRoute, useNavigation } from '@react-navigation/native';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import QRCode from 'react-native-qrcode-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function PagamentoClienteScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const { agendamentoId, valor, servicoNome, nomeEstabelecimento } = route.params;

  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<any>(null);
  const [copiado, setCopiado] = useState(false);
  const [status, setStatus] = useState<'pendente' | 'aprovado'>('pendente');
  const [expiraEm, setExpiraEm] = useState<number | null>(null);
  const [tempoRestante, setTempoRestante] = useState('');

  // ✅ ESCUTA TEMPO REAL — com cleanup correto
  useEffect(() => {
    const unsub = firestore()
      .collection('agendamentos')
      .doc(agendamentoId)
      .onSnapshot(doc => {
		  if (!doc.exists) return;
        const data = doc.data();
        if (data?.statusPagamento === 'aprovado') {
          setStatus('aprovado');
          setTimeout(() => navigation.goBack(), 2500);
        }
      });

    return () => unsub();
  }, [agendamentoId]);

  // ✅ TIMER — com cleanup correto
  useEffect(() => {
    if (!expiraEm) return;

    const interval = setInterval(() => {
      const restante = expiraEm - Date.now();

      if (restante <= 0) {
        clearInterval(interval);
        setQr(null);
        setExpiraEm(null);
        Alert.alert('PIX expirado', 'Gere um novo código PIX para continuar.');
        return;
      }

      const min = Math.floor(restante / 60000);
      const seg = Math.floor((restante % 60000) / 1000);
      setTempoRestante(`${min}:${seg.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiraEm]);

  const gerarPix = async () => {
    try {
      setLoading(true);

      // ✅ REGIÃO CORRETA
      const fn = functions('southamerica-east1').httpsCallable('criarPagamentoCliente');

      const res = await fn({ agendamentoId });
      const data = res.data as any;

      if (!data?.qr_code) {
        Alert.alert('Erro', 'Estabelecimento não configurou o Mercado Pago ainda.');
        return;
      }

      setQr(data);
      setExpiraEm(Date.now() + 15 * 60 * 1000); // 15 min

    } catch (e: any) {
      const msg = e?.message || 'Erro ao gerar PIX';
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  // ✅ CLIPBOARD MODERNO
  const copiarCodigo = () => {
    if (!qr?.qr_code) return;
    Clipboard.setString(qr.qr_code);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <View style={s.container}>

      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#C9A96E" />
        </TouchableOpacity>
        <Text style={s.titulo}>Pagamento</Text>
      </View>

      {/* CARD */}
      <View style={s.card}>
        <Text style={s.estab}>{nomeEstabelecimento}</Text>
        <View style={s.divider} />
        <View style={s.linha}>
          <Text style={s.label}>Serviço</Text>
          <Text style={s.valor}>{servicoNome}</Text>
        </View>
        <View style={s.linha}>
          <Text style={s.label}>Total</Text>
          <Text style={s.preco}>R$ {valor}</Text>
        </View>
      </View>

      {/* APROVADO */}
      {status === 'aprovado' && (
        <View style={s.sucesso}>
          <Icon name="check-circle" size={26} color="#00FF9C" />
          <Text style={s.sucessoTxt}>Pagamento confirmado! Redirecionando...</Text>
        </View>
      )}

      {/* BOTÃO GERAR PIX */}
      {!qr && status !== 'aprovado' && (
        <TouchableOpacity
          style={[s.botao, loading && { opacity: 0.7 }]}
          onPress={gerarPix}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Icon name="qrcode" size={20} color="#000" />
              <Text style={s.botaoText}>Gerar PIX</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* PIX GERADO */}
      {qr && status !== 'aprovado' && (
        <View style={s.pixBox}>

          <View style={s.qrContainer}>
            <QRCode value={qr.qr_code} size={200} />
          </View>

          <View style={s.timerBox}>
            <Icon name="clock-outline" size={14} color="#C9A96E" />
            <Text style={s.timer}>Expira em {tempoRestante}</Text>
          </View>

          <Text style={s.pixLabel}>Copia e cola</Text>

          <View style={s.copyBox}>
            <Text numberOfLines={2} style={s.codigo}>
              {qr.qr_code}
            </Text>
          </View>

          <TouchableOpacity style={s.copiarBtn} onPress={copiarCodigo}>
            <Icon name={copiado ? 'check' : 'content-copy'} size={18} color="#000" />
            <Text style={s.copiarTxt}>
              {copiado ? 'Copiado!' : 'Copiar código'}
            </Text>
          </TouchableOpacity>

          {/* GERAR NOVO */}
          <TouchableOpacity style={s.novoBtn} onPress={() => { setQr(null); setExpiraEm(null); }}>
            <Text style={s.novoTxt}>Gerar novo código</Text>
          </TouchableOpacity>

        </View>
      )}

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
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  titulo: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 15,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#C9A96E22',
  },
  estab: {
    color: '#C9A96E',
    fontWeight: '700',
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 12,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  label: { color: '#aaa' },
  valor: { color: '#fff' },
  preco: {
    color: '#C9A96E',
    fontWeight: '700',
    fontSize: 18,
  },
  botao: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#C9A96E',
    padding: 16,
    borderRadius: 14,
  },
  botaoText: {
    fontWeight: '700',
    color: '#000',
    fontSize: 15,
  },
  pixBox: {
    alignItems: 'center',
    marginTop: 10,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
  },
  timer: {
    color: '#C9A96E',
    fontWeight: '700',
  },
  pixLabel: {
    color: '#aaa',
    marginTop: 16,
    marginBottom: 4,
    fontSize: 12,
  },
  copyBox: {
    backgroundColor: '#1A1A1A',
    padding: 12,
    borderRadius: 10,
    marginTop: 6,
    width: '100%',
  },
  codigo: {
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
  },
  copiarBtn: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    backgroundColor: '#C9A96E',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  copiarTxt: {
    fontWeight: '700',
    color: '#000',
  },
  novoBtn: {
    marginTop: 14,
    padding: 10,
  },
  novoTxt: {
    color: '#555',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  sucesso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1E3D2F',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  sucessoTxt: {
    color: '#00FF9C',
    fontWeight: '700',
    flex: 1,
  },
});