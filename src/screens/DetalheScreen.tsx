import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, Linking, Image,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { Estabelecimento } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/FontAwesome';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const getDatas = () => {
  const lista = [];
  let d = new Date();
  while (lista.length < 7) {
    if (d.getDay() !== 0) {
      lista.push({
        dia: DIAS[d.getDay()],
        numero: d.getDate(),
        mes: d.toLocaleString('pt-BR', { month: 'short' }),
        full: d.toLocaleDateString('pt-BR'),
        dateObj: new Date(d)
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return lista;
};

const fn = functions();

const BannerMedia = ({ data, style }: { data: any, style: any }) => {
  const [imgErro, setImgErro] = useState(false);
  const isUrl = typeof data?.fotoPerfil === 'string' && data?.fotoPerfil?.startsWith('http') || 
                typeof data?.img === 'string' && data?.img?.startsWith('http');
  const uri = data?.fotoPerfil || data?.img;

  if (isUrl && !imgErro) {
    return (
      <Image 
        source={{ uri }} 
        style={[style, { borderRadius: 40 }]} 
        onError={() => setImgErro(true)} 
      />
    );
  }
  return (
    <Text style={style}>
      {(!isUrl ? data?.img : null) || '🏢'}
    </Text>
  );
};

export default function DetalheScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { estabelecimentoId } = route.params;

  const [estab, setEstab] = useState<Estabelecimento | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [step, setStep] = useState(1);
  const [horariosOcupados, setHorariosOcupados] = useState<string[]>([]);
  const [servicoSel, setServicoSel] = useState<string>('');
  const [dataSel, setDataSel] = useState<any>(null);
  const [horarioSel, setHorarioSel] = useState<string>('');
  const [nome, setNome] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [nomeUsuario, setNomeUsuario] = useState('');
  const datas = getDatas();

  useEffect(() => {
    const unsub = firestore()
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .onSnapshot(snap => {
        if (snap.exists()) {
          setEstab({ id: snap.id, ...snap.data() } as Estabelecimento);
        }
        setLoading(false);
      }, err => {
        setLoading(false);
      });

    const user = auth().currentUser;
    if (user?.displayName) {
      setNome(user.displayName);
      setNomeUsuario(user.displayName);
    }
    return () => unsub();
  }, [estabelecimentoId]);

  useEffect(() => {
    if (!dataSel || !estabelecimentoId) return;
    const unsub = firestore()
      .collection('agendamentos')
      .where('estabelecimentoId', '==', estabelecimentoId)
      .where('data', '==', dataSel.full)
      .where('status', '==', 'confirmado')
      .onSnapshot(snap => {
        if (snap) setHorariosOcupados(snap.docs.map(d => d.data().horario));
      });
    return () => unsub();
  }, [dataSel, estabelecimentoId]);

  const confirmar = async () => {
    if (!servicoSel || !dataSel || !horarioSel || !nome) {
      Alert.alert('Atenção', 'Preencha todos os campos!');
      return;
    }
    try {
      setSalvando(true);
      const servico = estab?.servicos.find(s => s.nome === servicoSel);
      const precoLimpo = Number(String(servico?.preco || 0).replace(',', '.'));

      await fn.httpsCallable('criarAgendamento')({
        estabelecimentoId,
        estabelecimentoNome: estab?.nome || 'Estabelecimento',
        servicoId: servico?.id || 'id_desconhecido',
        servicoNome: servicoSel,
        servicoPreco: precoLimpo,
        clienteNome: nome,
        clienteUid: auth().currentUser?.uid || '',
        data: dataSel.full,
        horario: horarioSel,
      });

      await AsyncStorage.setItem('clienteNome', nome);
      setConfirmado(true);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Erro', e.message || 'Não foi possível agendar.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirWhatsApp = () => {
    const tel = estab?.telefone?.replace(/\D/g, '');
    if (!tel) return;
    const msg = `Olá! Vim pelo app e gostaria de marcar um horário em ${estab?.nome}.`;
    Linking.openURL(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`);
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#C9A96E" /></View>;

  if (confirmado) {
    return (
      <View style={s.confirmWrap}>
        <View style={s.confirmCard}>
          <View style={s.confirmCircle}><Text style={s.confirmEmoji}>🎉</Text></View>
          <Text style={s.confirmTitulo}>Agendado!</Text>
          <Text style={s.confirmSub}>Seu horário está confirmado, {nome.split(' ')[0]}!</Text>
          
          <View style={s.confirmResumo}>
            <Text style={s.confirmEstab}>{estab?.nome}</Text>
            <View style={s.confirmLinha}><Text>💆 {servicoSel}</Text></View>
            <View style={s.confirmLinha}><Text>📅 {dataSel?.full}</Text></View>
            <View style={s.confirmLinha}><Text>⏰ {horarioSel}</Text></View>
          </View>

          <TouchableOpacity 
            style={s.btnPrimario} 
            onPress={() => navigation.reset({
              index: 0,
              routes: [{ 
                name: 'HomeTabs', 
                params: { screen: 'Agendamentos' }
              }],
            })}
          >
            <Text style={s.btnPrimarioText}>Ver meus agendamentos</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const svcsAtivos = estab?.servicos?.filter(s => s.ativo) || [];

  return (
    <View style={s.container}>
      <View style={[s.banner, { backgroundColor: (estab?.cor || '#C9A96E') + '22' }]}>
        <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}><Text style={s.voltarBtnText}>←</Text></TouchableOpacity>
        <BannerMedia data={estab} style={s.bannerEmoji} />
        <View style={s.bannerInfo}>
          <Text style={s.bannerNome}>{estab?.nome}</Text>
          <Text style={s.bannerTipo}>{estab?.tipo}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.body}>
          <View style={s.stepsWrap}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={s.stepItem}>
                <View style={[s.stepCircle, step >= i && s.stepCircleAtivo]}><Text style={[s.stepNum, step >= i && s.stepNumAtivo]}>{i}</Text></View>
                {i < 4 && <View style={[s.stepLine, step > i && s.stepLineAtiva]} />}
              </View>
            ))}
          </View>

          <View style={s.secao}>
            <Text style={s.secaoTitulo}>Serviço</Text>
            {svcsAtivos.map(sv => (
              <TouchableOpacity key={sv.id} onPress={() => { setServicoSel(sv.nome); setStep(Math.max(step, 2)); }} style={[s.servicoCard, servicoSel === sv.nome && s.servicoCardAtivo]}>
                {(sv as any).foto ? <Image source={{ uri: (sv as any).foto }} style={s.servicoFoto} /> : <View style={s.servicoFotoPlaceholder}><Text>💆</Text></View>}
                <View style={s.servicoLeft}>
                  <Text style={[s.servicoNome, servicoSel === sv.nome && { color: '#fff' }]}>{sv.nome}</Text>
                  <Text style={[s.servicoDur, servicoSel === sv.nome && { color: '#aaa' }]}>⏱ {sv.duracao} min</Text>
                </View>
                <View style={[s.servicoPrecoBox, servicoSel === sv.nome && { backgroundColor: '#C9A96E' }]}><Text style={[s.servicoPreco, servicoSel === sv.nome && { color: '#1A1A1A' }]}>R${sv.preco}</Text></View>
              </TouchableOpacity>
            ))}
          </View>

          {step >= 2 && (
            <View style={s.secao}>
              <Text style={s.secaoTitulo}>Data</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {datas.map((d, i) => (
                  <TouchableOpacity key={i} onPress={() => { setDataSel(d); setHorarioSel(''); setStep(Math.max(step, 3)); }} style={[s.dataCard, dataSel?.full === d.full && s.dataCardAtivo]}>
                    <Text style={[s.dataDia, dataSel?.full === d.full && { color: '#C9A96E' }]}>{d.dia}</Text>
                    <Text style={[s.dataNum, dataSel?.full === d.full && { color: '#fff' }]}>{d.numero}</Text>
                    <Text style={[s.dataMes, dataSel?.full === d.full && { color: '#aaa' }]}>{d.mes}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {step >= 3 && (
            <View style={s.secao}>
              <Text style={s.secaoTitulo}>Horário</Text>
              <View style={s.horariosWrap}>
                {estab?.horarios?.map(h => {
                  const [hora, minuto] = h.split(':').map(Number);
                  const agora = new Date();
                  const isHoje = dataSel?.full === agora.toLocaleDateString('pt-BR');
                  const jaPassou = isHoje && (agora.getHours() > hora || (agora.getHours() === hora && agora.getMinutes() >= minuto));
                  const ocupado = horariosOcupados.includes(h) || jaPassou;
                  
                  return (
                    <TouchableOpacity key={h} disabled={ocupado} onPress={() => { setHorarioSel(h); setStep(Math.max(step, 4)); }} style={[s.horarioChip, horarioSel === h && s.horarioChipAtivo, ocupado && s.horarioChipOcupado]}>
                      <Text style={[s.horarioText, horarioSel === h && { color: '#fff' }, ocupado && { color: '#ccc' }]}>{h}{ocupado ? ' ✕' : ''}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step >= 4 && (
            <>
              <View style={s.secao}>
                <Text style={s.secaoTitulo}>Seu nome</Text>
                {nomeUsuario ? (
                  <View style={s.nomeLogadoWrap}><Text style={s.nomeLogadoIc}>👤</Text><Text style={s.nomeLogadoTxt}>{nomeUsuario}</Text></View>
                ) : (
                  <TextInput style={s.input} placeholder="Nome completo" value={nome} onChangeText={setNome} />
                )}
              </View>

              <View style={s.resumoFinalCard}>
                <Text style={s.resumoFinalTitulo}>Resumo do Agendamento</Text>
                <View style={s.resumoFinalLinha}>
                   <Icon name="check-circle" size={16} color="#C9A96E" />
                   <Text style={s.resumoFinalTexto}>{servicoSel} — R${estab?.servicos.find(s=>s.nome === servicoSel)?.preco}</Text>
                </View>
                <View style={s.resumoFinalLinha}>
                   <Icon name="calendar" size={16} color="#C9A96E" />
                   <Text style={s.resumoFinalTexto}>{dataSel?.dia}, {dataSel?.numero} de {dataSel?.mes} às {horarioSel}</Text>
                </View>
              </View>
            </>
          )}

          <TouchableOpacity
            style={[s.btnPrimario, (!servicoSel || !dataSel || !horarioSel || !nome) && s.btnDisabled]}
            disabled={!servicoSel || !dataSel || !horarioSel || !nome || salvando}
            onPress={confirmar}>
            {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimarioText}>Finalizar Agendamento</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {estab?.telefone && (
        <TouchableOpacity onPress={abrirWhatsApp} style={s.whatsappBtn}>
          <Icon name="whatsapp" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner: { padding: 24, paddingTop: 52, flexDirection: 'row', alignItems: 'center', gap: 16 },
  voltarBtn: { position: 'absolute', top: 52, left: 16, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  voltarBtnText: { fontSize: 20, color: '#1A1A1A' },
  bannerEmoji: { fontSize: 56, marginLeft: 40, width: 80, height: 80, textAlign: 'center', textAlignVertical: 'center' },
  bannerInfo: { flex: 1 },
  bannerNome: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  bannerTipo: { fontSize: 12, color: '#666' },
  body: { padding: 16 },
  stepsWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 16 },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', justifyContent: 'center', alignItems: 'center' },
  stepCircleAtivo: { backgroundColor: '#1A1A1A' },
  stepNum: { fontSize: 12, fontWeight: '700', color: '#999' },
  stepNumAtivo: { color: '#fff' },
  stepLine: { width: 40, height: 2, backgroundColor: '#E0E0E0', marginHorizontal: 4 },
  stepLineAtiva: { backgroundColor: '#1A1A1A' },
  secao: { marginBottom: 20 },
  secaoTitulo: { fontSize: 13, fontWeight: '700', color: '#999', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  servicoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  servicoCardAtivo: { backgroundColor: '#1A1A1A' },
  servicoFoto: { width: 50, height: 50, borderRadius: 10, marginRight: 12 },
  servicoFotoPlaceholder: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#F5F5F5', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  servicoLeft: { flex: 1 },
  servicoNome: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  servicoDur: { fontSize: 11, color: '#888' },
  servicoPrecoBox: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  servicoPreco: { fontSize: 14, fontWeight: '700' },
  dataCard: { width: 56, alignItems: 'center', padding: 10, borderRadius: 14, backgroundColor: '#fff', marginRight: 8 },
  dataCardAtivo: { backgroundColor: '#1A1A1A' },
  dataDia: { fontSize: 10, color: '#888' },
  dataNum: { fontSize: 20, fontWeight: '700' },
  dataMes: { fontSize: 10, color: '#aaa' },
  horariosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  horarioChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff' },
  horarioChipAtivo: { backgroundColor: '#1A1A1A' },
  horarioChipOcupado: { backgroundColor: '#eee', opacity: 0.5 },
  horarioText: { fontSize: 13, fontWeight: '600' },
  nomeLogadoWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  nomeLogadoIc: { fontSize: 20 },
  nomeLogadoTxt: { fontSize: 15, fontWeight: '600' },
  input: { backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 14, color: '#1A1A1A' },
  resumoFinalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#C9A96E', elevation: 2 },
  resumoFinalTitulo: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  resumoFinalLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  resumoFinalTexto: { fontSize: 13, color: '#444' },
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 18, alignItems: 'center' },
  btnPrimarioText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { backgroundColor: '#ccc' },
  confirmWrap: { flex: 1, backgroundColor: '#F5F5F5', justifyContent: 'center', padding: 24 },
  confirmCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center' },
  confirmCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  confirmEmoji: { fontSize: 40 },
  confirmTitulo: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  confirmSub: { fontSize: 14, color: '#888', marginBottom: 20, textAlign: 'center' },
  confirmResumo: { width: '100%', backgroundColor: '#F5F5F5', borderRadius: 14, padding: 16, marginBottom: 20 },
  confirmEstab: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  confirmLinha: { marginBottom: 4 },
  whatsappBtn: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#25D366', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6 },
});