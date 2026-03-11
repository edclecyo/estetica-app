import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { loginAdmin, recuperarSenha } from '../services/authService';

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
    if (s.length < 4) return { label: 'Fraca', color: '#FF5252', nivel: 1 };
    if (s.length < 6) return { label: 'Razoável', color: '#FF9800', nivel: 2 };
    if (s.length < 10) return { label: 'Boa', color: '#C9A96E', nivel: 3 };
    return { label: 'Forte', color: '#4CAF50', nivel: 4 };
  };

  const fazerLogin = async () => {
    if (!email || !senha) { Alert.alert('Atenção', 'Preencha email e senha.'); return; }
    try {
      setLoading(true);
      await loginAdmin(email, senha);
      navigation.replace('AdminDash');
    } catch (e: any) {
      Alert.alert('Erro', 'Email ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  const fazerCadastro = async () => {
    if (!cNome || !cEmail || !cSenha) { Alert.alert('Atenção', 'Preencha todos os campos.'); return; }
    if (cSenha.length < 6) { Alert.alert('Atenção', 'Senha deve ter pelo menos 6 caracteres.'); return; }
    if (cSenha !== cConfirm) { Alert.alert('Atenção', 'As senhas não coincidem.'); return; }
    try {
      setLoading(true);
      const { user } = await auth().createUserWithEmailAndPassword(cEmail, cSenha);
      await user.updateProfile({ displayName: cNome });
      await firestore().collection('admins').doc(user.uid).set({
        nome: cNome,
        email: cEmail,
        telefone: cTel || '',
        cargo: 'Admin',
        ativo: true,
        criadoEm: firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert('Sucesso! 🎉', 'Conta criada com sucesso!', [
        { text: 'OK', onPress: () => setTela('login') },
      ]);
    } catch (e: any) {
      const msg =
        e.code === 'auth/email-already-in-use' ? 'Este email já está cadastrado.' :
        e.code === 'auth/invalid-email' ? 'Email inválido.' :
        e.code === 'auth/weak-password' ? 'Senha muito fraca.' :
        e.message || 'Não foi possível criar a conta.';
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
      Alert.alert('Email enviado! 📬', 'Verifique sua caixa de entrada.', [
        { text: 'OK', onPress: () => setTela('login') },
      ]);
    } catch {
      Alert.alert('Erro', 'Email não encontrado.');
    } finally {
      setLoading(false);
    }
  };

  const forca = forcaSenha(cSenha);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} showsVerticalScrollIndicator={false}>

        {/* Topo decorativo */}
        <View style={s.topo}>
          <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}>
            <Text style={s.voltarBtnText}>←</Text>
          </TouchableOpacity>
          <View style={s.logoCircle}>
            <Text style={s.logoEmoji}>✂️</Text>
          </View>
          <Text style={s.topoTitulo}>
            {tela === 'login' ? 'Entrar no painel'
              : tela === 'cadastro' ? 'Criar conta'
              : 'Recuperar acesso'}
          </Text>
          <Text style={s.topoSub}>
            {tela === 'login' ? 'Gerencie seu estabelecimento'
              : tela === 'cadastro' ? 'Cadastre-se gratuitamente'
              : 'Enviaremos um link para seu email'}
          </Text>
        </View>

        {/* Card de formulário */}
        <View style={s.formCard}>

          {/* ── LOGIN ── */}
          {tela === 'login' && (
            <>
              <View style={s.campo}>
                <Text style={s.campoLabel}>EMAIL</Text>
                <View style={s.campoWrap}>
                  <TextInput
                    style={s.campoInput}
                    placeholder="seu@email.com"
                    placeholderTextColor="#bbb"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={s.campo}>
                <Text style={s.campoLabel}>SENHA</Text>
                <View style={s.campoWrap}>
                  <TextInput
                    style={[s.campoInput, { flex: 1 }]}
                    placeholder="Sua senha"
                    placeholderTextColor="#bbb"
                    value={senha}
                    onChangeText={setSenha}
                    secureTextEntry={!mostrarSenha}
                  />
                  <TouchableOpacity onPress={() => setMostrarSenha(v => !v)} style={s.olhoBtn}>
                    <Text style={s.olhoIcon}>{mostrarSenha ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity onPress={() => setTela('recuperar')} style={s.esqueceuBtn}>
                <Text style={s.esqueceuText}>Esqueci minha senha</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.btnPrimario} onPress={fazerLogin} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnPrimarioText}>Entrar →</Text>
                }
              </TouchableOpacity>
            </>
          )}

          {/* ── CADASTRO ── */}
          {tela === 'cadastro' && (
            <>
              {[
                { label: 'NOME COMPLETO', value: cNome, set: setCNome, placeholder: 'Seu nome', keyboard: 'default' as any },
                { label: 'EMAIL', value: cEmail, set: setCEmail, placeholder: 'seu@email.com', keyboard: 'email-address' as any },
                { label: 'TELEFONE', value: cTel, set: setCTel, placeholder: '(11) 99999-0000', keyboard: 'phone-pad' as any },
              ].map(({ label, value, set, placeholder, keyboard }) => (
                <View key={label} style={s.campo}>
                  <Text style={s.campoLabel}>{label}</Text>
                  <View style={s.campoWrap}>
                    <TextInput
                      style={s.campoInput}
                      placeholder={placeholder}
                      placeholderTextColor="#bbb"
                      value={value}
                      onChangeText={set}
                      keyboardType={keyboard}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              ))}

              <View style={s.campo}>
                <Text style={s.campoLabel}>SENHA</Text>
                <View style={s.campoWrap}>
                  <TextInput
                    style={[s.campoInput, { flex: 1 }]}
                    placeholder="Mínimo 6 caracteres"
                    placeholderTextColor="#bbb"
                    value={cSenha}
                    onChangeText={setCSenha}
                    secureTextEntry
                  />
                </View>
                {cSenha.length > 0 && (
                  <View style={s.forcaWrap}>
                    <View style={s.forcaBarras}>
                      {[1, 2, 3, 4].map(i => (
                        <View
                          key={i}
                          style={[s.forcaBarra, { backgroundColor: i <= forca.nivel ? forca.color : '#E0E0E0' }]}
                        />
                      ))}
                    </View>
                    <Text style={[s.forcaLabel, { color: forca.color }]}>{forca.label}</Text>
                  </View>
                )}
              </View>

              <View style={s.campo}>
                <Text style={s.campoLabel}>CONFIRMAR SENHA</Text>
                <View style={s.campoWrap}>
                  <TextInput
                    style={[s.campoInput, { flex: 1 }]}
                    placeholder="Repita a senha"
                    placeholderTextColor="#bbb"
                    value={cConfirm}
                    onChangeText={setCConfirm}
                    secureTextEntry
                  />
                  {cConfirm.length > 0 && cSenha === cConfirm && (
                    <Text style={s.checkIcon}>✓</Text>
                  )}
                </View>
              </View>

              <TouchableOpacity style={s.btnPrimario} onPress={fazerCadastro} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnPrimarioText}>Criar Conta →</Text>
                }
              </TouchableOpacity>
            </>
          )}

          {/* ── RECUPERAR ── */}
          {tela === 'recuperar' && (
            <>
              <Text style={s.recuperarDesc}>
                Informe seu email e enviaremos um link para redefinir sua senha.
              </Text>
              <View style={s.campo}>
                <Text style={s.campoLabel}>EMAIL</Text>
                <View style={s.campoWrap}>
                  <TextInput
                    style={s.campoInput}
                    placeholder="seu@email.com"
                    placeholderTextColor="#bbb"
                    value={rEmail}
                    onChangeText={setREmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <TouchableOpacity style={s.btnPrimario} onPress={fazerRecuperar} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnPrimarioText}>Enviar link →</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Links */}
        <View style={s.linksWrap}>
          {tela === 'login' && (
            <Text style={s.linkText}>
              Não tem conta?{' '}
              <Text style={s.linkBtn} onPress={() => setTela('cadastro')}>Criar grátis</Text>
            </Text>
          )}
          {tela === 'cadastro' && (
            <Text style={s.linkText}>
              Já tem conta?{' '}
              <Text style={s.linkBtn} onPress={() => setTela('login')}>Entrar</Text>
            </Text>
          )}
          {tela === 'recuperar' && (
            <Text style={s.linkText}>
              Lembrou a senha?{' '}
              <Text style={s.linkBtn} onPress={() => setTela('login')}>Entrar</Text>
            </Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  // Topo
  topo: { backgroundColor: '#1A1A1A', padding: 24, paddingTop: 52, alignItems: 'center', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  voltarBtn: { position: 'absolute', top: 52, left: 20, backgroundColor: '#2A2A2A', borderRadius: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  voltarBtnText: { color: '#fff', fontSize: 18 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#C9A96E', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  logoEmoji: { fontSize: 32 },
  topoTitulo: { color: '#FAF7F4', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  topoSub: { color: '#777', fontSize: 13, textAlign: 'center' },

  // Form
  formCard: { backgroundColor: '#fff', margin: 16, borderRadius: 24, padding: 20, marginTop: 24 },

  // Campo
  campo: { marginBottom: 16 },
  campoLabel: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1.2, marginBottom: 6 },
  campoWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#EBEBEB' },
  campoInput: { flex: 1, color: '#1A1A1A', fontSize: 14, paddingVertical: 13 },
  olhoBtn: { padding: 4 },
  olhoIcon: { fontSize: 16 },
  checkIcon: { color: '#4CAF50', fontSize: 18, fontWeight: '700' },

  // Força senha
  forcaWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  forcaBarras: { flex: 1, flexDirection: 'row', gap: 4 },
  forcaBarra: { flex: 1, height: 3, borderRadius: 2 },
  forcaLabel: { fontSize: 11, fontWeight: '600' },

  esqueceuBtn: { alignItems: 'flex-end', marginBottom: 16, marginTop: -8 },
  esqueceuText: { color: '#C9A96E', fontSize: 12, fontWeight: '600' },

  recuperarDesc: { color: '#888', fontSize: 13, lineHeight: 20, marginBottom: 16 },

  // Botão
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4 },
  btnPrimarioText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Links
  linksWrap: { alignItems: 'center', paddingVertical: 16 },
  linkText: { color: '#888', fontSize: 13 },
  linkBtn: { color: '#1A1A1A', fontWeight: '700' },
});