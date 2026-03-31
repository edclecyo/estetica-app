import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  ActivityIndicator, Alert, ScrollView, Clipboard 
} from 'react-native';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function CheckoutPagamentoScreen({ route, navigation }: any) {
  const { planoId, preco } = route.params;
  const [loading, setLoading] = useState(false);
  const [metodo, setMetodo] = useState<'card' | 'pix'>('card');
  
  // Estados Cartão
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [holderName, setHolderName] = useState('');

  // Estado Pix
  const [pixData, setPixData] = useState<{ qrCode: string, copyPaste: string } | null>(null);

  const realizarPagamentoCartao = async () => {
    if (!cardNumber || !expiry || !cvv || !holderName) {
      Alert.alert("Erro", "Preencha todos os dados do cartão.");
      return;
    }

    setLoading(true);
    try {
      const user = auth().currentUser;
      const { data } = await functions().httpsCallable('processarPagamentoCartao')({
        email: user?.email,
        planoId,
        valor: preco,
        cartao: {
          numero: cardNumber.replace(/\s/g, ''),
          vencimento: expiry,
          cvv: cvv,
          nome: holderName
        }
      });

      if (data.sucesso) {
        Alert.alert("Sucesso!", "Pagamento aprovado!");
        navigation.navigate('AdminDash');
      } else {
        throw new Error(data.message || "Pagamento recusado.");
      }
    } catch (error: any) {
      Alert.alert("Falha no Pagamento", error.message);
    } finally {
      setLoading(false);
    }
  };

  const gerarPix = async () => {
    setLoading(true);
    try {
      const user = auth().currentUser;
      const { data } = await functions().httpsCallable('gerarPagamentoPix')({
        email: user?.email,
        planoId,
        valor: preco,
      });

      if (data.copy_paste) {
        setPixData({ qrCode: data.qr_code_base64, copyPaste: data.copy_paste });
      } else {
        throw new Error("Erro ao gerar código Pix.");
      }
    } catch (error: any) {
      Alert.alert("Erro", error.message);
    } finally {
      setLoading(false);
    }
  };

  const copiarPix = () => {
    if (pixData) {
      Clipboard.setString(pixData.copyPaste);
      Alert.alert("Copiado!", "Código Pix copiado para a área de transferência.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#C9A96E" />
        </TouchableOpacity>
        <Text style={styles.titulo}>Pagamento</Text>
      </View>

      <View style={styles.resumoPlano}>
        <Text style={styles.labelPlano}>Plano Selecionado: {planoId.toUpperCase()}</Text>
        <Text style={styles.valorTotal}>R$ {preco}</Text>
      </View>

      {/* Seletor de Método */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, metodo === 'card' && styles.tabAtiva]} 
          onPress={() => setMetodo('card')}
        >
          <Icon name="credit-card" size={20} color={metodo === 'card' ? "#000" : "#C9A96E"} />
          <Text style={[styles.tabText, metodo === 'card' && styles.tabTextAtiva]}>Cartão</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, metodo === 'pix' && styles.tabAtiva]} 
          onPress={() => setMetodo('pix')}
        >
          <Icon name="pix" size={20} color={metodo === 'pix' ? "#000" : "#C9A96E"} />
          <Text style={[styles.tabText, metodo === 'pix' && styles.tabTextAtiva]}>Pix</Text>
        </TouchableOpacity>
      </View>

      {metodo === 'card' ? (
        <View style={styles.form}>
          <Text style={styles.inputLabel}>Nome no Cartão</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Como está no cartão" 
            placeholderTextColor="#666"
            value={holderName}
            onChangeText={setHolderName}
          />
          <Text style={styles.inputLabel}>Número do Cartão</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric"
            placeholder="0000 0000 0000 0000" 
            placeholderTextColor="#666"
            value={cardNumber}
            onChangeText={setCardNumber}
          />
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.inputLabel}>Validade</Text>
              <TextInput 
                style={styles.input} 
                placeholder="MM/AA" 
                placeholderTextColor="#666"
                value={expiry}
                onChangeText={setExpiry}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>CVV</Text>
              <TextInput 
                style={styles.input} 
                placeholder="123" 
                placeholderTextColor="#666"
                keyboardType="numeric"
                secureTextEntry
                value={cvv}
                onChangeText={setCvv}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.btnPagar} onPress={realizarPagamentoCartao} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>PAGAR COM CARTÃO</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pixContainer}>
          {!pixData ? (
            <TouchableOpacity style={styles.btnPagar} onPress={gerarPix} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>GERAR QR CODE PIX</Text>}
            </TouchableOpacity>
          ) : (
            <View style={styles.pixResult}>
              <Text style={styles.pixInstrucao}>Copie o código abaixo para pagar no seu banco:</Text>
              <View style={styles.copyPasteBox}>
                <Text numberOfLines={1} style={styles.copyPasteText}>{pixData.copyPaste}</Text>
              </View>
              <TouchableOpacity style={styles.btnCopiar} onPress={copiarPix}>
                <Icon name="content-copy" size={20} color="#000" />
                <Text style={styles.btnCopiarText}>COPIAR CÓDIGO PIX</Text>
              </TouchableOpacity>
              <Text style={styles.pixAviso}>A liberação é instantânea após o pagamento.</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 40, marginBottom: 30 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#FFF', marginLeft: 20 },
  resumoPlano: { backgroundColor: '#1A1A1A', padding: 20, borderRadius: 10, marginBottom: 25, borderLeftWidth: 4, borderLeftColor: '#C9A96E' },
  labelPlano: { color: '#AAA', fontSize: 14 },
  valorTotal: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 5 },
  
  tabBar: { flexDirection: 'row', marginBottom: 25, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 5 },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 8 },
  tabAtiva: { backgroundColor: '#C9A96E' },
  tabText: { color: '#C9A96E', marginLeft: 8, fontWeight: 'bold' },
  tabTextAtiva: { color: '#000' },

  form: { marginTop: 10 },
  inputLabel: { color: '#C9A96E', fontSize: 12, marginBottom: 5, fontWeight: 'bold' },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', borderRadius: 8, padding: 15, marginBottom: 20, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  btnPagar: { backgroundColor: '#C9A96E', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },

  pixContainer: { marginTop: 10, alignItems: 'center' },
  pixResult: { width: '100%', alignItems: 'center' },
  pixInstrucao: { color: '#FFF', marginBottom: 15, textAlign: 'center' },
  copyPasteBox: { backgroundColor: '#1A1A1A', padding: 15, borderRadius: 8, width: '100%', marginBottom: 15 },
  copyPasteText: { color: '#666', fontSize: 12 },
  btnCopiar: { flexDirection: 'row', backgroundColor: '#C9A96E', padding: 18, borderRadius: 8, alignItems: 'center', width: '100%', justifyContent: 'center' },
  btnCopiarText: { color: '#000', fontWeight: 'bold', marginLeft: 10 },
  pixAviso: { color: '#C9A96E', marginTop: 20, fontSize: 12, fontWeight: 'bold' }
});