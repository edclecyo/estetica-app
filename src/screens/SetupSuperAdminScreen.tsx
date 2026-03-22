// src/screens/SetupSuperAdminScreen.tsx
// ⚠️ TELA TEMPORÁRIA — DELETE APÓS CRIAR O SUPER ADMIN

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import functions from '@react-native-firebase/functions';

export default function SetupSuperAdminScreen() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [chave, setChave] = useState('');
  const [loading, setLoading] = useState(false);
  const [criado, setCriado] = useState(false);

  const criar = async () => {
    if (!nome || !email || !senha || !chave) {
      Alert.alert('Atenção', 'Preencha todos os campos.');
      return;
    }
    if (senha.length < 8) {
      Alert.alert('Atenção', 'Senha deve ter pelo menos 8 caracteres.');
      return;
    }

    Alert.alert(
      '⚠️ Confirmar',
      `Criar Super Admin?\n\nNome: ${nome}\nEmail: ${email}\n\nEsta ação só pode ser feita UMA VEZ.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Criar',
          onPress: async () => {
            try {
              setLoading(true);
              await functions().httpsCallable('criarSuperAdmin')({
                nome,
                email,
                senha,
                chaveSecreta: chave,
              });

              setCriado(true);
              Alert.alert(
                '✅ Super Admin Criado!',
                `Conta criada com sucesso!\n\nEmail: ${email}\n\n⚠️ IMPORTANTE: Delete esta tela do código agora!`
              );
            } catch (e: any) {
              const msg =
                e?.message?.includes('já existe') ? 'Super Admin já existe!' :
                e?.message?.includes('Chave inválida') ? 'Chave secreta incorreta!' :
                'Erro ao criar. Verifique os dados.';
              Alert.alert('Erro', msg);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (criado) {
    return (
      <View style={s.container}>
        <View style={s.sucessoCard}>
          <Text style={s.sucessoEmoji}>✅</Text>
          <Text style={s.sucessoTitulo}>Super Admin Criado!</Text>
          <Text style={s.sucessoSub}>
            Agora faça login no AdminLoginScreen com as credenciais criadas.
          </Text>
          <View style={s.avisoCard}>
            <Text style={s.avisoText}>
              ⚠️ DELETE esta tela e remova a rota do Navigation.tsx agora que o Super Admin foi criado!
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll}>
      <View style={s.avisoCard}>
        <Text style={s.avisoText}>
          ⚠️ TELA TEMPORÁRIA{'\n'}Delete após criar o Super Admin
        </Text>
      </View>

      <Text style={s.titulo}>Setup Super Admin</Text>
      <Text style={s.sub}>Esta função só pode ser executada uma única vez.</Text>

      {[
        { label: 'NOME', value: nome, set: setNome, placeholder: 'Nome do proprietário' },
        { label: 'EMAIL', value: email, set: setEmail, placeholder: 'superadmin@beautyhub.com', keyboard: 'email-address' as any },
        { label: 'SENHA (mín. 8 caracteres)', value: senha, set: setSenha, placeholder: '••••••••', secure: true },
        { label: 'CHAVE SECRETA', value: chave, set: setChave, placeholder: 'Chave de autorização', secure: true },
      ].map(({ label, value, set, placeholder, keyboard, secure }) => (
        <View key={label} style={s.inputGroup}>
          <Text style={s.label}>{label}</Text>
          <TextInput
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor="#555"
            value={value}
            onChangeText={set}
            keyboardType={keyboard || 'default'}
            autoCapitalize="none"
            secureTextEntry={secure}
          />
        </View>
      ))}

      <TouchableOpacity
        style={[s.btn, loading && s.btnDisabled]}
        onPress={criar}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#000" />
          : <Text style={s.btnText}>⚡ Criar Super Admin</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { padding: 24, paddingTop: 60 },
  avisoCard: {
    backgroundColor: 'rgba(255,82,82,0.12)', borderRadius: 12,
    padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255,82,82,0.3)',
  },
  avisoText: { color: '#FF5252', fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  titulo: { color: '#FFF', fontSize: 26, fontWeight: '900', marginBottom: 6 },
  sub: { color: '#555', fontSize: 13, marginBottom: 32 },
  inputGroup: { marginBottom: 20 },
  label: { color: '#C9A96E', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  input: {
    backgroundColor: '#111', borderRadius: 14, padding: 16,
    color: '#FFF', fontSize: 15, borderWidth: 1, borderColor: '#1A1A1A',
  },
  btn: {
    backgroundColor: '#C9A96E', borderRadius: 16,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { backgroundColor: '#333' },
  btnText: { color: '#000', fontSize: 15, fontWeight: '900' },
  sucessoCard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  sucessoEmoji: { fontSize: 60 },
  sucessoTitulo: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  sucessoSub: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});