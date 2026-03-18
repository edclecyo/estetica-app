import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, Switch, Image, Dimensions
} from 'react-native';
import Slider from '@react-native-community/slider';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import type { Estabelecimento, Servico, Agendamento } from '../types';
import { launchImageLibrary } from "react-native-image-picker";
import storage from "@react-native-firebase/storage";
import GetLocation from 'react-native-get-location'; // Certifique-se de instalar: npm install react-native-get-location

const { width } = Dimensions.get('window');

// --- CONSTANTES ---
const EMOJIS = [
  '✂️', '💇', '💇‍♂️', '💇‍♀️', '💈', '🪮', '🧔🏻‍♂️', '🧴', '🚿',
  '💅', '💅🏾', '💅🏼', '🎨', '🖌️', '🧤',
  '💄', '💋', '👄', '👁️', '✨', '🎭', '💉', '📏',
  '🌿', '🧘', '💆', '💆‍♂️', '💆‍♀️', '🛁', '🧖‍♀️', '🧖‍♂️', '🌸', '🕯️', '🍵', '🎋', '🐚',
  '👙', '🪒', '🍯', '🦵', '🌡️', '⭐', '💎', '👑', '📸', '📍', '🔥', '🖋️', '🐉', '🩸'
];

const TIPOS = [
  'Salão de Beleza', 'Barbearia Premium', 'Espaço de Unhas', 'Manicure & Pedicure',
  'Clínica de Estética', 'Estética Avançada', 'Spa & Relaxamento', 'Especialista em Cabelos',
  'Terapia Capilar', 'Estúdio de Maquiagem', 'Design de Sobrancelhas', 'Extensão de Cílios',
  'Micropigmentação', 'Depilação a Laser', 'Depilação com Cera', 'Estúdio de Tatuagem',
  'Body Piercing', 'Massoterapia', 'Bronzeamento Artificial', 'Podologia'
];

const PRESETS_CORES = [
  '#C9A96E', '#D4A5A5', '#A5BDD4', '#A5D4B5', '#C4A5D4', 
  '#1A1A1A', '#FF5F5F', '#4CAF50', '#2196F3', '#FFFFFF'
];

const fn = functions();

