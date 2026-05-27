import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
  StatusBar, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  loginClienteEmail,
  cadastrarClienteEmail,
  loginClienteGoogle,
} from '../services/clienteAuthService';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { registrarTokenPush } from '../services/notificacao.service';
type Tela = 'login' | 'cadastro';

export default function ClienteLoginScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { estabelecimentoId } = route.params || {};

  const [tela, setTela] = useState<Tela>('login');
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cSenha, setCSenha] = useState('');
  const [cConfirm, setCConfirm] = useState('');

  const sucessoAuth = () => {
    if (estabelecimentoId) {
      navigation.replace('Detalhe', { estabelecimentoId });
    } else {
      navigation.replace('HomeTabs');
    }
  };

  const fazerLogin = async () => {
  if (!email || !senha) { Alert.alert('Atencao', 'Preencha email e senha.'); return; }
  try {
    setLoading(true);

    // Faz login temporario para verificar o tipo de conta.
    const { user } = await auth().signInWithEmailAndPassword(email, senha);

    // Verifica se e admin ANTES do AuthContext reagir.
    const snap = await firestore().collection('admins').doc(user.uid).get();

    if (snap.exists && snap.data()?.ativo) {
      await auth().signOut();
      setLoading(false);
      Alert.alert(
        'Acesso Negado',
        'Esta e uma conta de estabelecimento.\n\nEscolha a opcao Profissional no topo para acessar o painel.'
      );
      return;
    }

    await registrarTokenPush(user.uid, 'cliente');
    sucessoAuth();

  } catch (e: any) {
    const msg =
      e?.code === 'auth/user-not-found' ||
      e?.code === 'auth/wrong-password' ||
      e?.code === 'auth/invalid-credential'
        ? 'Email ou senha incorretos.'
        : 'Nao foi possivel realizar o login.';
    Alert.alert('Erro', msg);
  } finally {
    setLoading(false);
  }
};

  const fazerCadastro = async () => {
    if (!nome || !cEmail || !cSenha) { Alert.alert('Atencao', 'Preencha todos os campos.'); return; }
    if (cSenha.length < 6) { Alert.alert('Atencao', 'Senha deve ter pelo menos 6 caracteres.'); return; }
    if (cSenha !== cConfirm) { Alert.alert('Atencao', 'As senhas nao coincidem.'); return; }
    
    try {
      setLoading(true);
      await cadastrarClienteEmail(nome, cEmail, cSenha);
      sucessoAuth();
    } catch (e: any) {
      let msg = 'Nao foi possivel criar a conta.';
      if (e?.code === 'auth/email-already-in-use') msg = 'Este email ja esta cadastrado.';
      else if (e?.code === 'auth/invalid-email') msg = 'Email invalido.';
      else if (e?.code === 'auth/weak-password') msg = 'A senha e muito fraca.';
      else if (e?.message) msg = e.message;
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  const fazerLoginGoogle = async () => {
    try {
      setLoadingGoogle(true);
      await loginClienteGoogle();
      sucessoAuth();
    } catch (e: any) {
      console.log('Erro Google:', e);
      if (e?.message === 'admin-account') {
        Alert.alert(
          'Acesso Negado',
          'Esta e uma conta de estabelecimento.\n\nEscolha a opcao Profissional no topo para acessar o painel.'
        );
      } else {
        Alert.alert('Erro', 'Nao foi possivel entrar com Google.');
      }
    } finally {
      setLoadingGoogle(false);
    }
  };
  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#000' }}
    >
      <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        
        {/* Topo Premium */}
        <View style={s.topo}>
          <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}>
            <Icon name="chevron-left" size={30} color="#C9A96E" />
          </TouchableOpacity>
          
          {/* Logo BeautyHub */}
          <View style={s.logoContainer}>
            <Image 
              source={require('../assets/logo.png')} 
              style={s.logoImage}
              resizeMode="contain"
            />
          </View>
          
          <Text style={s.topoTitulo}>
            {tela === 'login' ? 'Bem-vindo' : 'Crie sua conta'}
          </Text>
          <Text style={s.topoSub}>
            {tela === 'login'
              ? 'Acesse para gerenciar seus agendamentos'
              : 'Cadastre-se para agendar com facilidade'}
          </Text>
        </View>

        <View style={s.body}>
          <View style={s.tipoBox}>
            <Text style={s.tipoTitulo}>Como voce quer acessar?</Text>
            <Text style={s.tipoDesc}>
              Use Cliente para agendar. Use Profissional somente para gerenciar estabelecimento.
            </Text>
            <View style={s.tipoSwitch}>
              <TouchableOpacity style={[s.tipoOpcao, s.tipoOpcaoAtiva]} activeOpacity={0.9}>
                <Icon name="account-heart-outline" size={19} color="#000" />
                <Text style={[s.tipoText, s.tipoTextAtivo]}>Cliente</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.tipoOpcao}
                onPress={() => navigation.navigate('AdminLogin')}
                activeOpacity={0.9}>
                <Icon name="storefront-outline" size={19} color="#777" />
                <Text style={s.tipoText}>Profissional</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Abas Estilo Switch */}
          <View style={s.abas}>
            <TouchableOpacity
              style={[s.aba, tela === 'login' && s.abaAtiva]}
              onPress={() => setTela('login')}>
              <Text style={[s.abaText, tela === 'login' && s.abaTextAtiva]}>Entrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.aba, tela === 'cadastro' && s.abaAtiva]}
              onPress={() => setTela('cadastro')}>
              <Text style={[s.abaText, tela === 'cadastro' && s.abaTextAtiva]}>Cadastro</Text>
            </TouchableOpacity>
          </View>

          {/* LOGIN */}
          {tela === 'login' && (
            <View style={s.form}>
              <View style={s.inputGroup}>
                <Text style={s.label}>E-MAIL</Text>
                <TextInput
                  style={s.input}
                  placeholder="exemplo@email.com"
                  placeholderTextColor="#555"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>SENHA</Text>
                <TextInput
                  style={s.input}
                  placeholder="********"
                  placeholderTextColor="#555"
                  value={senha}
                  onChangeText={setSenha}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity style={s.btnPrimario} onPress={fazerLogin} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Icon name="login" size={20} color="#000" />
                    <Text style={s.btnPrimarioText}>Entrar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* CADASTRO */}
          {tela === 'cadastro' && (
            <View style={s.form}>
              <View style={s.inputGroup}>
                <Text style={s.label}>NOME COMPLETO</Text>
                <TextInput
                  style={s.input}
                  placeholder="Como quer ser chamado?"
                  placeholderTextColor="#555"
                  value={nome}
                  onChangeText={setNome}
                />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>E-MAIL</Text>
                <TextInput
                  style={s.input}
                  placeholder="seu@email.com"
                  placeholderTextColor="#555"
                  value={cEmail}
                  onChangeText={setCEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>SENHA</Text>
                <TextInput
                  style={s.input}
                  placeholder="Min. 6 caracteres"
                  placeholderTextColor="#555"
                  value={cSenha}
                  onChangeText={setCSenha}
                  secureTextEntry
                />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>CONFIRMAR SENHA</Text>
                <TextInput
                  style={s.input}
                  placeholder="Repita a senha"
                  placeholderTextColor="#555"
                  value={cConfirm}
                  onChangeText={setCConfirm}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity style={s.btnPrimario} onPress={fazerCadastro} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Icon name="account-plus-outline" size={20} color="#000" />
                    <Text style={s.btnPrimarioText}>Criar Conta</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={s.divisorWrap}>
            <View style={s.divisorLinha} />
            <Text style={s.divisorText}>OU ENTRE COM</Text>
            <View style={s.divisorLinha} />
          </View>

          {/* Google Button Premium */}
          <TouchableOpacity style={s.googleBtn} onPress={fazerLoginGoogle} disabled={loadingGoogle}>
            {loadingGoogle
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Icon name="google" size={20} color="#FFF" />
                  <Text style={s.googleText}>Conta do Google</Text>
                </>
            }
          </TouchableOpacity>

          <Text style={s.termos}>
            Ao acessar, voce concorda com nossos{'\n'}
            <Text style={{ color: '#C9A96E' }}>Termos de Uso</Text> e <Text style={{ color: '#C9A96E' }}>Privacidade</Text>.
          </Text>

          <TouchableOpacity
            onPress={() => navigation.navigate('AdminLogin')}
            style={s.adminBtn}>
            <Icon name="storefront-outline" size={18} color="#666" />
            <Text style={s.adminBtnText}>Trocar para acesso profissional</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topo: { 
    backgroundColor: '#000', 
    padding: 24, 
    paddingTop: 60, 
    alignItems: 'center',
  },
  voltarBtn: { 
    position: 'absolute', 
    top: 52, 
    left: 20, 
    backgroundColor: '#111', 
    borderRadius: 12, 
    width: 44, 
    height: 44, 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222'
  },
  voltarBtnText: { color: '#C9A96E', fontSize: 22 },
  logoContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  topoTitulo: { color: '#FFF', fontSize: 24, fontWeight: '800', marginBottom: 8, marginTop: 10 },
  topoSub: { color: '#666', fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
  body: { padding: 24 },
  tipoBox: {
    backgroundColor: '#080808',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 18,
  },
  tipoTitulo: { color: '#FFF', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  tipoDesc: { color: '#777', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6, marginBottom: 12 },
  tipoSwitch: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 14, padding: 5 },
  tipoOpcao: {
    flex: 1,
    minHeight: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  tipoOpcaoAtiva: { backgroundColor: '#C9A96E' },
  tipoText: { color: '#777', fontSize: 13, fontWeight: '800' },
  tipoTextAtivo: { color: '#000' },
  abas: { 
    flexDirection: 'row', 
    backgroundColor: '#111', 
    borderRadius: 16, 
    padding: 6, 
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#222'
  },
  aba: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 12 },
  abaAtiva: { backgroundColor: '#C9A96E' },
  abaText: { fontSize: 14, color: '#555', fontWeight: '600' },
  abaTextAtiva: { color: '#000', fontWeight: '800' },
  form: { gap: 16 },
  inputGroup: { gap: 8 },
  label: { fontSize: 10, fontWeight: '800', color: '#C9A96E', letterSpacing: 1.5 },
  input: { 
    backgroundColor: '#111', 
    borderRadius: 14, 
    padding: 16, 
    fontSize: 15, 
    color: '#FFF', 
    borderWidth: 1, 
    borderColor: '#222' 
  },
  btnPrimario: { 
    backgroundColor: '#C9A96E', 
    borderRadius: 16, 
    padding: 18, 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    shadowColor: '#C9A96E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5
  },
  btnPrimarioText: { color: '#000', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  divisorWrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 32 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: '#222' },
  divisorText: { color: '#444', fontSize: 10, fontWeight: '800', marginHorizontal: 15, letterSpacing: 1 },
  googleBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: '#111', 
    borderRadius: 16, 
    padding: 16, 
    gap: 12, 
    borderWidth: 1, 
    borderColor: '#222' 
  },
  googleIc: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  googleText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  termos: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 18 },
  adminBtn: { 
    alignItems: 'center', 
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 32, 
    padding: 16, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#222',
    backgroundColor: '#080808'
  },
  adminBtnText: { color: '#666', fontSize: 13, fontWeight: '700' },
});
