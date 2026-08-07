import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';
import QRCode from 'react-native-qrcode-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import Share from 'react-native-share';

export default function PagamentoClienteScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const {
    agendamentoId,
    valor,
    servicoNome,
    nomeEstabelecimento,
    formaPagamento,
  } = route.params;

  const [loading, setLoading] = useState(false);
  const [dadosPix, setDadosPix] = useState<any>(null);
  const [copiado, setCopiado] = useState(false);
  const [mostrarResumo, setMostrarResumo] = useState(false);
  const pagamentoEhSinal =
    dadosPix?.formaPagamento === 'sinal' || formaPagamento === 'sinal';
  const codigoPix =
    dadosPix?.qr_code ||
    dadosPix?.pixCopiaECola ||
    dadosPix?.pixChave ||
    '';
  const valorPagoAgora = Number(dadosPix?.valor || valor || 0);
  const valorServico = Number(dadosPix?.valorServico || valor || 0);
  const valorRestante = pagamentoEhSinal
    ? Math.max(valorServico - valorPagoAgora, 0)
    : 0;

  useEffect(() => {
    gerarPixManual();
  }, []);

  const gerarPixManual = async () => {
    try {
      setLoading(true);

      const functionsInstance = getFunctions(
        getApp(),
        'southamerica-east1'
      );

      const fn = httpsCallable(
        functionsInstance,
        'criarPagamentoCliente'
      );

      const res: any = await fn({
        agendamentoId,
      });

      if (!res?.data?.pixChave && !res?.data?.qr_code) {
        Alert.alert(
          'Erro',
          'O estabelecimento não possui PIX cadastrado.'
        );

        return;
      }

      setDadosPix(res.data);
    } catch (e: any) {
      Alert.alert(
        'Erro',
        e?.message || 'Não foi possível gerar o PIX.'
      );
    } finally {
      setLoading(false);
    }
  };

  const copiarPix = () => {
    if (!codigoPix) return;

    Clipboard.setString(codigoPix);
    setCopiado(true);

    setTimeout(() => {
      setCopiado(false);
    }, 2200);
  };

  const enviarComprovanteWhatsapp = async () => {
    if (!dadosPix?.whatsappUrl) {
      Alert.alert(
        'Erro',
        'WhatsApp do estabelecimento nao encontrado.'
      );
      return;
    }

    try {
      const imagem = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
      });

      if (imagem.didCancel) {
        return;
      }

      const asset = imagem.assets?.[0];

      if (!asset?.uri) {
        Alert.alert(
          'Comprovante obrigatorio',
          'Selecione a foto ou print do comprovante para enviar ao estabelecimento.'
        );
        return;
      }

      const mensagem =
        dadosPix?.resumo ||
        'Segue o comprovante do pagamento do agendamento.';

      try {
        await Share.open({
          title: 'Comprovante de pagamento',
          message: mensagem,
          url: asset.uri,
          type: asset.type || 'image/jpeg',
          social: Share.Social.WHATSAPP,
          whatsAppNumber: dadosPix?.whatsappNumber,
          failOnCancel: false,
        } as any);
      } catch (shareError: any) {
        Alert.alert(
          'Erro',
          shareError?.message || 'Nao foi possivel abrir o WhatsApp com o comprovante.'
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Erro',
        e?.message || 'Nao foi possivel enviar o comprovante.'
      );
    }
  };

  if (loading && !dadosPix) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#C9A96E" size="large" />
        <Text style={s.loadingText}>
          Gerando dados do pagamento...
        </Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#C9A96E" />
        </TouchableOpacity>

        <Text style={s.titulo}>Pagamento PIX</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <Text style={s.estab}>
            {dadosPix?.estabelecimentoNome || nomeEstabelecimento}
          </Text>

          <View style={s.divider} />

          <View style={s.linha}>
            <Text style={s.label}>Serviço</Text>
            <Text style={s.valor}>
              {dadosPix?.servicoNome || servicoNome}
            </Text>
          </View>

          <View style={s.linha}>
            <Text style={s.label}>
              {pagamentoEhSinal ? 'Sinal de 50%' : 'Total'}
            </Text>
            <Text style={s.preco}>
              R$ {valorPagoAgora
                .toFixed(2)
                .replace('.', ',')}
            </Text>
          </View>

          {pagamentoEhSinal && (
            <View style={s.linha}>
              <Text style={s.label}>Restante no dia</Text>
              <Text style={s.valor}>
                R$ {valorRestante.toFixed(2).replace('.', ',')}
              </Text>
            </View>
          )}
        </View>

        {(dadosPix?.qr_code || dadosPix?.qr_code_base64 || dadosPix?.pixChave) && (
          <View style={s.pixCard}>
            <Text style={s.pixTitulo}>Escaneie o QR Code</Text>

            <View style={s.qrBox}>
              {dadosPix?.qr_code_base64 ? (
                <Image
                  source={{ uri: `data:image/png;base64,${dadosPix.qr_code_base64}` }}
                  style={s.qrImage}
                />
              ) : (
                <QRCode
                  value={String(codigoPix)}
                  size={210}
                />
              )}
            </View>

            <Text style={s.pixLabel}>
              Pix copia e cola
            </Text>

            <View style={s.chaveBox}>
              <Text style={s.chaveText} numberOfLines={4}>
                {codigoPix}
              </Text>
            </View>

            <TouchableOpacity
              style={s.copiarBtn}
              onPress={copiarPix}
            >
              <Icon
                name={copiado ? 'check' : 'content-copy'}
                size={18}
                color="#000"
              />

              <Text style={s.copiarTxt}>
                {copiado ? 'PIX copiado!' : 'Copiar PIX'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={s.resumoBtn}
          onPress={() => setMostrarResumo(!mostrarResumo)}
        >
          <Icon
            name={mostrarResumo ? 'chevron-up' : 'file-document-outline'}
            size={20}
            color="#C9A96E"
          />

          <Text style={s.resumoBtnText}>
            {mostrarResumo ? 'Ocultar resumo' : 'Ver resumo do pedido'}
          </Text>
        </TouchableOpacity>

        {mostrarResumo && dadosPix?.resumo && (
          <View style={s.resumoCard}>
            <Text style={s.resumoTitulo}>
              Resumo do pedido
            </Text>

            <Text style={s.resumoTexto}>
              {dadosPix.resumo}
            </Text>
          </View>
        )}

        {!!dadosPix?.whatsappUrl && (
          <TouchableOpacity
            style={s.whatsBtn}
            onPress={enviarComprovanteWhatsapp}
          >
            <Icon name="whatsapp" size={22} color="#FFF" />

            <Text style={s.whatsBtnText}>
              Enviar comprovante pelo WhatsApp
            </Text>
          </TouchableOpacity>
        )}

        <View style={s.avisoCard}>
          <Icon
            name="shield-check-outline"
            size={22}
            color="#C9A96E"
          />

          <Text style={s.avisoText}>
            {pagamentoEhSinal
              ? `Pague o PIX de 50% direto para o estabelecimento e envie o comprovante pelo WhatsApp em ate 15 minutos. Seu horario so sera confirmado depois que o estabelecimento conferir. Os R$ ${valorRestante.toFixed(2).replace('.', ',')} restantes ficam para o dia do atendimento.`
              : 'Pague o PIX direto para o estabelecimento e envie o comprovante pelo WhatsApp em ate 15 minutos. Seu agendamento so sera confirmado depois que o estabelecimento conferir.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: 20,
  },

  center: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    color: '#C9A96E',
    marginTop: 12,
    fontWeight: '700',
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
    fontWeight: '800',
    marginLeft: 15,
  },

  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C9A96E22',
  },

  estab: {
    color: '#C9A96E',
    fontWeight: '800',
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
    gap: 12,
  },

  label: {
    color: '#AAA',
  },

  valor: {
    color: '#FFF',
    flex: 1,
    textAlign: 'right',
    fontWeight: '700',
  },

  preco: {
    color: '#C9A96E',
    fontWeight: '900',
    fontSize: 18,
  },

  pixCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C9A96E22',
  },

  pixTitulo: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 14,
  },

  qrBox: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  qrImage: {
    width: 210,
    height: 210,
  },

  pixLabel: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginBottom: 6,
  },

  chaveBox: {
    width: '100%',
    backgroundColor: '#0D0D0D',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },

  chaveText: {
    color: '#FFF',
    fontSize: 12,
    textAlign: 'center',
  },

  copiarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#C9A96E',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 14,
  },

  copiarTxt: {
    color: '#000',
    fontWeight: '900',
  },

  resumoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C9A96E33',
  },

  resumoBtnText: {
    color: '#C9A96E',
    fontWeight: '800',
  },

  resumoCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },

  resumoTitulo: {
    color: '#1A1A1A',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },

  resumoTexto: {
    color: '#333',
    fontSize: 13,
    lineHeight: 21,
  },

  whatsBtn: {
    backgroundColor: '#25D366',
    borderRadius: 16,
    padding: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },

  whatsBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },

  avisoCard: {
    backgroundColor: 'rgba(201,169,110,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.25)',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 30,
  },

  avisoText: {
    color: '#C9A96E',
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
});