export default function AdminEstabScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { admin } = useAuth();
  const { estabelecimentoId } = route.params;
  const isNovo = estabelecimentoId === 'novo';

  const [aba, setAba] = useState<'info' | 'servicos' | 'horarios' | 'agenda'>('info');
  const [loading, setLoading] = useState(!isNovo);
  const [salvando, setSalvando] = useState(false);

  // Estados dos Campos
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [endereco, setEndereco] = useState('');
  const [cep, setCep] = useState('');
  const [bairro, setBairro] = useState('');
  const [numero, setNumero] = useState('');
  const [cidade, setCidade] = useState('');
  const [telefone, setTelefone] = useState('');
  const [descricao, setDescricao] = useState('');
  const [horarioFunc, setHorarioFunc] = useState('08:00 - 20:00');
  const [img, setImg] = useState('✨');
  
  // Localização Real
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);

  const [r, setR] = useState(212);
  const [g, setG] = useState(165);
  const [b, setB] = useState(165);
  const [cor, setCor] = useState('#D4A5A5');

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [horarios, setHorarios] = useState<string[]>([]);
  const [agends, setAgends] = useState<Agendamento[]>([]);
  const [fotoPerfil, setFotoPerfil] = useState('');
  const [fotoCapa, setFotoCapa] = useState('');

  const [gInicio, setGInicio] = useState('08:00');
  const [gFim, setGFim] = useState('18:00');
  const [gIntervalo, setGIntervalo] = useState('60');

  const [nsNome, setNsNome] = useState('');
  const [nsPreco, setNsPreco] = useState('');
  const [nsDuracao, setNsDuracao] = useState('');

  const stats = useMemo(() => {
    const concluido = agends.filter(a => a.status === 'concluido').reduce((acc, curr) => acc + (curr.servicoPreco || 0), 0);
    const pendente = agends.filter(a => a.status === 'confirmado').reduce((acc, curr) => acc + (curr.servicoPreco || 0), 0);
    return { concluido, pendente, total: concluido + pendente };
  }, [agends]);

  const updateHex = (red: number, green: number, blue: number) => {
    const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
    const hex = `#${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase();
    setCor(hex);
  };

  const buscarLocalizacaoReal = async () => {
    try {
      const location = await GetLocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });
      setCoords({ lat: location.latitude, lng: location.longitude });
      Alert.alert("Localização obtida!", "Sua latitude e longitude foram capturadas com sucesso.");
    } catch (error: any) {
      Alert.alert("Erro de Localização", "Não foi possível obter sua posição atual.");
    }
  };

  const gerarGradeHorarios = () => {
    const lista: string[] = [];
    let atual = new Date(`2026-01-01T${gInicio}:00`);
    const fim = new Date(`2026-01-01T${gFim}:00`);
    if (isNaN(atual.getTime()) || isNaN(fim.getTime())) {
        Alert.alert('Erro', 'Formato de hora inválido. Use HH:MM');
        return;
    }
    while (atual <= fim) {
      const h = atual.getHours().toString().padStart(2, '0');
      const m = atual.getMinutes().toString().padStart(2, '0');
      lista.push(`${h}:${m}`);
      atual.setMinutes(atual.getMinutes() + Number(gIntervalo));
    }
    const novosHorarios = Array.from(new Set([...horarios, ...lista])).sort();
    setHorarios(novosHorarios);
    Alert.alert('Sucesso ✅', `${lista.length} horários adicionados!`);
  };

  useEffect(() => {
    if (!isNovo) {
      firestore().collection('estabelecimentos').doc(estabelecimentoId).get().then(snap => {
        if (snap.exists) {
          const d = snap.data() as any;
          setNome(d.nome); setTipo(d.tipo); setEndereco(d.endereco);
          setCep(d.cep || ''); setBairro(d.bairro || ''); setNumero(d.numero || '');
          setCidade(d.cidade); setTelefone(d.telefone); setDescricao(d.descricao);
          setHorarioFunc(d.horarioFuncionamento); setImg(d.img); setCor(d.cor);
          setServicos(d.servicos || []); setHorarios(d.horarios || []);
          setFotoPerfil(d.fotoPerfil || ''); setFotoCapa(d.fotoCapa || '');
          if(d.coords) setCoords(d.coords);
          if (d.cor?.startsWith('#')) {
            setR(parseInt(d.cor.slice(1, 3), 16));
            setG(parseInt(d.cor.slice(3, 5), 16));
            setB(parseInt(d.cor.slice(5, 7), 16));
          }
        }
        setLoading(false);
      }).catch(() => setLoading(false));

      const unsub = firestore().collection('agendamentos').where('estabelecimentoId', '==', estabelecimentoId).onSnapshot(snap => {
          setAgends(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Agendamento[]);
        }, error => console.log('Agendamentos error:', error));
      return unsub;
    } else {
      setLoading(false);
      buscarLocalizacaoReal(); // Tenta pegar a localização ao criar um novo
    }
  }, []);

  const salvar = async () => {
    if (!nome || !endereco) { Alert.alert('Atenção', 'Nome e endereço são obrigatórios.'); return; }
    try {
      setSalvando(true);
      await fn.httpsCallable('salvarEstabelecimento')({
        estabelecimentoId: isNovo ? undefined : estabelecimentoId,
        nome, tipo, endereco, cep, bairro, numero, cidade, telefone, descricao,
        horarioFuncionamento: horarioFunc, img, cor, servicos, horarios,
        fotoPerfil, fotoCapa, avaliacao: 5.0, ativo: true,
        coords: coords // Salvando a latitude e longitude real
      });
      Alert.alert('Sucesso! ✅', isNovo ? 'Criado!' : 'Atualizado!', [
        { text: 'OK', onPress: () => isNovo && navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const escolherImagem = async (tipoImg: 'perfil' | 'capa') => {
    if (isNovo) { Alert.alert("Aviso", "Salve o local antes de adicionar fotos."); return; }
    const res = await launchImageLibrary({ mediaType: "photo", quality: 0.5 });
    if (!res.assets || !res.assets[0]) return;
    
    const uri = res.assets[0].uri;
    const extension = uri?.split('.').pop();
    const path = `estabelecimentos/${estabelecimentoId}/${tipoImg}.${extension}`;
    const reference = storage().ref(path);

    try {
      setSalvando(true);
      await reference.putFile(uri!);
      const url = await reference.getDownloadURL();
      if (tipoImg === 'perfil') { setFotoPerfil(url); setImg(url); } else { setFotoCapa(url); }
      await firestore().collection('estabelecimentos').doc(estabelecimentoId).update({
        [tipoImg === 'perfil' ? 'fotoPerfil' : 'fotoCapa']: url,
        img: tipoImg === 'perfil' ? url : img
      });
      Alert.alert("Sucesso! ✅", "Foto atualizada.");
    } catch (e) { Alert.alert("Erro", "Falha no upload."); } finally { setSalvando(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#C9A96E" /></View>;

  return (
    <View style={s.container}>
      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>✕</Text>
        </TouchableOpacity>
        <View style={s.headerTitleContainer}>
          <Text style={[s.headerLabel, { color: cor }]}>{isNovo ? 'NOVO LOCAL' : tipo.toUpperCase()}</Text>
          <Text style={s.headerTitle} numberOfLines={1}>{isNovo ? 'Criar Cadastro' : nome}</Text>
        </View>
        <TouchableOpacity onPress={salvar} disabled={salvando} style={[s.saveBtn, { backgroundColor: cor }]}>
          {salvando ? <ActivityIndicator size="small" color="#111" /> : <Text style={s.saveBtnText}>Salvar</Text>}
        </TouchableOpacity>
      </View>

      {/* TABS E DASHBOARD OMITIDOS PARA BREVIDADE, MAS MANTIDOS NO SEU CÓDIGO --- */}
      
      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        
        {aba === 'info' && (
          <View>
            <Text style={s.sectionTitle}>Aparência & Identidade</Text>
            <View style={s.card}>
               <View style={s.rowBetween}>
                 <View style={s.emojiContainer}>
                    <Text style={s.inputLabel}>ÍCONE PRINCIPAL</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.emojiList}>
                      {EMOJIS.map((e, i) => (
                        <TouchableOpacity 
                          key={`${e}-${i}`} 
                          onPress={()=>setImg(e)}
                          style={[s.emojiBtn, img === e && { borderColor: cor, backgroundColor: cor + '44', borderWidth: 2 }]}
                        >
                          <Text style={s.emojiTxt}>{e}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                 </View>
                 <View style={[s.colorPreview, { backgroundColor: cor }]} />
               </View>

               <Text style={[s.inputLabel, { marginTop: 25 }]}>MIXER DE CORES</Text>
               <View style={s.mixerContainer}>
                  {[['R', r, setR, '#FF4444'], ['G', g, setG, '#4CAF50'], ['B', b, setB, '#2196F3']].map(([l, val, setVal, color]: any) => (
                    <View key={l} style={s.mixerRow}>
                      <Text style={[s.mixerLabel, { color }]}>{l}</Text>
                      <Slider
                        style={{flex: 1, height: 40}}
                        minimumValue={0} maximumValue={255} value={val}
                        minimumTrackTintColor={color}
                        onValueChange={(v) => { setVal(v); updateHex(l==='R'?v:r, l==='G'?v:g, l==='B'?v:b); }}
                      />
                      <Text style={s.mixerValue}>{Math.round(val)}</Text>
                    </View>
                  ))}
               </View>
            </View>

            <Text style={s.sectionTitle}>Endereço Detalhado</Text>
            <View style={s.card}>
              <TouchableOpacity onPress={buscarLocalizacaoReal} style={[s.locBtn, { borderColor: cor }]}>
                <Text style={{color: cor, fontWeight: '800', fontSize: 11}}>📍 {coords ? 'LOCALIZAÇÃO CAPTURADA' : 'CAPTURAR MINHA POSIÇÃO ATUAL'}</Text>
              </TouchableOpacity>

              <View style={s.inputBox}><Text style={s.inputLabel}>NOME DO ESTABELECIMENTO</Text><TextInput style={s.input} value={nome} onChangeText={setNome} placeholderTextColor="#444" /></View>
              
              <View style={s.row}>
                <View style={[s.inputBox, { flex: 2, marginRight: 10 }]}><Text style={s.inputLabel}>RUA / LOGRADOURO</Text><TextInput style={s.input} value={endereco} onChangeText={setEndereco} placeholderTextColor="#444" /></View>
                <View style={[s.inputBox, { flex: 1 }]}><Text style={s.inputLabel}>Nº</Text><TextInput style={s.input} value={numero} onChangeText={setNumero} placeholderTextColor="#444" /></View>
              </View>

              <View style={s.row}>
                <View style={[s.inputBox, { flex: 1, marginRight: 10 }]}><Text style={s.inputLabel}>BAIRRO</Text><TextInput style={s.input} value={bairro} onChangeText={setBairro} placeholderTextColor="#444" /></View>
                <View style={[s.inputBox, { flex: 1 }]}><Text style={s.inputLabel}>CEP</Text><TextInput style={s.input} value={cep} onChangeText={setCep} keyboardType="numeric" placeholderTextColor="#444" /></View>
              </View>

              <View style={s.row}>
                <View style={[s.inputBox, { flex: 1, marginRight: 10 }]}><Text style={s.inputLabel}>CIDADE</Text><TextInput style={s.input} value={cidade} onChangeText={setCidade} placeholderTextColor="#444" /></View>
                <View style={[s.inputBox, { flex: 1 }]}><Text style={s.inputLabel}>CONTATO (WHATSAPP)</Text><TextInput style={s.input} value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" placeholderTextColor="#444" /></View>
              </View>
            </View>
          </View>
        )}

        {/* RESTANTE DAS ABAS IGUAIS AO SEU CÓDIGO ORIGINAL --- */}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', borderBottomWidth: 1, borderBottomColor: '#222' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: '#888', fontSize: 18 },
  headerTitleContainer: { flex: 1, paddingHorizontal: 15 },
  headerLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  saveBtnText: { color: '#111', fontWeight: '800' },
  body: { flex: 1, paddingHorizontal: 20 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 15, marginTop: 10 },
  card: { backgroundColor: '#121212', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  inputBox: { marginBottom: 18 },
  inputLabel: { color: '#555', fontSize: 10, fontWeight: '800', marginBottom: 8 },
  input: { backgroundColor: '#000', borderRadius: 15, padding: 15, color: '#FFF', fontSize: 15, borderWidth: 1, borderColor: '#1A1A1A' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locBtn: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 20, alignItems: 'center', borderStyle: 'dashed' },
  emojiContainer: { flex: 1 },
  emojiList: { marginTop: 10 },
  emojiBtn: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  emojiTxt: { fontSize: 24 },
  colorPreview: { width: 45, height: 45, borderRadius: 22.5, borderWidth: 3, borderColor: '#FFF' },
  mixerContainer: { backgroundColor: '#000', padding: 15, borderRadius: 15 },
  mixerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  mixerLabel: { width: 20, fontWeight: '900', fontSize: 12 },
  mixerValue: { width: 30, color: '#FFF', fontSize: 10, textAlign: 'right' },
  // ... Outros estilos omitidos para economizar espaço
});