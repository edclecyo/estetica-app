import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  loginClienteEmail,
  cadastrarClienteEmail,
  loginClienteGoogle,
} from '../services/clienteAuthService';

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

  const fazerLogin = async () => {
    if (!email || !senha) { Alert.alert('Atenção', 'Preencha email e senha.'); return; }
    try {
      setLoading(true);
      await loginClienteEmail(email, senha);
      navigation.replace('Detalhe', { estabelecimentoId });
    } catch (e: any) {
      Alert.alert('Erro', 'Email ou senha incorretos.');
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
      navigation.replace('Detalhe', { estabelecimentoId });
    } catch (e: any) {
      const msg =
        e.code === 'auth/email-already-in-use' ? 'Este email já está cadastrado.' :
        e.code === 'auth/invalid-email' ? 'Email inválido.' :
        e.message || 'Não foi possível criar a conta.';
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  const fazerLoginGoogle = async () => {
    try {
      setLoadingGoogle(true);
      await loginClienteGoogle();
      navigation.replace('Detalhe', { estabelecimentoId });
    } catch (e: any) {
      Alert.alert('Erro', 'Não foi possível entrar com Google.');
    } finally {
      setLoadingGoogle(false);
    }
  };

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Topo */}
      <View style={s.topo}>
        <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}>
          <Text style={s.voltarBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.topoEmoji}>✂️</Text>
        <Text style={s.topoTitulo}>
          {tela === 'login' ? 'Entrar para agendar' : 'Criar conta'}
        </Text>
        <Text style={s.topoSub}>
          {tela === 'login'
            ? 'Acesse sua conta para confirmar o agendamento'
            : 'Crie sua conta gratuitamente'}
        </Text>
      </View>

      <View style={s.body}>
        {/* Google */}
        <TouchableOpacity style={s.googleBtn} onPress={fazerLoginGoogle} disabled={loadingGoogle}>
          {loadingGoogle
            ? <ActivityIndicator color="#1A1A1A" />
            : <>
                <Text style={s.googleIc}>G</Text>
                <Text style={s.googleText}>Continuar com Google</Text>
              </>
          }
        </TouchableOpacity>

        <View style={s.divisorWrap}>
          <View style={s.divisorLinha} />
          <Text style={s.divisorText}>ou</Text>
          <View style={s.divisorLinha} />
        </View>

        {/* Abas */}
        <View style={s.abas}>
          <TouchableOpacity
            style={[s.aba, tela === 'login' && s.abaAtiva]}
            onPress={() => setTela('login')}>
            <Text style={[s.abaText, tela === 'login' && s.abaTextAtiva]}>Entrar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.aba, tela === 'cadastro' && s.abaAtiva]}
            onPress={() => setTela('cadastro')}>
            <Text style={[s.abaText, tela === 'cadastro' && s.abaTextAtiva]}>Criar conta</Text>
          </TouchableOpacity>
        </View>

        {/* LOGIN */}
        {tela === 'login' && (
          <View style={s.form}>
            <Text style={s.label}>EMAIL</Text>
            <TextInput
              style={s.input}
              placeholder="seu@email.com"
              placeholderTextColor="#bbb"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={s.label}>SENHA</Text>
            <TextInput
              style={s.input}
              placeholder="Sua senha"
              placeholderTextColor="#bbb"
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
            />
            <TouchableOpacity style={s.btnPrimario} onPress={fazerLogin} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnPrimarioText}>Entrar →</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* CADASTRO */}
        {tela === 'cadastro' && (
          <View style={s.form}>
            <Text style={s.label}>NOME</Text>
            <TextInput
              style={s.input}
              placeholder="Seu nome completo"
              placeholderTextColor="#bbb"
              value={nome}
              onChangeText={setNome}
            />
            <Text style={s.label}>EMAIL</Text>
            <TextInput
              style={s.input}
              placeholder="seu@email.com"
              placeholderTextColor="#bbb"
              value={cEmail}
              onChangeText={setCEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={s.label}>SENHA</Text>
            <TextInput
              style={s.input}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor="#bbb"
              value={cSenha}
              onChangeText={setCSenha}
              secureTextEntry
            />
            <Text style={s.label}>CONFIRMAR SENHA</Text>
            <TextInput
              style={s.input}
              placeholder="Repita a senha"
              placeholderTextColor="#bbb"
              value={cConfirm}
              onChangeText={setCConfirm}
              secureTextEntry
            />
            <TouchableOpacity style={s.btnPrimario} onPress={fazerCadastro} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnPrimarioText}>Criar Conta →</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.termos}>
          Ao continuar você concorda com nossos Termos de Uso e Política de Privacidade.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  topo: { backgroundColor: '#1A1A1A', padding: 24, paddingTop: 52, alignItems: 'center', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  voltarBtn: { position: 'absolute', top: 52, left: 20, backgroundColor: '#2A2A2A', borderRadius: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  voltarBtnText: { color: '#fff', fontSize: 18 },
  topoEmoji: { fontSize: 36, marginBottom: 10 },
  topoTitulo: { color: '#FAF7F4', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  topoSub: { color: '#777', fontSize: 13, textAlign: 'center' },
  body: { padding: 20 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1.5, borderColor: '#E0E0E0', marginBottom: 16 },
  googleIc: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  googleText: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  divisorWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: '#E0E0E0' },
  divisorText: { color: '#aaa', fontSize: 12 },
  abas: { flexDirection: 'row', backgroundColor: '#E0E0E0', borderRadius: 12, padding: 3, marginBottom: 20 },
  aba: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  abaAtiva: { backgroundColor: '#fff' },
  abaText: { fontSize: 13, color: '#888', fontWeight: '500' },
  abaTextAtiva: { color: '#1A1A1A', fontWeight: '700' },
  form: { gap: 4 },
  label: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1.2, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 14, color: '#1A1A1A', borderWidth: 1.5, borderColor: '#E0E0E0', marginBottom: 4 },
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 12 },
  btnPrimarioText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  termos: { color: '#bbb', fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 16 },
});