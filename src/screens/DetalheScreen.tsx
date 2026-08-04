import React, { useEffect, useState,useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, Linking, Image,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { Estabelecimento } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/FontAwesome';
import SeloVerificado from '../assets/selo_verificado.png';
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const DIAS_PADRAO_FUNCIONAMENTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const normalizarHorario = (valor: string) => {
  const [hh, mm] = String(valor || '').split(':').map(Number);

  if (
    Number.isNaN(hh) ||
    Number.isNaN(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return '';
  }

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const minutosHorario = (valor: string) => {
  const horario = normalizarHorario(valor);
  if (!horario) return 0;

  const [hh, mm] = horario.split(':').map(Number);
  return hh * 60 + mm;
};

const getDatas = (
  diasFuncionamento?: string[],
  diasFechados?: string[]
) => {
  const lista = [];
  let d = new Date();

  const diasAbertos =
    Array.isArray(diasFuncionamento)
      ? diasFuncionamento
      : DIAS_PADRAO_FUNCIONAMENTO;

  while (lista.length < 7) {
    const diaSemana = DIAS[d.getDay()];

    const full = d.toLocaleDateString('pt-BR');

    if (
      diasAbertos.includes(diaSemana) &&
      !diasFechados?.includes(full)
    ) {
      lista.push({
        dia: DIAS[d.getDay()],
        numero: d.getDate(),
        mes: d.toLocaleString('pt-BR', { month: 'short' }),
        full,
        dateObj: new Date(d)
      });
    }
    d.setDate(d.getDate() + 1);

    if (lista.length === 0 && d.getTime() - Date.now() > 1000 * 60 * 60 * 24 * 30) {
      break;
    }
  }
  return lista;
};
const toHHMM = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const horarioDisponivelCompleto = (
  horarioInicio: string,
  duracaoServico: number,
  intervaloMin: number,
  horariosOcupados: string[]
) => {

  const inicio = minutosHorario(horarioInicio);

  const fim = inicio + duracaoServico;

  for (
    let m = inicio;
    m < fim;
    m += intervaloMin
  ) {

    const slot = toHHMM(m);

    if (horariosOcupados.includes(slot)) {
      return false;
    }
  }

  return true;
};
const BannerMedia = ({ data, style }: { data: any, style: any }) => {
  const [imgErro, setImgErro] = useState(false);

  const isUrl =
    (typeof data?.fotoPerfil === 'string' && data?.fotoPerfil?.startsWith('http')) ||
    (typeof data?.img === 'string' && data?.img?.startsWith('http'));

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
    <View style={style}>
      <Text style={{ textAlign: 'center' }}>
        {data?.img || '🏢'}
      </Text>
    </View>
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
  const [formaPagamento, setFormaPagamento] = useState<'app' | 'local' | ''>('');
  const [usuarioLogado, setUsuarioLogado] = useState(auth().currentUser);
  const [authChecking, setAuthChecking] = useState(true);
  const [mostrarInfoEstab, setMostrarInfoEstab] = useState(false);
const criandoAgendamentoRef = useRef(false);
  const podePagarNoApp =
  (estab?.plano === 'pro' || estab?.plano === 'elite') &&
  estab?.pagamentoAppAtivo === true &&
  !!estab?.pixChave &&
  !!estab?.responsavelNome &&
  !!estab?.responsavelTelefone &&
  !!estab?.responsavelEmail;
  const datas = getDatas(
    estab?.diasFuncionamento,
    estab?.diasFechados
  );


  useEffect(() => {
    const unsub = firestore()
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .onSnapshot(snap => {
        if (snap.exists) {
          setEstab({ id: snap.id, ...snap.data() } as Estabelecimento);
        }
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
    const unsubAuth = auth().onAuthStateChanged(user => {
      setUsuarioLogado(user);
      setAuthChecking(false);

      if (user?.displayName) {
        setNome(user.displayName);
        setNomeUsuario(user.displayName);
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!authChecking && !usuarioLogado?.uid) {
      navigation.replace('ClienteLogin', { estabelecimentoId });
    }
  }, [authChecking, estabelecimentoId, navigation, usuarioLogado?.uid]);

  useEffect(() => {
  if (!dataSel || !estabelecimentoId) return;

  const unsub = firestore()
    .collection('horariosOcupados')
    .where('estabelecimentoId', '==', estabelecimentoId)
    .where('data', '==', dataSel.full)
    .onSnapshot(snap => {

     const ocupados = snap.docs
  .map(doc => {

    const horario = String(doc.data()?.horario || '');

    // evita erro se vier vazio
    if (!horario.includes(':')) {
      return null;
    }

    const [h, m] = horario.split(':');

    // normaliza 9:0 -> 09:00
    const hora = String(
      parseInt(h || '0', 10)
    ).padStart(2, '0');

    const minuto = String(
      parseInt(m || '0', 10)
    ).padStart(2, '0');

    return `${hora}:${minuto}`;
  })
  .filter(Boolean) as string[];

console.log('HORARIOS OCUPADOS:', ocupados);

setHorariosOcupados(ocupados);
});

return () => unsub();

}, [dataSel, estabelecimentoId]);

// 🔥 serviço selecionado
const servicoObj = estab?.servicos?.find(
  s => s.nome === servicoSel
);

  const confirmar = async () => {
  if (criandoAgendamentoRef.current || salvando) {
    return;
  }

  criandoAgendamentoRef.current = true;
  
    if (!servicoSel || !dataSel || !horarioSel || !nome || !formaPagamento) {
      Alert.alert('Atenção', 'Preencha todos os campos!');
      criandoAgendamentoRef.current = false;
      return;
    }

    const user = auth().currentUser;
    if (!user?.uid) {
      criandoAgendamentoRef.current = false;
      Alert.alert(
        'Faca login',
        'Entre na sua conta para agendar este horario.',
        [
          { text: 'Agora nao', style: 'cancel' },
          {
            text: 'Entrar',
            onPress: () => navigation.navigate('ClienteLogin'),
          },
        ]
      );
      return;
    }

    try {
      setSalvando(true);

      const servicos = Array.isArray(estab?.servicos) ? estab.servicos : [];
      const servico = servicos.find(s => s.nome === servicoSel);

      if (!servico) throw new Error('Serviço não encontrado');

      const functionsInstance = getFunctions(getApp(), 'southamerica-east1');
      const criarAgendamento = httpsCallable(functionsInstance, 'criarAgendamento');

      const res: any = await criarAgendamento({
        estabelecimentoId,
        servicoNome: servicoSel,
        clienteNome: nome,
        clienteUid: user.uid,
        data: dataSel.full,
        horario: horarioSel,
        formaPagamento,
      });

      const agendamentoId = res.data?.id;
      if (!agendamentoId) throw new Error('Erro ao criar agendamento');

      await AsyncStorage.setItem('clienteNome', nome);

      if (formaPagamento === 'app') {
        navigation.navigate('PagamentoCliente', {
          agendamentoId,
          estabelecimentoId,
          servicoNome: servicoSel,
          valor: servicoObj?.preco,
          nomeEstabelecimento: estab?.nome,
        });
        return;
      }

      setConfirmado(true);

    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao agendar');
   } finally {
  setSalvando(false);
  criandoAgendamentoRef.current = false;
}
  };

 const abrirWhatsApp = async () => {
    const raw = estab?.telefone;

    if (!raw) {
      Alert.alert('WhatsApp indisponível', 'Este estabelecimento não possui WhatsApp cadastrado.');
      return;
    }

    const tel = raw.replace(/\D/g, '');

    if (tel.length < 10) {
      Alert.alert('Número inválido', 'WhatsApp do estabelecimento inválido.');
      return;
    }

    const numeroFinal = tel.startsWith('55') ? tel : `55${tel}`;

    const url = `https://wa.me/${numeroFinal}?text=${encodeURIComponent(
      `Olá! Vim pelo app e gostaria de marcar um horário.`
    )}`;

    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.');
      return;
    }

    Linking.openURL(url);
  };

  if (loading || authChecking || !usuarioLogado?.uid) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }
  
function gerarSlotsTela(
  horariosBase: string[],
  _intervalo = 30
) {
  return Array.from(
    new Set(
      horariosBase
        .map(normalizarHorario)
        .filter(Boolean)
    )
  ).sort((a, b) => minutosHorario(a) - minutosHorario(b));
}

const bloqueadosDaData =
  dataSel?.full && estab?.horariosBloqueados?.[dataSel.full]
    ? estab.horariosBloqueados[dataSel.full].map(normalizarHorario)
    : [];

const todosHorarios = gerarSlotsTela(
  Array.isArray(estab?.horarios)
    ? estab.horarios
    : [],
  Number(estab?.intervaloMin || 30)
).filter(h => {
  const duracao = Number(servicoObj?.duracao || 30);
  const intervalo = Number(estab?.intervaloMin || 30);
  const inicio = minutosHorario(h);
  const fim = inicio + duracao;

  for (let m = inicio; m < fim; m += intervalo) {
    if (bloqueadosDaData.includes(toHHMM(m))) {
      return false;
    }
  }

  return true;
});

const semHorarios = todosHorarios.every(h => {

  const ocupado = !horarioDisponivelCompleto(
  h,
  Number(servicoObj?.duracao || 30),
  Number(estab?.intervaloMin || 30),
  horariosOcupados
);

  const [hora, minuto] = h.split(':').map(Number);

  const agora = new Date();

  const isHoje =
    dataSel?.full === agora.toLocaleDateString('pt-BR');

  const jaPassou =
    isHoje &&
    (
      agora.getHours() > hora ||
      (
        agora.getHours() === hora &&
        agora.getMinutes() >= minuto
      )
    );

  return ocupado || jaPassou;
});
 if (confirmado) {
  return (
    <View style={s.confirmWrap}>
      <View style={s.confirmCard}>

        {/* TOPO */}
        <View style={s.confirmCircle}>
          <Text style={s.confirmEmoji}>🎉</Text>
        </View>

        <Text style={s.confirmTitulo}>
          Agendamento confirmado!
        </Text>

        <Text style={s.confirmSub}>
          Seu horário foi reservado com sucesso,
          {' '}
          {(nomeUsuario || nome).split(' ')[0]}.
        </Text>

        {/* RESUMO */}
        <View style={s.confirmResumo}>

          <View style={s.confirmHeader}>
            <BannerMedia
              data={estab}
              style={s.confirmFoto}
            />

            <View style={{ flex: 1 }}>
              <Text style={s.confirmEstab}>
                {estab?.nome}
              </Text>

              <Text style={s.confirmTipo}>
                {estab?.tipo}
              </Text>
            </View>
          </View>

          <View style={s.confirmDivider} />
<View style={s.confirmLinha}>
  <View style={s.confirmIconWrap}>
    <Icon
      name="user"
      size={14}
      color="#C9A96E"
    />
  </View>

  <View style={{ flex: 1 }}>
    <Text style={s.confirmLabel}>
      Cliente
    </Text>

    <Text style={s.confirmValue}>
      {nomeUsuario || nome}
    </Text>
  </View>
</View>
          <View style={s.confirmLinha}>
            <View style={s.confirmIconWrap}>
              <Icon
                name="scissors"
                size={14}
                color="#C9A96E"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.confirmLabel}>
                Serviço
              </Text>

              <Text style={s.confirmValue}>
                {servicoSel}
              </Text>
            </View>
          </View>

          <View style={s.confirmLinha}>
            <View style={s.confirmIconWrap}>
              <Icon
                name="calendar"
                size={14}
                color="#C9A96E"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.confirmLabel}>
                Data
              </Text>

              <Text style={s.confirmValue}>
                {dataSel?.full}
              </Text>
            </View>
          </View>

          <View style={s.confirmLinha}>
            <View style={s.confirmIconWrap}>
              <Icon
                name="clock-o"
                size={14}
                color="#C9A96E"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.confirmLabel}>
                Horário
              </Text>

              <Text style={s.confirmValue}>
                {horarioSel}
              </Text>
            </View>
          </View>

          <View style={s.confirmLinha}>
            <View style={s.confirmIconWrap}>
              <Icon
                name="credit-card"
                size={14}
                color="#C9A96E"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.confirmLabel}>
                Pagamento
              </Text>

              <Text style={s.confirmValue}>
                {formaPagamento === 'app'
                  ? 'Pagamento via app'
                  : 'Pagamento no local'}
              </Text>
            </View>
          </View>

        </View>

        {/* ALERTA */}
        <View style={s.confirmAlert}>
          <Text style={s.confirmAlertText}>
            ⏰ Você receberá um lembrete próximo ao horário do atendimento.
          </Text>
        </View>

        {/* BOTÃO */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={s.btnPrimario}
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [
                {
                  name: 'HomeTabs',
                  params: {
                    screen: 'Agendamentos',
                  },
                },
              ],
            })
          }
        >
          <Text style={s.btnPrimarioText}>
            Ver meus agendamentos
          </Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}

  const svcsAtivos = Array.isArray(estab?.servicos) ? estab.servicos.filter(s => s.ativo) : [];
  const profissionaisAtivos = Array.isArray((estab as any)?.profissionais)
    ? (estab as any).profissionais.filter((p: any) => p && p.nome && p.ativo !== false)
    : [];
  const notaEstab = Number(estab?.avaliacao || 0);
  const totalAvaliacoes = Number((estab as any)?.totalAvaliacoes || (estab as any)?.quantidadeAvaliacoes || 0);
  const servicosMaisAgendados = svcsAtivos.slice(0, 6);

   return (
    <View style={s.container}>

      {/* HEADER */}
      <View style={s.banner}>
        <BannerMedia data={estab} style={s.bannerEmoji} />
        <View style={s.bannerInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.bannerNome}>{estab?.nome}</Text>

            {(estab?.verificado === true || estab?.plano === 'elite') && (
              <Image
                source={SeloVerificado}
                style={{
                  width: 18,
                  height: 18,
                  resizeMode: 'contain',
                }}
              />
            )}
          </View>
          <Text style={s.bannerTipo}>{estab?.tipo}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
  <View style={s.body}>

    {estab?.plano === 'elite' &&
      estab?.assinaturaAtiva === true &&
      (estab as any)?.iaSimulacaoAtiva === true && (
        <TouchableOpacity
          style={s.iaBtn}
          onPress={() =>
            navigation.navigate('AISimulacaoScreen', {
              estabelecimentoId: estab.id,
            })
          }
        >
          <Text style={s.iaBtnText}>
            ✨ Simular resultado com IA
          </Text>

          <Text style={s.iaBtnSub}>
            Veja uma prévia antes de agendar
          </Text>
        </TouchableOpacity>
    )}

    {profissionaisAtivos.length > 0 && (
      <View style={s.secao}>
        <Text style={s.secaoTitulo}>Nossa equipe</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {profissionaisAtivos.map((prof: any) => (
            <View key={prof.id || prof.nome} style={s.profCard}>
              {prof.foto ? (
                <Image source={{ uri: prof.foto }} style={s.profFoto} />
              ) : (
                <View style={s.profFotoPlaceholder}>
                  <Icon name="user" size={24} color="#888" />
                </View>
              )}
              <Text style={s.profNome} numberOfLines={1}>{prof.nome}</Text>
              <Text style={s.profFuncao} numberOfLines={1}>{prof.funcao}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    )}

    <View style={s.estabResumoCard}>
      <BannerMedia data={estab} style={s.estabResumoLogo} />
      <View style={s.estabResumoInfo}>
        <View style={s.estabResumoNomeRow}>
          <Text style={s.estabResumoNome} numberOfLines={2}>{estab?.nome}</Text>
          {(estab?.verificado === true || estab?.plano === 'elite') && (
            <Image source={SeloVerificado} style={s.estabResumoSelo} />
          )}
        </View>

        <View style={s.avaliacoesRow}>
          <Text style={s.avaliacoesNota}>{notaEstab > 0 ? notaEstab.toFixed(1) : 'Novo'}</Text>
          {notaEstab > 0 && <Icon name="star" size={18} color="#C9A96E" />}
          <Text style={s.avaliacoesTotal}>
            ({totalAvaliacoes} {totalAvaliacoes === 1 ? 'avaliação' : 'avaliações'})
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setMostrarInfoEstab(prev => !prev)}
          style={s.infoResumoBtn}
        >
          <Text style={s.infoResumoText}>{mostrarInfoEstab ? '− Informações' : '+ Informações'}</Text>
        </TouchableOpacity>
      </View>
    </View>

    {mostrarInfoEstab && (
      <View style={s.infoResumoBox}>
        {!!estab?.descricao && <Text style={s.infoResumoDesc}>{estab.descricao}</Text>}
        {!!estab?.endereco && <Text style={s.infoResumoLinha}>📍 {estab.endereco}{estab.numero ? `, ${estab.numero}` : ''}</Text>}
        {!!estab?.horarioFuncionamento && <Text style={s.infoResumoLinha}>⏰ {estab.horarioFuncionamento}</Text>}
      </View>
    )}

    {servicosMaisAgendados.length > 0 && (
      <View style={s.secao}>
        <Text style={s.secaoTitulo}>Mais agendados</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {servicosMaisAgendados.map(sv => (
            <TouchableOpacity
              key={`mais-${sv.id}`}
              activeOpacity={0.88}
              onPress={() => { setServicoSel(sv.nome); setStep(Math.max(step, 2)); }}
              style={[s.maisCard, servicoSel === sv.nome && s.maisCardAtivo]}
            >
              <Text style={[s.maisNome, servicoSel === sv.nome && s.maisNomeAtivo]} numberOfLines={2}>{sv.nome}</Text>
              <Text style={[s.maisDuracao, servicoSel === sv.nome && s.maisTextoAtivo]}>{sv.duracao} min</Text>
              <Text style={[s.maisPreco, servicoSel === sv.nome && s.maisTextoAtivo]}>R$ {sv.preco}</Text>
              <View style={[s.maisAgendarBtn, servicoSel === sv.nome && s.maisAgendarBtnAtivo]}>
                <Text style={[s.maisAgendarText, servicoSel === sv.nome && s.maisAgendarTextAtivo]}>Agendar</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    )}

    <>
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
              {datas.length === 0 ? (
                <View style={s.semHorarioCard}>
                  <Text style={s.semHorarioTitulo}>
                    Agenda fechada
                  </Text>

                  <Text style={s.semHorarioDesc}>
                    Este estabelecimento ainda não liberou dias para agendamento.
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {datas.map((d, i) => (
                    <TouchableOpacity key={i} onPress={() => { setDataSel(d); setHorarioSel(''); setStep(Math.max(step, 3)); }} style={[s.dataCard, dataSel?.full === d.full && s.dataCardAtivo]}>
                      <Text style={[s.dataDia, dataSel?.full === d.full && { color: '#C9A96E' }]}>{d.dia}</Text>
                      <Text style={[s.dataNum, dataSel?.full === d.full && { color: '#fff' }]}>{d.numero}</Text>
                      <Text style={[s.dataMes, dataSel?.full === d.full && { color: '#aaa' }]}>{d.mes}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {step >= 3 && (
            <View style={s.secao}>
              <Text style={s.secaoTitulo}>Horário</Text>
              <View style={s.horariosWrap}>
            {todosHorarios.map(h => {

  const ocupado = !horarioDisponivelCompleto(
  h,
  Number(servicoObj?.duracao || 30),
  Number(estab?.intervaloMin || 30),
  horariosOcupados
);

  const [hora, minuto] = h.split(':').map(Number);

  const agora = new Date();

  const isHoje =
    dataSel?.full === agora.toLocaleDateString('pt-BR');

  const jaPassou =
    isHoje &&
    (
      agora.getHours() > hora ||
      (
        agora.getHours() === hora &&
        agora.getMinutes() >= minuto
      )
    );

  const indisponivel = ocupado || jaPassou;

  return (
    <TouchableOpacity
      key={h}
      disabled={indisponivel}
      onPress={() => {
        setHorarioSel(h);
        setStep(Math.max(step, 4));
      }}
      style={[
        s.horarioChip,
        horarioSel === h && s.horarioChipAtivo,
        ocupado && s.horarioChipOcupado,
        jaPassou && s.horarioChipPassado
      ]}
    >
      <Text
        style={[
          s.horarioText,
          horarioSel === h && { color: '#fff' },
          indisponivel && { color: '#999' }
        ]}
      >
        {h}

        {ocupado && ' 🔒'}

        {jaPassou && !ocupado && ' ⏰'}
      </Text>
    </TouchableOpacity>
  );
})}
              </View>
            </View>
          )}
{semHorarios && (
  <View style={s.semHorarioCard}>
    <Text style={s.semHorarioEmoji}>😕</Text>

    <Text style={s.semHorarioTitulo}>
      Ops! Sem horários disponíveis
    </Text>

    <Text style={s.semHorarioDesc}>
      Todos os horários deste dia já foram preenchidos.
      Escolha outra data para continuar.
    </Text>
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

  {/* 👤 CLIENTE */}
  <View style={s.resumoFinalLinha}>
    <Icon name="user" size={16} color="#C9A96E" />
    <Text style={s.resumoFinalTexto}>
      {nomeUsuario || nome}
    </Text>
  </View>

  {/* 💆 SERVIÇO */}
  <View style={s.resumoFinalLinha}>
    <Icon name="check-circle" size={16} color="#C9A96E" />
    <Text style={s.resumoFinalTexto}>
      {servicoSel} — R$
      {estab?.servicos?.find(s => s.nome === servicoSel)?.preco}
    </Text>
  </View>

  {/* 📅 DATA/HORA */}
  <View style={s.resumoFinalLinha}>
    <Icon name="calendar" size={16} color="#C9A96E" />
    <Text style={s.resumoFinalTexto}>
      {dataSel?.dia}, {dataSel?.numero} de {dataSel?.mes} às {horarioSel}
    </Text>
  </View>

  {/* 💳 PAGAMENTO (🔥 NOVO) */}
  <View style={s.resumoFinalLinha}>
    <Icon name="credit-card" size={16} color="#C9A96E" />
    <Text style={s.resumoFinalTexto}>
      {formaPagamento === 'app'
        ? 'Pagamento via app'
        : 'Pagamento no local'}
    </Text>
  </View>
</View>
            </>
          )}
{step >= 4 && (
  <View style={s.secao}>
    <Text style={s.secaoTitulo}>Pagamento</Text>

   <TouchableOpacity
    disabled={!podePagarNoApp}
    onPress={() => podePagarNoApp && setFormaPagamento('app')}
    style={[
      s.pagamentoCard,
      formaPagamento === 'app' && s.pagamentoCardAtivo,
      !podePagarNoApp && { opacity: 0.4 }
    ]}
  >
    <Text style={s.pagamentoTitulo}>💳 Pagar agora</Text>

    <Text style={s.pagamentoDesc}>
      {podePagarNoApp
        ? 'Pague no app e garanta seu horário'
        : 'Pagamento online indisponível para este estabelecimento'}
    </Text>
  </TouchableOpacity>

  {/* 🏢 PAGAR NO LOCAL (SEMPRE LIBERADO) */}
  <TouchableOpacity
    onPress={() => setFormaPagamento('local')}
    style={[
      s.pagamentoCard,
      formaPagamento === 'local' && s.pagamentoCardAtivo
    ]}
  >
    <Text style={s.pagamentoTitulo}>🏢 Pagar no local</Text>

    <Text style={s.pagamentoDesc}>
      Pague após o atendimento diretamente no estabelecimento
    </Text>
  </TouchableOpacity>
</View>
)}
          <TouchableOpacity
           style={[
  s.btnPrimario,
  (
    !servicoSel ||
    !dataSel ||
    !horarioSel ||
    !(nomeUsuario || nome) ||
    !formaPagamento
  ) && s.btnDisabled
]}
           disabled={
  !servicoSel ||
  !dataSel ||
  !horarioSel ||
  !(nomeUsuario || nome) ||
  !formaPagamento ||
  salvando
}
            onPress={confirmar}>
            {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimarioText}>Finalizar Agendamento</Text>}
          </TouchableOpacity>
    </>
        </View>
      </ScrollView>

      {/* WHATSAPP FLOAT */}
      {!!estab?.telefone && (
        <View style={s.whatsappFloatWrap} pointerEvents="box-none">
          <Text style={s.whatsappHint}>Tire dúvidas pelo WhatsApp</Text>
          <TouchableOpacity
            onPress={abrirWhatsApp}
            style={s.whatsappBtn}
            activeOpacity={0.85}
          >
            <Icon name="whatsapp" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
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
  loginRequiredCard: { backgroundColor: '#1A1A1A', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#C9A96E', marginTop: 8 },
  loginRequiredTitle: { color: '#C9A96E', fontSize: 18, fontWeight: '900', marginBottom: 8 },
  loginRequiredText: { color: '#EAEAEA', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  loginRequiredBtn: { backgroundColor: '#C9A96E', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  loginRequiredBtnText: { color: '#1A1A1A', fontSize: 14, fontWeight: '900' },
  confirmHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 12,
},

confirmFoto: {
  width: 52,
  height: 52,
  borderRadius: 26,
  backgroundColor: '#F5F5F5',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 12,
},

confirmTipo: {
  fontSize: 12,
  color: '#888',
  marginTop: 2,
},

confirmDivider: {
  height: 1,
  backgroundColor: '#eee',
  marginVertical: 12,
},

confirmIconWrap: {
  width: 30,
  height: 30,
  borderRadius: 15,
  backgroundColor: '#C9A96E22',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 10,
},

confirmLabel: {
  fontSize: 11,
  color: '#999',
  fontWeight: '700',
  textTransform: 'uppercase',
},

confirmValue: {
  fontSize: 14,
  color: '#1A1A1A',
  fontWeight: '700',
},

confirmAlert: {
  backgroundColor: '#FFF8E8',
  borderRadius: 14,
  padding: 12,
  marginBottom: 16,
  borderWidth: 1,
  borderColor: '#F0D080',
},

confirmAlertText: {
  fontSize: 12,
  color: '#8C6A3B',
  textAlign: 'center',
  fontWeight: '600',
},
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
  profCard: { width: 118, backgroundColor: '#fff', borderRadius: 14, padding: 10, marginRight: 10, alignItems: 'center' },
  profFoto: { width: 62, height: 62, borderRadius: 31, marginBottom: 8, backgroundColor: '#F5F5F5' },
  profFotoPlaceholder: { width: 62, height: 62, borderRadius: 31, marginBottom: 8, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  profNome: { width: '100%', color: '#1A1A1A', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  profFuncao: { width: '100%', color: '#888', fontSize: 11, marginTop: 2, textAlign: 'center' },
  estabResumoCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#EFE7D6', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
  estabResumoLogo: { width: 74, height: 74, borderRadius: 16, marginRight: 14, backgroundColor: '#F7F1E5' },
  estabResumoInfo: { flex: 1 },
  estabResumoNomeRow: { flexDirection: 'row', alignItems: 'center' },
  estabResumoNome: { flex: 1, color: '#1A1A1A', fontSize: 17, fontWeight: '900', lineHeight: 22 },
  estabResumoSelo: { width: 17, height: 17, resizeMode: 'contain', marginLeft: 6 },
  avaliacoesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 9 },
  avaliacoesNota: { color: '#C9A96E', fontSize: 16, fontWeight: '900', marginRight: 5 },
  avaliacoesTotal: { color: '#777', fontSize: 13, fontWeight: '600', marginLeft: 7 },
  infoResumoBtn: { alignSelf: 'flex-end', marginTop: 12, paddingVertical: 4, paddingHorizontal: 2 },
  infoResumoText: { color: '#C9A96E', fontSize: 14, fontWeight: '900' },
  infoResumoBox: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginTop: -6, marginBottom: 18, borderWidth: 1, borderColor: '#EFE7D6' },
  infoResumoDesc: { color: '#444', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  infoResumoLinha: { color: '#555', fontSize: 12, lineHeight: 18, marginTop: 4 },
  maisCard: { width: 148, minHeight: 184, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginRight: 12, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#EFE7D6', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8 },
  maisCardAtivo: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  maisNome: { minHeight: 42, color: '#1A1A1A', fontSize: 14, fontWeight: '800', lineHeight: 20, textAlign: 'center' },
  maisNomeAtivo: { color: '#fff' },
  maisDuracao: { color: '#888', fontSize: 12, fontWeight: '700' },
  maisPreco: { color: '#1A1A1A', fontSize: 18, fontWeight: '900' },
  maisTextoAtivo: { color: '#C9A96E' },
  maisAgendarBtn: { width: '100%', backgroundColor: '#C9A96E', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  maisAgendarBtnAtivo: { backgroundColor: '#fff' },
  maisAgendarText: { color: '#1A1A1A', fontSize: 13, fontWeight: '900' },
  maisAgendarTextAtivo: { color: '#1A1A1A' },
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
 horarioChipOcupado: {
  backgroundColor: '#ECECEC',
  borderWidth: 1,
  borderColor: '#D8D8D8'
},
horarioChipPassado: {
  backgroundColor: '#F7F7F7',
  opacity: 0.5
},
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
 confirmLinha: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 12,
},
  whatsappFloatWrap: { position: 'absolute', bottom: 24, right: 18, alignItems: 'flex-end', zIndex: 30 },
  whatsappHint: { backgroundColor: '#1A1A1A', color: '#fff', fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, marginBottom: 8, maxWidth: 190, textAlign: 'center', elevation: 3 },
  whatsappBtn: { backgroundColor: '#25D366', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6 },
pagamentoCard: {
  backgroundColor: '#fff',
  borderRadius: 14,
  padding: 14,
  marginBottom: 10,
  borderWidth: 1,
  borderColor: '#eee'
},
pagamentoCardAtivo: {
  borderColor: '#C9A96E',
  backgroundColor: '#C9A96E22'
},
pagamentoTitulo: {
  fontSize: 14,
  fontWeight: '700',
  color: '#1A1A1A'
},
pagamentoDesc: {
  fontSize: 12,
  color: '#666',
  marginTop: 4
},
semHorarioCard: {
  backgroundColor: '#FFF3F3',
  borderRadius: 16,
  padding: 16,
  alignItems: 'center',
  marginBottom: 12,
  borderWidth: 1,
  borderColor: '#FFD6D6'
},
semHorarioEmoji: {
  fontSize: 28,
  marginBottom: 6
},
semHorarioTitulo: {
  fontSize: 14,
  fontWeight: '700',
  color: '#D9534F',
  marginBottom: 4
},
semHorarioDesc: {
  fontSize: 12,
  color: '#666',
  textAlign: 'center'
},
iaBtn: {
  backgroundColor: '#1A1A1A',
  borderRadius: 18,
  padding: 16,
  alignItems: 'center',
  marginBottom: 18,
  borderWidth: 1,
  borderColor: '#C9A96E',
},

iaBtnText: {
  color: '#C9A96E',
  fontSize: 15,
  fontWeight: '900',
},

iaBtnSub: {
  color: '#AAA',
  fontSize: 12,
  marginTop: 4,
  fontWeight: '600',
},
});
