import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, Switch,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import type { Estabelecimento, Servico } from '../types';

const CORES = ['#D4A5A5','#A5BDD4','#A5D4B5','#C4A5D4','#D4CBA5','#D4A5C4','#A5C4D4','#D4B8A5'];
const EMOJIS = ['✨','💅','🌿','✂️','🧘','💇','💆','🪮','💄','🛁','🌸','⭐'];
const TIPOS = ['Salão de Beleza','Barbearia Premium','Espaço de Unhas','Clínica Estética','Spa & Relaxamento','Especialista em Cabelos'];

// ← região correta para Functions v2
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

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [telefone, setTelefone] = useState('');
  const [descricao, setDescricao] = useState('');
  const [horarioFunc, setHorarioFunc] = useState('08:00 - 20:00');
  const [img, setImg] = useState('✨');
  const [cor, setCor] = useState('#D4A5A5');
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [horarios, setHorarios] = useState<string[]>(['09:00','10:00','11:00','13:00','14:00','15:00']);

  const [nsNome, setNsNome] = useState('');
  const [nsPreco, setNsPreco] = useState('');
  const [nsDuracao, setNsDuracao] = useState('');

  const [nhHora, setNhHora] = useState('');
  const [nhMin, setNhMin] = useState('');

  const [agends, setAgends] = useState<any[]>([]);

  useEffect(() => {
    if (!isNovo) {
      firestore().collection('estabelecimentos').doc(estabelecimentoId).get()
        .then(snap => {
          if (snap.exists) {
            const d = snap.data() as Estabelecimento;
            setNome(d.nome); setTipo(d.tipo); setEndereco(d.endereco);
            setCidade(d.cidade); setTelefone(d.telefone); setDescricao(d.descricao);
            setHorarioFunc(d.horarioFuncionamento); setImg(d.img); setCor(d.cor);
            setServicos(d.servicos || []); setHorarios(d.horarios || []);
          }
          setLoading(false);
        });

      const u = firestore().collection('agendamentos')
        .where('estabelecimentoId', '==', estabelecimentoId)
        .orderBy('criadoEm', 'desc')
        .onSnapshot(snap => {
          setAgends(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
      return u;
    }
  }, []);

  const salvar = async () => {
    if (!nome || !endereco) { Alert.alert('Atenção', 'Nome e endereço são obrigatórios.'); return; }
    try {
      setSalvando(true);
      await fn.httpsCallable('salvarEstabelecimento')({
        id: isNovo ? undefined : estabelecimentoId,
        nome, tipo, endereco, cidade, telefone,
        descricao, horarioFuncionamento: horarioFunc,
        img, cor, servicos, horarios,
        avaliacao: 5.0, ativo: true,
      });
      Alert.alert('Sucesso! ✅', isNovo ? 'Estabelecimento criado!' : 'Informações salvas!', [
        { text: 'OK', onPress: () => isNovo && navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const adicionarServico = () => {
    if (!nsNome || !nsPreco) { Alert.alert('Atenção', 'Informe nome e preço.'); return; }
    const novo: Servico = {
      id: Date.now().toString(),
      nome: nsNome,
      preco: Number(nsPreco),
      duracao: Number(nsDuracao) || 60,
      ativo: true,
    };
    setServicos(p => [...p, novo]);
    setNsNome(''); setNsPreco(''); setNsDuracao('');
  };

  const toggleServico = (id: string) => {
    setServicos(p => p.map(s => s.id === id ? { ...s, ativo: !s.ativo } : s));
  };

  const removerServico = (id: string) => {
    Alert.alert('Remover', 'Deseja remover este serviço?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => setServicos(p => p.filter(s => s.id !== id)) },
    ]);
  };

  const adicionarHorario = () => {
    if (!nhHora || !nhMin) { Alert.alert('Atenção', 'Informe hora e minutos.'); return; }
    const h = `${nhHora.padStart(2,'0')}:${nhMin.padStart(2,'0')}`;
    if (horarios.includes(h)) { Alert.alert('Atenção', 'Horário já cadastrado.'); return; }
    setHorarios(p => [...p, h].sort());
    setNhHora(''); setNhMin('');
  };

  const removerHorario = (h: string) => {
    setHorarios(p => p.filter(x => x !== h));
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.voltarText}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerEmoji}>{img}</Text>
          <View>
            <Text style={s.headerNome}>{isNovo ? 'Novo Estabelecimento' : nome}</Text>
            <Text style={s.headerTipo}>{tipo}</Text>
          </View>
        </View>
      </View>

      {!isNovo && (
        <View style={s.statsRow}>
          {[
            { v: agends.length, l: 'Agend.' },
            { v: servicos.filter(s => s.ativo).length, l: 'Serviços' },
            { v: `R$${agends.reduce((a, ag) => a + (ag.servicoPreco || 0), 0)}`, l: 'Receita' },
          ].map(({ v, l }) => (
            <View key={l} style={s.statCard}>
              <Text style={s.statV}>{v}</Text>
              <Text style={s.statL}>{l}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.abas}>
        {(isNovo
          ? [['info', 'ℹ️ Info'], ['servicos', '🛎 Serviços'], ['horarios', '⏰ Horários']]
          : [['info', 'ℹ️ Info'], ['servicos', '🛎 Serviços'], ['horarios', '⏰ Horários'], ['agenda', '📅 Agenda']]
        ).map(([k, l]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setAba(k as any)}
            style={[s.aba, aba === k && s.abaAtiva]}>
            <Text style={[s.abaText, aba === k && s.abaTextAtiva]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>

        {aba === 'info' && (
          <View>
            <View style={s.card}>
              <Text style={s.cardTitulo}>Ícone</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.emojiScroll}>
                {EMOJIS.map(e => (
                  <TouchableOpacity key={e} onPress={() => setImg(e)}
                    style={[s.emojiBtn, img === e && s.emojiBtnAtivo]}>
                    <Text style={s.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[s.cardTitulo, { marginTop: 14 }]}>Cor</Text>
              <View style={s.coresRow}>
                {CORES.map(c => (
                  <TouchableOpacity key={c} onPress={() => setCor(c)}
                    style={[s.corBtn, { backgroundColor: c }, cor === c && s.corBtnAtiva]} />
                ))}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitulo}>Dados do Local</Text>
              {[
                { label: 'Nome', value: nome, set: setNome, placeholder: 'Ex: Studio Beleza' },
                { label: 'Endereço', value: endereco, set: setEndereco, placeholder: 'Rua, número' },
                { label: 'Cidade', value: cidade, set: setCidade, placeholder: 'São Paulo' },
                { label: 'Telefone', value: telefone, set: setTelefone, placeholder: '(11) 99999-0000' },
                { label: 'Funcionamento', value: horarioFunc, set: setHorarioFunc, placeholder: '08:00 - 20:00' },
                { label: 'Descrição', value: descricao, set: setDescricao, placeholder: 'Breve descrição' },
              ].map(({ label, value, set, placeholder }) => (
                <View key={label} style={s.inputGroup}>
                  <Text style={s.inputLabel}>{label.toUpperCase()}</Text>
                  <TextInput
                    style={s.input}
                    value={value}
                    onChangeText={set}
                    placeholder={placeholder}
                    placeholderTextColor="#444"
                  />
                </View>
              ))}

              <Text style={s.inputLabel}>TIPO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {TIPOS.map(t => (
                  <TouchableOpacity key={t} onPress={() => setTipo(t)}
                    style={[s.tipoChip, tipo === t && s.tipoChipAtivo]}>
                    <Text style={[s.tipoChipText, tipo === t && s.tipoChipTextAtivo]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <TouchableOpacity style={s.btnPrimario} onPress={salvar} disabled={salvando}>
              {salvando
                ? <ActivityIndicator color="#111" />
                : <Text style={s.btnPrimarioText}>{isNovo ? 'Criar Estabelecimento' : 'Salvar Informações'}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {aba === 'servicos' && (
          <View>
            <View style={s.card}>
              <Text style={s.cardTitulo}>Adicionar Serviço</Text>
              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>NOME DO SERVIÇO</Text>
                <TextInput style={s.input} value={nsNome} onChangeText={setNsNome} placeholder="Ex: Corte Feminino" placeholderTextColor="#444" />
              </View>
              <View style={s.duplaRow}>
                <View style={s.duplaItem}>
                  <Text style={s.inputLabel}>PREÇO (R$)</Text>
                  <TextInput style={s.input} value={nsPreco} onChangeText={setNsPreco} placeholder="80" placeholderTextColor="#444" keyboardType="numeric" />
                </View>
                <View style={s.duplaItem}>
                  <Text style={s.inputLabel}>DURAÇÃO (min)</Text>
                  <TextInput style={s.input} value={nsDuracao} onChangeText={setNsDuracao} placeholder="60" placeholderTextColor="#444" keyboardType="numeric" />
                </View>
              </View>
              <TouchableOpacity style={s.btnPrimario} onPress={adicionarServico}>
                <Text style={s.btnPrimarioText}>+ Adicionar</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.secTitulo}>Serviços ({servicos.length})</Text>
            {servicos.length === 0
              ? <View style={s.emptyCard}><Text style={s.emptyText}>Nenhum serviço cadastrado</Text></View>
              : servicos.map(sv => (
                <View key={sv.id} style={[s.servicoCard, !sv.ativo && { opacity: 0.5 }]}>
                  <View style={s.servicoInfo}>
                    <Text style={s.servicoNome}>{sv.nome}</Text>
                    <Text style={s.servicoSub}>⏱ {sv.duracao}min · <Text style={{ color: '#C9A96E', fontWeight: '700' }}>R${sv.preco}</Text></Text>
                  </View>
                  <Switch
                    value={sv.ativo}
                    onValueChange={() => toggleServico(sv.id)}
                    trackColor={{ false: '#333', true: '#C9A96E' }}
                    thumbColor="#fff"
                  />
                  <TouchableOpacity onPress={() => removerServico(sv.id)} style={s.removeBtn}>
                    <Text style={s.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            }
            {servicos.length > 0 && (
              <TouchableOpacity style={s.btnPrimario} onPress={salvar} disabled={salvando}>
                {salvando ? <ActivityIndicator color="#111" /> : <Text style={s.btnPrimarioText}>Salvar Serviços</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}

        {aba === 'horarios' && (
          <View>
            <View style={s.card}>
              <Text style={s.cardTitulo}>Adicionar Horário</Text>
              <View style={s.duplaRow}>
                <View style={s.duplaItem}>
                  <Text style={s.inputLabel}>HORA</Text>
                  <TextInput style={s.input} value={nhHora} onChangeText={setNhHora} placeholder="09" placeholderTextColor="#444" keyboardType="numeric" maxLength={2} />
                </View>
                <View style={s.duplaItem}>
                  <Text style={s.inputLabel}>MINUTOS</Text>
                  <TextInput style={s.input} value={nhMin} onChangeText={setNhMin} placeholder="00" placeholderTextColor="#444" keyboardType="numeric" maxLength={2} />
                </View>
              </View>
              <TouchableOpacity style={s.btnPrimario} onPress={adicionarHorario}>
                <Text style={s.btnPrimarioText}>+ Adicionar</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.secTitulo}>Horários ({horarios.length})</Text>
            <View style={s.horariosWrap}>
              {horarios.map(h => (
                <View key={h} style={s.horarioChip}>
                  <Text style={s.horarioText}>{h}</Text>
                  <TouchableOpacity onPress={() => removerHorario(h)}>
                    <Text style={s.horarioRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            {horarios.length > 0 && (
              <TouchableOpacity style={[s.btnPrimario, { marginTop: 16 }]} onPress={salvar} disabled={salvando}>
                {salvando ? <ActivityIndicator color="#111" /> : <Text style={s.btnPrimarioText}>Salvar Horários</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}

        {aba === 'agenda' && (
          <View>
            <Text style={s.secTitulo}>Agendamentos · <Text style={{ color: '#C9A96E' }}>{agends.length} total</Text></Text>
            {agends.length === 0
              ? <View style={s.emptyCard}><Text style={s.emptyEmoji}>📭</Text><Text style={s.emptyText}>Nenhum agendamento</Text></View>
              : agends.map(a => (
                <View key={a.id} style={s.agendCard}>
                  <View style={s.agendTop}>
                    <View>
                      <Text style={s.agendNome}>👤 {a.clienteNome}</Text>
                      <Text style={s.agendSub}>💆 {a.servicoNome}</Text>
                    </View>
                    <Text style={s.agendPreco}>R${a.servicoPreco}</Text>
                  </View>
                  <View style={s.agendBottom}>
                    <Text style={s.agendData}>📅 {a.data}</Text>
                    <Text style={s.agendData}>⏰ {a.horario}</Text>
                  </View>
                  <Text style={[s.status,
                    a.status === 'confirmado' && s.statusConfirmado,
                    a.status === 'cancelado' && s.statusCancelado,
                  ]}>
                    {a.status === 'confirmado' ? '✓ Confirmado' : '✕ Cancelado'}
                  </Text>
                </View>
              ))
            }
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D0D0D' },
  header: { backgroundColor: '#181818', padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#282828' },
  voltarText: { color: '#777', fontSize: 24, marginRight: 4 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 24 },
  headerNome: { color: '#F2EDE4', fontSize: 15, fontWeight: '700' },
  headerTipo: { color: '#777', fontSize: 11 },
  statsRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#181818', borderBottomWidth: 1, borderBottomColor: '#282828' },
  statCard: { flex: 1, backgroundColor: '#111', borderRadius: 10, padding: 10, alignItems: 'center' },
  statV: { color: '#C9A96E', fontSize: 16, fontWeight: '700' },
  statL: { color: '#777', fontSize: 10, marginTop: 2 },
  abas: { flexDirection: 'row', backgroundColor: '#181818', borderBottomWidth: 1, borderBottomColor: '#282828' },
  aba: { flex: 1, padding: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  abaAtiva: { borderBottomColor: '#C9A96E' },
  abaText: { color: '#777', fontSize: 10, fontWeight: '500' },
  abaTextAtiva: { color: '#C9A96E', fontWeight: '700' },
  body: { flex: 1, padding: 16 },
  card: { backgroundColor: '#181818', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitulo: { color: '#F2EDE4', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  emojiScroll: { marginBottom: 4 },
  emojiBtn: { padding: 8, borderRadius: 10, marginRight: 6, backgroundColor: '#222', borderWidth: 2, borderColor: 'transparent' },
  emojiBtnAtivo: { borderColor: '#C9A96E', backgroundColor: '#C9A96E22' },
  emojiText: { fontSize: 22 },
  coresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  corBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 3, borderColor: 'transparent' },
  corBtnAtiva: { borderColor: '#fff' },
  inputGroup: { marginBottom: 12 },
  inputLabel: { color: '#666', fontSize: 11, letterSpacing: 1, marginBottom: 5 },
  input: { backgroundColor: '#0A0A0A', borderRadius: 10, borderWidth: 1, borderColor: '#282828', padding: 11, color: '#F2EDE4', fontSize: 14 },
  tipoChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#222', marginRight: 8, borderWidth: 1, borderColor: 'transparent' },
  tipoChipAtivo: { backgroundColor: '#C9A96E22', borderColor: '#C9A96E' },
  tipoChipText: { color: '#777', fontSize: 12 },
  tipoChipTextAtivo: { color: '#C9A96E', fontWeight: '600' },
  duplaRow: { flexDirection: 'row', gap: 10 },
  duplaItem: { flex: 1 },
  secTitulo: { color: '#F2EDE4', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  servicoCard: { backgroundColor: '#181818', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  servicoInfo: { flex: 1 },
  servicoNome: { color: '#F2EDE4', fontSize: 14, fontWeight: '600' },
  servicoSub: { color: '#777', fontSize: 12, marginTop: 2 },
  removeBtn: { padding: 6 },
  removeBtnText: { color: '#e55', fontSize: 16 },
  horariosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  horarioChip: { backgroundColor: '#181818', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  horarioText: { color: '#F2EDE4', fontSize: 14, fontWeight: '600' },
  horarioRemove: { color: '#e55', fontSize: 13 },
  agendCard: { backgroundColor: '#181818', borderRadius: 12, padding: 14, marginBottom: 10 },
  agendTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  agendNome: { color: '#F2EDE4', fontSize: 13, fontWeight: '600' },
  agendSub: { color: '#777', fontSize: 12, marginTop: 2 },
  agendPreco: { color: '#C9A96E', fontSize: 16, fontWeight: '700' },
  agendBottom: { flexDirection: 'row', gap: 16, backgroundColor: '#111', borderRadius: 8, padding: 8, marginBottom: 8 },
  agendData: { color: '#777', fontSize: 12 },
  status: { fontSize: 11, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, fontWeight: '600', alignSelf: 'flex-start', overflow: 'hidden' },
  statusConfirmado: { backgroundColor: '#4CAF5022', color: '#4CAF50' },
  statusCancelado: { backgroundColor: '#e5555522', color: '#e55' },
  btnPrimario: { backgroundColor: '#C9A96E', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  btnPrimarioText: { color: '#111', fontSize: 14, fontWeight: '700' },
  emptyCard: { backgroundColor: '#181818', borderRadius: 14, padding: 30, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { color: '#777', fontSize: 13 },
});