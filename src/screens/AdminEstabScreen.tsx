import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, Switch, Image
} from 'react-native';
import Slider from '@react-native-community/slider';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import type { Estabelecimento, Servico, Agendamento } from '../types';
import { launchImageLibrary } from "react-native-image-picker";
import storage from "@react-native-firebase/storage";

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
  'Body Piercing', 'Massoterapia', 'Bronzeamento Artificial', 'Podologia',
  'Harmonização Facial', 'Estúdio de Yoga', 'Centro Holístico'
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
  const [cidade, setCidade] = useState('');
  const [telefone, setTelefone] = useState('');
  const [descricao, setDescricao] = useState('');
  const [horarioFunc, setHorarioFunc] = useState('08:00 - 20:00');
  const [img, setImg] = useState('✨');
  
  const [r, setR] = useState(212);
  const [g, setG] = useState(165);
  const [b, setB] = useState(165);
  const [cor, setCor] = useState('#D4A5A5');

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [horarios, setHorarios] = useState<string[]>([]);
  const [agends, setAgends] = useState<Agendamento[]>([]);
  const [fotoPerfil, setFotoPerfil] = useState('');
  const [fotoCapa, setFotoCapa] = useState('');

  // Estados para o Gerador de Horários
  const [gInicio, setGInicio] = useState('08:00');
  const [gFim, setGFim] = useState('18:00');
  const [gIntervalo, setGIntervalo] = useState('60');

  const [nsNome, setNsNome] = useState('');
  const [nsPreco, setNsPreco] = useState('');
  const [nsDuracao, setNsDuracao] = useState('');

  // ─── LÓGICA DE DASHBOARD (Item 2) ───────────────
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
    Alert.alert('Sucesso ✅', `${lista.length} horários adicionados à grade!`);
  };

  useEffect(() => {
    if (!isNovo) {
      firestore().collection('estabelecimentos').doc(estabelecimentoId).get().then(snap => {
        if (snap.exists) {
          const d = snap.data() as Estabelecimento;
          setNome(d.nome); setTipo(d.tipo); setEndereco(d.endereco);
          setCidade(d.cidade); setTelefone(d.telefone); setDescricao(d.descricao);
          setHorarioFunc(d.horarioFuncionamento); setImg(d.img); setCor(d.cor);
          setServicos(d.servicos || []); setHorarios(d.horarios || []);
          setFotoPerfil(d.fotoPerfil || ''); setFotoCapa(d.fotoCapa || '');
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
    }
  }, []);

  const salvar = async () => {
    if (!nome || !endereco) { Alert.alert('Atenção', 'Nome e endereço são obrigatórios.'); return; }
    try {
      setSalvando(true);
      await fn.httpsCallable('salvarEstabelecimento')({
        estabelecimentoId: isNovo ? undefined : estabelecimentoId,
        nome, tipo, endereco, cidade, telefone, descricao,
        horarioFuncionamento: horarioFunc, img, cor, servicos, horarios,
        fotoPerfil, fotoCapa, avaliacao: 5.0, ativo: true,
      });
      Alert.alert('Sucesso! ✅', isNovo ? 'Estabelecimento criado!' : 'Configurações atualizadas!', [
        { text: 'OK', onPress: () => isNovo && navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const escolherImagem = async (tipoImg: 'perfil' | 'capa') => {
  // 1. Verificação de ID para evitar erro de pasta inexistente
  if (isNovo) {
    Alert.alert("Aviso", "Salve o nome do estabelecimento antes de adicionar fotos.");
    return;
  }

  const res = await launchImageLibrary({ mediaType: "photo", quality: 0.5 }); // Qualidade 0.5 para upload rápido
  if (!res.assets || !res.assets[0]) return;
  
  const uri = res.assets[0].uri;
  const extension = uri?.split('.').pop(); // Pega a extensão real (.jpg, .png)
  const path = `estabelecimentos/${estabelecimentoId}/${tipoImg}.${extension}`;
  const reference = storage().ref(path);

  try {
    setSalvando(true);

    // 2. Faz o upload e aguarda o término real
    const task = reference.putFile(uri!);
    
    // Monitora o progresso (opcional, mas evita o erro de 'not found')
    task.on('state_changed', taskSnapshot => {
      console.log(`${taskSnapshot.bytesTransferred} transferidos de ${taskSnapshot.totalBytes}`);
    });

    await task; // Aguarda o upload concluir totalmente

    // 3. Só agora busca a URL
    const url = await reference.getDownloadURL();

    if (tipoImg === 'perfil') {
      setFotoPerfil(url);
      setImg(url); 
    } else {
      setFotoCapa(url);
    }

    // 4. Salva direto no Firestore para garantir a sincronia
    await firestore().collection('estabelecimentos').doc(estabelecimentoId).update({
      [tipoImg === 'perfil' ? 'fotoPerfil' : 'fotoCapa']: url,
      img: tipoImg === 'perfil' ? url : img
    });

    Alert.alert("Sucesso! ✅", "A imagem foi salva e atualizada.");

  } catch (e: any) {
    console.log("Erro Storage:", e);
    
    if (e.code === 'storage/object-not-found') {
      Alert.alert("Erro de Sincronia", "O servidor ainda está processando a imagem. Tente salvar novamente em instantes.");
    } else if (e.code === 'storage/unauthorized') {
      Alert.alert("Erro de Permissão", "Verifique as Rules do seu Firebase Storage.");
    } else {
      Alert.alert("Erro", "Não foi possível carregar a foto.");
    }
  } finally {
    setSalvando(false);
  }
};

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#C9A96E" /></View>;

  return (
    <View style={s.container}>
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

      {/* ─── DASHBOARD ESTILO PAINT (Item 2) ────────── */}
      {!isNovo && (
        <View style={s.statsContainer}>
          <View style={s.statsInner}>
            <View style={{ flex: 1 }}>
                <View style={s.rowBetween}>
                    <Text style={s.statLabel}>Financeiro (Concluído / Previsto)</Text>
                    <Text style={[s.statValue, { color: cor }]}>R$ {stats.total}</Text>
                </View>
                <View style={s.barContainer}>
                    <View style={[s.bar, { flex: stats.concluido || 0.1, backgroundColor: '#4CAF50' }]} />
                    <View style={[s.bar, { flex: stats.pendente || 0.1, backgroundColor: cor + '66' }]} />
                </View>
                <View style={s.rowBetween}>
                    <Text style={s.miniLabel}>R$ {stats.concluido} em caixa</Text>
                    <Text style={s.miniLabel}>{agends.length} agendamentos</Text>
                </View>
            </View>
          </View>
        </View>
      )}

      <View style={s.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsContent}>
          {([['info','Informações'],['servicos','Serviços'],['horarios','Horários'],['agenda','Agenda']] as const)
            .filter(([k]) => !isNovo || k !== 'agenda')
            .map(([k,l]) => (
              <TouchableOpacity key={k} onPress={()=>setAba(k)} style={[s.tabItem, aba === k && { backgroundColor: cor, borderColor: cor }]}>
                <Text style={[s.tabText, aba === k && { color: '#111' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
      </View>

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
                          style={[
                            s.emojiBtn, 
                            img === e && { borderColor: cor, backgroundColor: cor + '44', borderWidth: 2 }
                          ]}
                        >
                          <Text style={s.emojiTxt}>{e}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                 </View>
                 <View style={[s.colorPreview, { backgroundColor: cor }]} />
               </View>

               <Text style={[s.inputLabel, { marginTop: 25 }]}>MIXER DE CORES (ESTILO PAINT)</Text>
               <View style={s.mixerContainer}>
                  <View style={s.mixerRow}>
                    <Text style={[s.mixerLabel, { color: '#FF4444' }]}>R</Text>
                    <Slider
                      style={{flex: 1, height: 40}}
                      minimumValue={0}
                      maximumValue={255}
                      value={r}
                      minimumTrackTintColor="#FF4444"
                      onValueChange={(v) => { setR(v); updateHex(v, g, b); }}
                    />
                    <Text style={s.mixerValue}>{Math.round(r)}</Text>
                  </View>
                  <View style={s.mixerRow}>
                    <Text style={[s.mixerLabel, { color: '#4CAF50' }]}>G</Text>
                    <Slider
                      style={{flex: 1, height: 40}}
                      minimumValue={0}
                      maximumValue={255}
                      value={g}
                      minimumTrackTintColor="#4CAF50"
                      onValueChange={(v) => { setG(v); updateHex(r, v, b); }}
                    />
                    <Text style={s.mixerValue}>{Math.round(g)}</Text>
                  </View>
                  <View style={s.mixerRow}>
                    <Text style={[s.mixerLabel, { color: '#2196F3' }]}>B</Text>
                    <Slider
                      style={{flex: 1, height: 40}}
                      minimumValue={0}
                      maximumValue={255}
                      value={b}
                      minimumTrackTintColor="#2196F3"
                      onValueChange={(v) => { setB(v); updateHex(r, g, v); }}
                    />
                    <Text style={s.mixerValue}>{Math.round(b)}</Text>
                  </View>
               </View>

               <Text style={[s.inputLabel, { marginTop: 15 }]}>PRESETS RÁPIDOS</Text>
               <View style={s.colorGrid}>
                 {PRESETS_CORES.map(c => (
                   <TouchableOpacity 
                    key={c} 
                    onPress={()=>{
                      setCor(c);
                      setR(parseInt(c.slice(1,3), 16));
                      setG(parseInt(c.slice(3,5), 16));
                      setB(parseInt(c.slice(5,7), 16));
                    }} 
                    style={[s.colorCircle, { backgroundColor: c }, cor === c && s.colorActive]} 
                   />
                 ))}
               </View>

               <View style={s.divider} />
               
               <Text style={s.inputLabel}>HEXADECIMAL ATUAL</Text>
               <View style={s.row}>
                 <TextInput 
                   style={[s.input, { flex: 1 }]} 
                   value={cor}
                   editable={false}
                   placeholderTextColor="#444"
                 />
               </View>
            </View>

            <Text style={s.sectionTitle}>Fotos de Exibição</Text>
            <View style={s.photoRow}>
              <TouchableOpacity onPress={() => escolherImagem('perfil')} style={s.photoBox}>
                {fotoPerfil ? <Image source={{uri: fotoPerfil}} style={s.imgFill} /> : <Text style={s.photoAdd}>＋ Perfil</Text>}
              </TouchableOpacity>
              
            </View>

            <Text style={s.sectionTitle}>Dados Gerais</Text>
            <View style={s.card}>
              <View style={s.inputBox}>
                <Text style={s.inputLabel}>NOME DO ESTABELECIMENTO</Text>
                <TextInput style={s.input} value={nome} onChangeText={setNome} placeholder="Ex: Barber Shop Gold" placeholderTextColor="#444" />
              </View>

              <Text style={s.inputLabel}>TIPO DE NEGÓCIO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.typeList}>
                {TIPOS.map(t => (
                  <TouchableOpacity 
                    key={t} 
                    onPress={()=>setTipo(t)} 
                    style={[
                      s.typeChip, 
                      tipo === t && { borderColor: cor, backgroundColor: cor + '22', borderWidth: 2 }
                    ]}
                  >
                    <Text style={[s.typeChipTxt, tipo === t && { color: cor, fontWeight: '900' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={s.inputBox}>
                <Text style={s.inputLabel}>ENDEREÇO COMPLETO</Text>
                <TextInput style={s.input} value={endereco} onChangeText={setEndereco} placeholder="Rua, número, bairro..." placeholderTextColor="#444" />
              </View>

              <View style={s.row}>
                <View style={[s.inputBox, { flex: 1, marginRight: 10 }]}>
                  <Text style={s.inputLabel}>CIDADE</Text>
                  <TextInput style={s.input} value={cidade} onChangeText={setCidade} placeholder="Cidade" placeholderTextColor="#444" />
                </View>
                <View style={[s.inputBox, { flex: 1 }]}>
                  <Text style={s.inputLabel}>TELEFONE</Text>
                  <TextInput style={s.input} value={telefone} onChangeText={setTelefone} placeholder="(00) 00000-0000" placeholderTextColor="#444" keyboardType="phone-pad" />
                </View>
              </View>

              <View style={s.inputBox}>
                <Text style={s.inputLabel}>DESCRIÇÃO BREVE</Text>
                <TextInput style={[s.input, { height: 80 }]} value={descricao} onChangeText={setDescricao} multiline placeholder="Conte um pouco sobre seu espaço..." placeholderTextColor="#444" />
              </View>
            </View>
          </View>
        )}

        {aba === 'servicos' && (
          <View>
            <Text style={s.sectionTitle}>Novo Serviço</Text>
            <View style={s.card}>
              <TextInput style={s.input} value={nsNome} onChangeText={setNsNome} placeholder="Nome do Serviço" placeholderTextColor="#444" />
              <View style={s.row}>
                <TextInput style={[s.input, { flex: 1, marginTop: 10, marginRight: 10 }]} value={nsPreco} onChangeText={setNsPreco} placeholder="Preço (R$)" keyboardType="numeric" placeholderTextColor="#444" />
                <TextInput style={[s.input, { flex: 1, marginTop: 10 }]} value={nsDuracao} onChangeText={setNsDuracao} placeholder="Minutos" keyboardType="numeric" placeholderTextColor="#444" />
              </View>
              <TouchableOpacity onPress={() => {
                  if(!nsNome || !nsPreco) return;
                  setServicos([...servicos, { id: Date.now().toString(), nome: nsNome, preco: Number(nsPreco), duracao: Number(nsDuracao)||30, ativo: true }]);
                  setNsNome(''); setNsPreco(''); setNsDuracao('');
                }} style={[s.btnAdd, { borderColor: cor }]}>
                <Text style={[s.btnAddText, { color: cor }]}>Adicionar Serviço</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionTitle}>Serviços Cadastrados</Text>
            {servicos.map(item => (
              <View key={item.id} style={s.itemCard}>
                <View style={s.itemInfo}>
                  <Text style={s.itemTitle}>{item.nome}</Text>
                  <Text style={s.itemSub}>R$ {item.preco} • {item.duracao} min</Text>
                </View>
                <Switch value={item.ativo} onValueChange={() => setServicos(servicos.map(x => x.id === item.id ? {...x, ativo: !x.ativo} : x))} thumbColor={cor} trackColor={{ false: '#333', true: cor + '44' }} />
                <TouchableOpacity onPress={() => setServicos(servicos.filter(x => x.id !== item.id))} style={s.itemRemove}>
                  <Text style={{ color: '#FF4444' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {aba === 'horarios' && (
           <View>
              <Text style={s.sectionTitle}>Configurar Grade de Horários</Text>
              <View style={[s.card, { borderColor: cor + '66' }]}>
                <Text style={s.inputLabel}>GERAR AUTOMATICAMENTE</Text>
                <View style={s.row}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={s.miniLabel}>INÍCIO</Text>
                    <TextInput style={s.input} value={gInicio} onChangeText={setGInicio} placeholder="08:00" placeholderTextColor="#444" />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={s.miniLabel}>FIM</Text>
                    <TextInput style={s.input} value={gFim} onChangeText={setGFim} placeholder="18:00" placeholderTextColor="#444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.miniLabel}>MINUTOS</Text>
                    <TextInput style={s.input} value={gIntervalo} onChangeText={setGIntervalo} keyboardType="numeric" placeholder="60" placeholderTextColor="#444" />
                  </View>
                </View>
                <TouchableOpacity onPress={gerarGradeHorarios} style={[s.btnAdd, { backgroundColor: cor, marginTop: 15, borderColor: cor }]}>
                  <Text style={[s.btnAddText, { color: '#111' }]}>Gerar Horários</Text>
                </TouchableOpacity>
              </View>

              <View style={s.rowBetween}>
                  <Text style={s.sectionTitle}>Horários Ativos ({horarios.length})</Text>
                  <TouchableOpacity onPress={() => setHorarios([])}>
                      <Text style={{color: '#FF4444', fontSize: 12, fontWeight: 'bold'}}>Limpar Tudo</Text>
                  </TouchableOpacity>
              </View>

              <View style={s.horariosGrid}>
                {horarios.map(h => {
                  // TRAVA VISUAL (Item 1)
                  const ocupado = agends.some(a => a.horario === h && a.status === 'confirmado');
                  return (
                    <TouchableOpacity 
                      key={h} 
                      onPress={() => {
                        if (ocupado) {
                            Alert.alert("Horário Ocupado", "Existe um cliente agendado aqui. Cancele o agendamento primeiro.");
                        } else {
                            setHorarios(horarios.filter(x => x !== h));
                        }
                      }} 
                      style={[s.timeChip, { borderColor: ocupado ? '#FF4444' : cor + '44', backgroundColor: ocupado ? '#FF444422' : 'transparent' }]}
                    >
                      <Text style={[s.timeText, ocupado && { color: '#FF4444' }]}>{h}</Text>
                      {!ocupado && <Text style={s.timeRemove}>✕</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
           </View>
        )}

        {aba === 'agenda' && (
          <View>
            <Text style={s.sectionTitle}>Próximos Compromissos</Text>
            {agends.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>📅</Text>
                <Text style={s.emptyText}>Nenhum agendamento encontrado.</Text>
              </View>
            ) : (
              agends.map(ag => (
                <View key={ag.id} style={s.agendCard}>
                  <View style={s.agendHeader}>
                    <Text style={s.agendClient}>{ag.clienteNome}</Text>
                    <Text style={[s.agendPrice, { color: cor }]}>R$ {ag.servicoPreco}</Text>
                  </View>
                  <Text style={s.agendServ}>{ag.servicoNome}</Text>
                  <View style={s.agendMeta}>
                    <Text style={s.agendDate}>📅 {ag.data} às {ag.horario}</Text>
                    <View style={[s.statusBadge, ag.status === 'cancelado' ? s.statusErr : ag.status === 'concluido' ? s.statusOk : { backgroundColor: '#222' }]}>
                      <Text style={s.statusTxt}>{ag.status?.toUpperCase()}</Text>
                    </View>
                  </View>
                  
                  {/* BOTÕES DE AÇÃO (Item 3 - Integrando com suas Functions) */}
                  {ag.status === 'confirmado' && (
                    <View style={[s.row, { gap: 10, marginTop: 15 }]}>
                       <TouchableOpacity 
                        onPress={() => fn.httpsCallable('concluirAgendamento')({ agendamentoId: ag.id })}
                        style={[s.actionBtn, { borderColor: '#4CAF50' }]}>
                          <Text style={{color:'#4CAF50', fontSize: 11, fontWeight: '900'}}>CONCLUIR</Text>
                       </TouchableOpacity>
                       <TouchableOpacity 
                        onPress={() => Alert.alert("Cancelar", "Deseja cancelar o cliente?", [{text: "Sim", onPress: () => fn.httpsCallable('cancelarAgendamento')({ agendamentoId: ag.id })}])}
                        style={[s.actionBtn, { borderColor: '#FF4444' }]}>
                          <Text style={{color:'#FF4444', fontSize: 11, fontWeight: '900'}}>CANCELAR</Text>
                       </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#121212', borderBottomWidth: 1, borderBottomColor: '#222' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: '#888', fontSize: 18 },
  headerTitleContainer: { flex: 1, paddingHorizontal: 15 },
  headerLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  saveBtnText: { color: '#111', fontWeight: '800', fontSize: 14 },
  statsContainer: { paddingHorizontal: 20, marginTop: -20 },
  statsInner: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 20, padding: 15, elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10 },
  statItem: { flex: 1, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#333' },
  statValue: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  statLabel: { color: '#666', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 5 },
  barContainer: { height: 6, flexDirection: 'row', backgroundColor: '#000', borderRadius: 3, overflow: 'hidden', marginVertical: 8 },
  bar: { height: '100%' },
  tabsWrapper: { paddingVertical: 20 },
  tabsContent: { paddingHorizontal: 20, gap: 10 },
  tabItem: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#222' },
  tabText: { color: '#888', fontWeight: '700', fontSize: 13 },
  body: { flex: 1, paddingHorizontal: 20 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 15, marginTop: 10 },
  card: { backgroundColor: '#121212', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  inputBox: { marginBottom: 18 },
  inputLabel: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  miniLabel: { color: '#444', fontSize: 9, fontWeight: 'bold', marginBottom: 4, marginLeft: 5 },
  input: { backgroundColor: '#000', borderRadius: 15, padding: 15, color: '#FFF', fontSize: 15, borderWidth: 1, borderColor: '#1A1A1A' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emojiContainer: { flex: 1 },
  emojiList: { marginTop: 10 },
  emojiBtn: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 2, borderColor: 'transparent' },
  emojiTxt: { fontSize: 24 },
  colorPreview: { width: 45, height: 45, borderRadius: 22.5, borderWidth: 3, borderColor: '#FFF' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  colorCircle: { width: 35, height: 35, borderRadius: 10 },
  colorActive: { borderWidth: 3, borderColor: '#FFF' },
  mixerContainer: { backgroundColor: '#000', padding: 15, borderRadius: 15, marginTop: 10 },
  mixerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  mixerLabel: { width: 20, fontWeight: '900', fontSize: 14 },
  mixerValue: { width: 35, color: '#FFF', fontSize: 12, textAlign: 'right', fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#222', marginVertical: 20 },
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 25 },
  photoBox: { flex: 1, height: 100, borderRadius: 20, backgroundColor: '#121212', borderWidth: 1, borderColor: '#222', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoAdd: { color: '#555', fontWeight: '700', fontSize: 12 },
  imgFill: { width: '100%', height: '100%' },
  typeList: { marginBottom: 20 },
  typeChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 15, backgroundColor: '#121212', marginRight: 10, borderWidth: 1, borderColor: '#222' },
  typeChipTxt: { color: '#666', fontSize: 12 },
  btnAdd: { backgroundColor: '#1A1A1A', padding: 15, borderRadius: 15, marginTop: 15, alignItems: 'center', borderWidth: 1 },
  btnAddText: { fontWeight: '800' },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', padding: 15, borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
  itemInfo: { flex: 1 },
  itemTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  itemSub: { color: '#666', fontSize: 12, marginTop: 2 },
  itemRemove: { marginLeft: 15, padding: 5 },
  horariosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  timeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  timeText: { color: '#FFF', fontWeight: '700', marginRight: 8 },
  timeRemove: { color: '#FF4444', fontSize: 12 },
  agendCard: { backgroundColor: '#121212', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  agendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  agendClient: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  agendPrice: { fontSize: 16, fontWeight: '800' },
  agendServ: { color: '#888', fontSize: 13, marginTop: 4 },
  agendMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#222' },
  agendDate: { color: '#666', fontSize: 12, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusOk: { backgroundColor: '#4CAF5022' },
  statusErr: { backgroundColor: '#F4433622' },
  statusTxt: { fontSize: 10, fontWeight: '900', color: '#FFF' },
  actionBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1, backgroundColor: '#000' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: '#444', fontWeight: '600' }
});