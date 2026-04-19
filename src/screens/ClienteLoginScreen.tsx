import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
  StatusBar, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  loginClienteEmail,
  cadastrarClienteEmail,
  loginClienteGoogle,
} from '../services/clienteAuthService';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { registrarTokenPush } from '../services/notificacao.Service';
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
  if (!email || !senha) { Alert.alert('Atenção', 'Preencha email e senha.'); return; }
  try {
    setLoading(true);

    // ✅ Faz login temporário para verificar
    const { user } = await auth().signInWithEmailAndPassword(email, senha);

    // ✅ Verifica se é admin ANTES do AuthContext reagir
    const snap = await firestore().collection('admins').doc(user.uid).get();

    if (snap.exists && snap.data()?.ativo) {
      // ❌ É admin — faz logout imediato sem deixar o AuthContext reagir
      await auth().signOut();
      setLoading(false);
      Alert.alert(
        'Acesso Negado',
        'Esta é uma conta de estabelecimento.\n\nUse o botão "Acesso Profissional 🔧" abaixo.'
      );
      return;
    }

    // ✅ É cliente — salva token e segue
    await registrarTokenPush(user.uid, 'cliente');
    sucessoAuth();

  } catch (e: any) {
    const msg =
      e?.code === 'auth/user-not-found' ||
      e?.code === 'auth/wrong-password' ||
      e?.code === 'auth/invalid-credential'
        ? 'Email ou senha incorretos.'
        : 'Não foi possível realizar o login.';
    Alert.alert('Erro', msg);
  } finally {
    setLoading(false);
  }
};

  const fazerCadastro = async () => {
    if (!nome || !cEmail || !cSenha) { Alert.alert('Atenção', 'Preencha todos os campos.'); return; }
    if (cSenha.length < 6) { Alert.alert('Atenção', 'Senha deve ter pelo menos 6 caracteres.'); return; }
    if (cSenha !== cConfirm) { Alert.alert('Atenção', 'As senhas não coincidem.'); return; }
    
    try {
      setLoading(true);
      await cadastrarClienteEmail(nome, cEmail, cSenha);
      sucessoAuth();
    } catch (e: any) {
      let msg = 'Não foi possível criar a conta.';
      if (e?.code === 'auth/email-already-in-use') msg = 'Este email já está cadastrado.';
      else if (e?.code === 'auth/invalid-email') msg = 'Email inválido.';
      else if (e?.code === 'auth/weak-password') msg = 'A senha é muito fraca.';
      else if (e?.message) msg = e.message;
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  const fazerLoginGoogle = async () => {
  try {
    setLoadingGoogle(true);

    // ✅ Faz login Google
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut();
    const signInResult = await GoogleSignin.signIn();
    const idToken = signInResult.data?.idToken;
    if (!idToken) throw new Error('Token não encontrado.');

    const googleCredential = auth.GoogleAuthProvider.credential(idToken);
    const { user } = await auth().signInWithCredential(googleCredential);

    // ✅ Verifica se é admin antes do AuthContext reagir
    const snap = await firestore().collection('admins').doc(user.uid).get();

    if (snap.exists && snap.data()?.ativo) {
      await auth().signOut();
      try { await GoogleSignin.signOut(); } catch {}
      setLoadingGoogle(false);
      Alert.alert(
        'Acesso Negado',
        'Esta é uma conta de estabelecimento.\n\nUse o botão "Acesso Profissional 🔧" abaixo.'
      );
      return;
    }

    // ✅ É cliente — salva dados e segue
    try {
      const doc = await firestore().collection('clientes').doc(user.uid).get();
      if (!doc.exists) {
        await firestore().collection('clientes').doc(user.uid).set({
          nome: user.displayName || '',
          email: user.email || '',
          foto: user.photoURL || '',
          criadoEm: firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    } catch {}

    await registrarTokenPush(user.uid, 'cliente');
    sucessoAuth();

  } catch (e: any) {
    console.log('Erro Google:', e);
    Alert.alert('Erro', 'Não foi possível entrar com Google.');
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
            <Text style={s.voltarBtnText}>←</Text>
          </TouchableOpacity>
          
          {/* Logo BeautyHub Substituindo o Círculo com Emoji */}
          <View style={s.logoContainer}>
            <Image 
              source={require('../assets/logo.png')} 
              style={s.logoImage}
              resizeMode="contain"
            />
          </View>
          
          <Text style={s.topoTitulo}>
            {tela === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </Text>
          <Text style={s.topoSub}>
            {tela === 'login'
              ? 'Acesse para gerenciar seus agendamentos'
              : 'Cadastre-se para agendar com facilidade'}
          </Text>
        </View>

        <View style={s.body}>
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
                  placeholder="••••••••"
                  placeholderTextColor="#555"
                  value={senha}
                  onChangeText={setSenha}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity style={s.btnPrimario} onPress={fazerLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnPrimarioText}>Entrar →</Text>}
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
                  placeholder="Mín. 6 caracteres"
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
                {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnPrimarioText}>Criar Conta ✨</Text>}
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
                  <Text style={s.googleIc}>G</Text>
                  <Text style={s.googleText}>Conta do Google</Text>
                </>
            }
          </TouchableOpacity>

          <Text style={s.termos}>
            Ao acessar, você concorda com nossos{'\n'}
            <Text style={{ color: '#C9A96E' }}>Termos de Uso</Text> e <Text style={{ color: '#C9A96E' }}>Privacidade</Text>.
          </Text>

          <TouchableOpacity
            onPress={() => navigation.navigate('AdminLogin')}
            style={s.adminBtn}>
            <Text style={s.adminBtnText}>Acesso Profissional 🔧</Text>
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
    marginTop: 32, 
    padding: 16, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#222',
    backgroundColor: '#080808'
  },
  adminBtnText: { color: '#666', fontSize: 13, fontWeight: '700' },
});