import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
  KeyboardAvoidingView, Platform, StatusBar, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { recuperarSenha } from '../services/authService';

type Tela = 'login' | 'cadastro' | 'recuperar';

export default function AdminLoginScreen() {
  const navigation = useNavigation<any>();
  const [tela, setTela] = useState<Tela>('login');
  const [loading, setLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [cNome, setCNome] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cTel, setCTel] = useState('');
  const [cSenha, setCSenha] = useState('');
  const [cConfirm, setCConfirm] = useState('');
  const [rEmail, setREmail] = useState('');

  const forcaSenha = (s: string) => {
    if (s.length === 0) return { label: '', color: 'transparent', nivel: 0 };
    if (s.length < 4) return { label: 'Fraca', color: '#FF5252', nivel: 1 };
    if (s.length < 6) return { label: 'Razoável', color: '#FF9800', nivel: 2 };
    if (s.length < 10) return { label: 'Boa', color: '#C9A96E', nivel: 3 };
    return { label: 'Forte', color: '#4CAF50', nivel: 4 };
  };

  // ✅ Login com verificação — bloqueia contas de cliente
  const fazerLogin = async () => {
    if (!email || !senha) { Alert.alert('Atenção', 'Preencha email e senha.'); return; }
    try {
      setLoading(true);

      const { user } = await auth().signInWithEmailAndPassword(email, senha);

      // ✅ Verifica se existe doc de admin ativo
      const snap = await firestore().collection('admins').doc(user.uid).get();

      if (!snap.exists || !snap.data()?.ativo) {
        // ❌ Conta de cliente tentando entrar — bloqueia
        await auth().signOut();
        setLoading(false);
        Alert.alert(
          'Acesso Negado',
          'Esta conta não tem acesso ao painel profissional.\n\nUse o login de cliente na tela anterior.'
        );
        return;
      }

      // ✅ É admin válido — AuthContext redireciona automaticamente
      setTimeout(() => setLoading(false), 5000);

    } catch (e: any) {
      setLoading(false);
      const msg =
        e?.code === 'auth/user-not-found' ||
        e?.code === 'auth/wrong-password' ||
        e?.code === 'auth/invalid-credential'
          ? 'Email ou senha incorretos.'
          : 'Não foi possível realizar o login.';
      Alert.alert('Erro', msg);
    }
  };

  // ✅ Cadastro com logout imediato para evitar redirect errado
  const fazerCadastro = async () => {
    if (!cNome || !cEmail || !cSenha) { Alert.alert('Atenção', 'Preencha todos os campos.'); return; }
    if (cSenha.length < 6) { Alert.alert('Atenção', 'Senha deve ter pelo menos 6 caracteres.'); return; }
    if (cSenha !== cConfirm) { Alert.alert('Atenção', 'As senhas não coincidem.'); return; }
    try {
      setLoading(true);
      const { user } = await auth().createUserWithEmailAndPassword(cEmail, cSenha);
      await user.updateProfile({ displayName: cNome });

      // ✅ Salva doc no Firestore antes de qualquer redirecionamento
      await firestore().collection('admins').doc(user.uid).set({
        nome: cNome,
        email: cEmail,
        telefone: cTel || '',
        cargo: 'Admin',
        ativo: true,
        criadoEm: firestore.FieldValue.serverTimestamp(),
      });

      // ✅ Logout imediato — evita onAuthStateChanged redirecionar antes do doc existir
      await auth().signOut();

      Alert.alert('Conta criada! 🎉', 'Faça login com suas credenciais para acessar o painel.', [
        {
          text: 'Fazer Login',
          onPress: () => {
            setTela('login');
            setEmail(cEmail); // ✅ Preenche email automaticamente
            setSenha('');
            setCNome('');
            setCEmail('');
            setCTel('');
            setCSenha('');
            setCConfirm('');
          },
        },
      ]);
    } catch (e: any) {
      const msg = e.code === 'auth/email-already-in-use'
        ? 'Este email já está cadastrado.'
        : 'Erro ao criar conta. Tente novamente.';
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  const fazerRecuperar = async () => {
    if (!rEmail) { Alert.alert('Atenção', 'Informe seu email.'); return; }
    try {
      setLoading(true);
      await recuperarSenha(rEmail);
      Alert.alert('Email enviado! 📬', 'Verifique sua caixa de entrada.');
      setTela('login');
    } catch {
      Alert.alert('Erro', 'Email não encontrado.');
    } finally {
      setLoading(false);
    }
  };

  const forca = forcaSenha(cSenha);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView style={s.container} showsVerticalScrollIndicator={false}>

        {/* TOPO */}
        <View style={s.topo}>
          <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}>
            <Text style={s.voltarBtnText}>←</Text>
          </TouchableOpacity>

          <View style={s.logoContainer}>
            <Image
              source={require('../assets/logo.png')}
              style={s.logoImage}
              resizeMode="contain"
            />
          </View>

          <Text style={s.topoTitulo}>
            {tela === 'login' ? 'Painel do Profissional'
              : tela === 'cadastro' ? 'Seja um Parceiro'
              : 'Recuperar Acesso'}
          </Text>
          <Text style={s.topoSub}>
            {tela === 'login' ? 'Gerencie sua agenda e clientes'
              : tela === 'cadastro' ? 'Crie seu perfil profissional agora'
              : 'Digite seu e-mail de administrador'}
          </Text>
        </View>

        <View style={s.body}>

          {/* ─── LOGIN ─── */}
          {tela === 'login' && (
            <View style={s.form}>
              <View style={s.inputGroup}>
                <Text style={s.label}>EMAIL PROFISSIONAL</Text>
                <TextInput
                  style={s.input}
                  placeholder="admin@salao.com"
                  placeholderTextColor="#555"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>SENHA</Text>
                <View style={s.passwordWrap}>
                  <TextInput
                    style={[s.input, { flex: 1, borderWidth: 0 }]}
                    placeholder="••••••••"
                    placeholderTextColor="#555"
                    value={senha}
                    onChangeText={setSenha}
                    secureTextEntry={!mostrarSenha}
                  />
                  <TouchableOpacity onPress={() => setMostrarSenha(!mostrarSenha)} style={s.olho}>
                    <Text>{mostrarSenha ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity onPress={() => setTela('recuperar')} style={s.esqueceuBtn}>
                <Text style={s.esqueceuText}>Esqueci minha senha</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.btnPrimario} onPress={fazerLogin} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#000" />
                  : <Text style={s.btnPrimarioText}>Acessar Painel →</Text>}
              </TouchableOpacity>
			  
            </View>
          )}

          {/* ─── CADASTRO ─── */}
          {tela === 'cadastro' && (
            <View style={s.form}>
              <View style={s.inputGroup}>
                <Text style={s.label}>NOME DO ESTABELECIMENTO / PROFISSIONAL</Text>
                <TextInput style={s.input} placeholder="Ex: Barbearia do João" placeholderTextColor="#555" value={cNome} onChangeText={setCNome} />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>EMAIL</Text>
                <TextInput style={s.input} placeholder="contato@empresa.com" placeholderTextColor="#555" value={cEmail} onChangeText={setCEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>TELEFONE / WHATSAPP</Text>
                <TextInput style={s.input} placeholder="(00) 00000-0000" placeholderTextColor="#555" value={cTel} onChangeText={setCTel} keyboardType="phone-pad" />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>SENHA DE ACESSO</Text>
                <TextInput style={s.input} placeholder="Mín. 6 caracteres" placeholderTextColor="#555" value={cSenha} onChangeText={setCSenha} secureTextEntry />
                {cSenha.length > 0 && (
                  <View style={s.forcaWrap}>
                    <View style={s.forcaBarras}>
                      {[1, 2, 3, 4].map(i => (
                        <View key={i} style={[s.forcaBarra, { backgroundColor: i <= forca.nivel ? forca.color : '#222' }]} />
                      ))}
                    </View>
                    <Text style={[s.forcaLabel, { color: forca.color }]}>{forca.label}</Text>
                  </View>
                )}
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>CONFIRMAR SENHA</Text>
                <TextInput style={s.input} placeholder="Repita a senha" placeholderTextColor="#555" value={cConfirm} onChangeText={setCConfirm} secureTextEntry />
              </View>

              <TouchableOpacity style={s.btnPrimario} onPress={fazerCadastro} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#000" />
                  : <Text style={s.btnPrimarioText}>Criar Painel Profissional ✨</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ─── RECUPERAR ─── */}
          {tela === 'recuperar' && (
            <View style={s.form}>
              <Text style={s.recuperarDesc}>
                Enviaremos um e-mail com as instruções para você definir uma nova senha de acesso ao painel.
              </Text>
              <View style={s.inputGroup}>
                <Text style={s.label}>SEU EMAIL CADASTRADO</Text>
                <TextInput style={s.input} placeholder="email@exemplo.com" placeholderTextColor="#555" value={rEmail} onChangeText={setREmail} keyboardType="email-address" autoCapitalize="none" />
              </View>
              <TouchableOpacity style={s.btnPrimario} onPress={fazerRecuperar} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#000" />
                  : <Text style={s.btnPrimarioText}>Enviar Instruções →</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ─── LINKS ─── */}
          <View style={s.linksWrap}>
            <Text style={s.linkText}>
              {tela === 'login' ? 'Novo parceiro?' : 'Já tem acesso?'}{' '}
              <Text
                style={s.linkBtn}
                onPress={() => setTela(tela === 'login' ? 'cadastro' : 'login')}
              >
                {tela === 'login' ? 'Cadastre-se' : 'Fazer Login'}
              </Text>
            </Text>

            {tela !== 'login' && (
              <TouchableOpacity onPress={() => setTela('login')} style={{ marginTop: 15 }}>
                <Text style={{ color: '#666', fontSize: 12 }}>Voltar ao login</Text>
              </TouchableOpacity>
            )}

            {/* ✅ Aviso de área exclusiva — sem link para área de cliente */}
            <View style={s.separador} />
            <Text style={s.separadorText}>
              Área exclusiva para estabelecimentos parceiros
            </Text>
          </View>

        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topo: { backgroundColor: '#000', padding: 24, paddingTop: 60, alignItems: 'center' },
  voltarBtn: { position: 'absolute', top: 52, left: 20, backgroundColor: '#111', borderRadius: 12, width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  voltarBtnText: { color: '#C9A96E', fontSize: 22 },
  logoContainer: { width: 150, height: 150, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  logoImage: { width: '100%', height: '100%' },
  topoTitulo: { color: '#FFF', fontSize: 24, fontWeight: '800', marginBottom: 8, marginTop: 10 },
  topoSub: { color: '#666', fontSize: 14, textAlign: 'center' },
  body: { padding: 24 },
  form: { gap: 20 },
  inputGroup: { gap: 8 },
  label: { fontSize: 10, fontWeight: '800', color: '#C9A96E', letterSpacing: 1.5 },
  input: { backgroundColor: '#111', borderRadius: 14, padding: 16, fontSize: 15, color: '#FFF', borderWidth: 1, borderColor: '#222' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#222' },
  olho: { paddingHorizontal: 15 },
  btnPrimario: {
    backgroundColor: '#C9A96E', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 10,
    shadowColor: '#C9A96E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  btnPrimarioText: { color: '#000', fontSize: 16, fontWeight: '800' },
  esqueceuBtn: { alignSelf: 'flex-end' },
  esqueceuText: { color: '#C9A96E', fontSize: 12, fontWeight: '600' },
  recuperarDesc: { color: '#666', fontSize: 14, lineHeight: 22, marginBottom: 10 },
  forcaWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  forcaBarras: { flex: 1, flexDirection: 'row', gap: 4 },
  forcaBarra: { flex: 1, height: 4, borderRadius: 2 },
  forcaLabel: { fontSize: 11, fontWeight: '800' },
  linksWrap: { alignItems: 'center', marginTop: 40 },
  linkText: { color: '#666', fontSize: 14 },
  linkBtn: { color: '#C9A96E', fontWeight: '800' },
  separador: { width: 40, height: 1, backgroundColor: '#222', marginTop: 24, marginBottom: 12 },
  separadorText: { color: '#333', fontSize: 11, textAlign: 'center', paddingHorizontal: 20 },
});