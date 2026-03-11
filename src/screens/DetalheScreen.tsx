import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { Estabelecimento } from '../types';

const { width } = Dimensions.get('window');
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const getDatas = () => {
  const hoje = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    return {
      dia: DIAS[d.getDay()],
      numero: d.getDate(),
      mes: d.toLocaleString('pt-BR', { month: 'short' }),
      full: d.toLocaleDateString('pt-BR'),
    };
  });
};

const fn = functions();

export default function DetalheScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { estabelecimentoId } = route.params;

  const [estab, setEstab] = useState<Estabelecimento | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [step, setStep] = useState(1);

  const [servicoSel, setServicoSel] = useState<string>('');
  const [dataSel, setDataSel] = useState<any>(null);
  const [horarioSel, setHorarioSel] = useState<string>('');
  const [nome, setNome] = useState('');
  const [confirmado, setConfirmado] = useState(false);

  const datas = getDatas();

  useEffect(() => {
    firestore()
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .get()
      .then(snap => {
        if (snap.exists) setEstab({ id: snap.id, ...snap.data() } as Estabelecimento);
        setLoading(false);
      });
  }, []);

  const confirmar = async () => {
    if (!servicoSel || !dataSel || !horarioSel || !nome) {
      Alert.alert('Atenção', 'Preencha todos os campos!');
      return;
    }
    try {
      setSalvando(true);
      const servico = estab?.servicos.find(s => s.nome === servicoSel);
      await fn.httpsCallable('criarAgendamento')({
        estabelecimentoId,
        estabelecimentoNome: estab?.nome,
        servicoNome: servicoSel,
        servicoPreco: servico?.preco || 0,
        clienteNome: nome,
        data: dataSel.full,
        horario: horarioSel,
      });
      setConfirmado(true);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível agendar.');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1A1A1A" />
      </View>
    );
  }

  if (!estab) {
    return (
      <View style={s.center}>
        <Text style={{ color: '#aaa' }}>Estabelecimento não encontrado.</Text>
      </View>
    );
  }

  // ── TELA DE CONFIRMAÇÃO ──
  if (confirmado) {
    return (
      <View style={s.confirmWrap}>
        <View style={s.confirmCard}>
          <View style={s.confirmCircle}>
            <Text style={s.confirmEmoji}>🎉</Text>
          </View>
          <Text style={s.confirmTitulo}>Agendado!</Text>
          <Text style={s.confirmSub}>Seu horário está confirmado, {nome.split(' ')[0]}!</Text>

          <View style={s.confirmResumo}>
            <Text style={s.confirmEstab}>{estab.nome}</Text>
            {[
              { ic: '💆', txt: servicoSel },
              { ic: '📅', txt: `${dataSel?.full}` },
              { ic: '⏰', txt: horarioSel },
              { ic: '📍', txt: estab.endereco },
            ].map(({ ic, txt }) => (
              <View key={ic} style={s.confirmLinha}>
                <Text style={s.confirmLinhaIc}>{ic}</Text>
                <Text style={s.confirmLinhaTxt}>{txt}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.btnPrimario} onPress={() => navigation.navigate('Agendamentos')}>
            <Text style={s.btnPrimarioText}>Ver meus agendamentos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnSecundario} onPress={() => navigation.navigate('Home')}>
            <Text style={s.btnSecundarioText}>Voltar ao início</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const svcsAtivos = estab.servicos?.filter(s => s.ativo) || [];

  return (
    <View style={s.container}>
      {/* Banner */}
      <View style={[s.banner, { backgroundColor: estab.cor + '44' }]}>
        <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}>
          <Text style={s.voltarBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.bannerEmoji}>{estab.img}</Text>
        <View style={s.bannerInfo}>
          <Text style={s.bannerNome}>{estab.nome}</Text>
          <Text style={s.bannerTipo}>{estab.tipo}</Text>
          <View style={s.bannerTags}>
            <View style={s.bannerTag}>
              <Text style={s.bannerTagText}>★ {estab.avaliacao}</Text>
            </View>
            {estab.horarioFuncionamento && (
              <View style={s.bannerTag}>
                <Text style={s.bannerTagText}>🕐 {estab.horarioFuncionamento}</Text>
              </View>
            )}
            {estab.telefone && (
              <View style={s.bannerTag}>
                <Text style={s.bannerTagText}>📞 {estab.telefone}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.body}>

          {/* Steps indicator */}
          <View style={s.stepsWrap}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={s.stepItem}>
                <View style={[s.stepCircle, step >= i && s.stepCircleAtivo]}>
                  <Text style={[s.stepNum, step >= i && s.stepNumAtivo]}>{i}</Text>
                </View>
                {i < 4 && <View style={[s.stepLine, step > i && s.stepLineAtiva]} />}
              </View>
            ))}
          </View>

          {/* STEP 1 — Serviço */}
          <View style={s.secao}>
            <Text style={s.secaoTitulo}>Serviço</Text>
            {svcsAtivos.length === 0
              ? <Text style={s.emptyText}>Nenhum serviço disponível</Text>
              : svcsAtivos.map(sv => (
                <TouchableOpacity
                  key={sv.id}
                  onPress={() => { setServicoSel(sv.nome); setStep(Math.max(step, 2)); }}
                  style={[s.servicoCard, servicoSel === sv.nome && s.servicoCardAtivo]}>
                  <View style={s.servicoLeft}>
                    <Text style={[s.servicoNome, servicoSel === sv.nome && { color: '#fff' }]}>{sv.nome}</Text>
                    <Text style={[s.servicoDur, servicoSel === sv.nome && { color: '#aaa' }]}>⏱ {sv.duracao} min</Text>
                  </View>
                  <View style={[s.servicoPrecoBox, servicoSel === sv.nome && { backgroundColor: '#C9A96E' }]}>
                    <Text style={[s.servicoPreco, servicoSel === sv.nome && { color: '#1A1A1A' }]}>R${sv.preco}</Text>
                  </View>
                </TouchableOpacity>
              ))
            }
          </View>

          {/* STEP 2 — Data */}
          {step >= 2 && (
            <View style={s.secao}>
              <Text style={s.secaoTitulo}>Data</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.datasScroll}>
                {datas.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { setDataSel(d); setStep(Math.max(step, 3)); }}
                    style={[s.dataCard, dataSel?.full === d.full && s.dataCardAtivo]}>
                    <Text style={[s.dataDia, dataSel?.full === d.full && { color: '#C9A96E' }]}>{d.dia}</Text>
                    <Text style={[s.dataNum, dataSel?.full === d.full && { color: '#fff' }]}>{d.numero}</Text>
                    <Text style={[s.dataMes, dataSel?.full === d.full && { color: '#aaa' }]}>{d.mes}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* STEP 3 — Horário */}
          {step >= 3 && (
            <View style={s.secao}>
              <Text style={s.secaoTitulo}>Horário</Text>
              <View style={s.horariosWrap}>
                {estab.horarios?.map(h => (
                  <TouchableOpacity
                    key={h}
                    onPress={() => { setHorarioSel(h); setStep(Math.max(step, 4)); }}
                    style={[s.horarioChip, horarioSel === h && s.horarioChipAtivo]}>
                    <Text style={[s.horarioText, horarioSel === h && { color: '#fff' }]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* STEP 4 — Nome */}
          {step >= 4 && (
            <View style={s.secao}>
              <Text style={s.secaoTitulo}>Seu nome</Text>
              <TextInput
                style={s.input}
                placeholder="Nome completo"
                placeholderTextColor="#aaa"
                value={nome}
                onChangeText={setNome}
                autoFocus
              />
            </View>
          )}

          {/* Resumo */}
          {(servicoSel || dataSel || horarioSel) && (
            <View style={s.resumo}>
              <Text style={s.resumoTitulo}>Resumo do agendamento</Text>
              {servicoSel && (
                <View style={s.resumoLinha}>
                  <Text style={s.resumoIc}>💆</Text>
                  <Text style={s.resumoTxt}>{servicoSel}</Text>
                </View>
              )}
              {dataSel && (
                <View style={s.resumoLinha}>
                  <Text style={s.resumoIc}>📅</Text>
                  <Text style={s.resumoTxt}>{dataSel.full}</Text>
                </View>
              )}
              {horarioSel && (
                <View style={s.resumoLinha}>
                  <Text style={s.resumoIc}>⏰</Text>
                  <Text style={s.resumoTxt}>{horarioSel}</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[s.btnPrimario, (!servicoSel || !dataSel || !horarioSel || !nome) && s.btnDisabled]}
            disabled={!servicoSel || !dataSel || !horarioSel || !nome || salvando}
            onPress={confirmar}>
            {salvando
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnPrimarioText}>Confirmar Agendamento</Text>
            }
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },

  // Banner
  banner: { padding: 24, paddingTop: 52, flexDirection: 'row', alignItems: 'center', gap: 16 },
  voltarBtn: { position: 'absolute', top: 52, left: 16, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 10, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  voltarBtnText: { fontSize: 20, color: '#1A1A1A' },
  bannerEmoji: { fontSize: 56, marginLeft: 40 },
  bannerInfo: { flex: 1 },
  bannerNome: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  bannerTipo: { fontSize: 12, color: '#666', marginBottom: 8 },
  bannerTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bannerTag: { backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  bannerTagText: { fontSize: 11, color: '#444' },

  body: { padding: 16 },

  // Steps
  stepsWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 16 },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', justifyContent: 'center', alignItems: 'center' },
  stepCircleAtivo: { backgroundColor: '#1A1A1A' },
  stepNum: { fontSize: 12, fontWeight: '700', color: '#999' },
  stepNumAtivo: { color: '#fff' },
  stepLine: { width: 40, height: 2, backgroundColor: '#E0E0E0', marginHorizontal: 4 },
  stepLineAtiva: { backgroundColor: '#1A1A1A' },

  // Secao
  secao: { marginBottom: 20 },
  secaoTitulo: { fontSize: 13, fontWeight: '700', color: '#999', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  emptyText: { color: '#aaa', fontSize: 13 },

  // Serviço
  servicoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderWidth: 2, borderColor: 'transparent' },
  servicoCardAtivo: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  servicoLeft: { flex: 1 },
  servicoNome: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  servicoDur: { fontSize: 11, color: '#888', marginTop: 2 },
  servicoPrecoBox: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  servicoPreco: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },

  // Data
  datasScroll: { marginBottom: 4 },
  dataCard: { width: 56, alignItems: 'center', padding: 10, borderRadius: 14, backgroundColor: '#fff', marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  dataCardAtivo: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  dataDia: { fontSize: 10, color: '#888', fontWeight: '600' },
  dataNum: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginVertical: 2 },
  dataMes: { fontSize: 10, color: '#aaa' },

  // Horário
  horariosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  horarioChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: 'transparent' },
  horarioChipAtivo: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  horarioText: { fontSize: 13, color: '#555', fontWeight: '600' },

  // Input
  input: { backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 14, color: '#1A1A1A', borderWidth: 2, borderColor: '#E0E0E0' },

  // Resumo
  resumo: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 },
  resumoTitulo: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  resumoLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  resumoIc: { fontSize: 14 },
  resumoTxt: { fontSize: 13, color: '#333', fontWeight: '500' },

  // Botões
  btnPrimario: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnPrimarioText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSecundario: { borderWidth: 2, borderColor: '#E0E0E0', borderRadius: 16, padding: 14, alignItems: 'center', marginBottom: 12 },
  btnSecundarioText: { color: '#666', fontSize: 14, fontWeight: '600' },
  btnDisabled: { backgroundColor: '#ccc' },

  // Confirmação
  confirmWrap: { flex: 1, backgroundColor: '#F5F5F5', justifyContent: 'center', padding: 24 },
  confirmCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center' },
  confirmCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  confirmEmoji: { fontSize: 40 },
  confirmTitulo: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  confirmSub: { fontSize: 14, color: '#888', marginBottom: 20, textAlign: 'center' },
  confirmResumo: { width: '100%', backgroundColor: '#F5F5F5', borderRadius: 14, padding: 16, marginBottom: 20 },
  confirmEstab: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  confirmLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  confirmLinhaIc: { fontSize: 14 },
  confirmLinhaTxt: { fontSize: 13, color: '#555' },
});