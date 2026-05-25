import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Dimensions,
  StatusBar, Image, Linking, ScrollView, Platform
} from 'react-native';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getApp } from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { BarChart } from 'react-native-chart-kit';
import Share from 'react-native-share';


import type { Estabelecimento, Agendamento } from '../types';
import SeloVerificado from '../assets/selo_verificado.png';

const { width } = Dimensions.get('window');
const GOLD = '#C9A96E';

// ===== COMPONENT =====
const EstabImage = ({ item }: { item: Estabelecimento }) => {
  const [imgErro, setImgErro] = useState(false);
  const uri = item.fotoPerfil || item.img;
  const isUrl = typeof uri === 'string' && uri.startsWith('http');

  if (isUrl && !imgErro) {
    return (
      <Image
        source={{ uri }}
        style={s.estabFoto}
        onError={() => setImgErro(true)}
      />
    );
  }

  return (
    <View style={[s.estabIcon, { backgroundColor: (item.cor || GOLD) + '15' }]}>
      <Text style={s.estabEmoji}>{(!isUrl ? item.img : null) || '🏪'}</Text>
    </View>
  );
};

// ===== SCREEN =====
export default function AdminDashScreen() {
  const navigation = useNavigation<any>();

  const { admin, user, signOut } = useAuth();
  const authUser = getAuth().currentUser;
  const adminUid = authUser?.uid;
  const adminAuthPronto =
    !!adminUid && user?.uid === adminUid && admin?.id === adminUid;

  const logErroPermissaoAdmin = useCallback((label: string, err: unknown) => {
    console.log(label, {
      adminUid,
      authUid: authUser?.uid || null,
      contextUserUid: user?.uid || null,
      adminId: admin?.id || null,
      code: (err as any)?.code || null,
      message: (err as any)?.message || null,
    });
  }, [admin?.id, adminUid, authUser?.uid, user?.uid]);

  const [aba, setAba] = useState<
    'dash' | 'agends' | 'estabs' | 'stories'
  >('dash');

  const [estabs, setEstabs] = useState<
    Estabelecimento[]
  >([]);

  const [agends, setAgends] = useState<
    Agendamento[]
  >([]);

  const [meusStories, setMeusStories] =
    useState<any[]>([]);

  const [totalLikes, setTotalLikes] =
    useState(0);

  const [loadingId, setLoadingId] =
    useState<string | null>(null);

  const [notifNaoLidas, setNotifNaoLidas] =
    useState(0);

  const [planoAtual, setPlanoAtual] =
    useState<string | null>(null);

  const [assinaturaAtiva, setAssinaturaAtiva] =
    useState(false);

  const [verificado, setVerificado] =
    useState(false);

  const [solicitacaoStatus, setSolicitacaoStatus] =
    useState<string | null>(null);

  const [diasRestantes, setDiasRestantes] =
    useState<number | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [agoraAgendamentos, setAgoraAgendamentos] =
    useState(() => Date.now());

 const [loadingAcao, setLoadingAcao] =
  useState<{ id: string; acao: 'concluido' | 'cancelado' } | null>(null);
  
  const [periodoGrafico, setPeriodoGrafico] =
  useState<'dia' | 'mes' | 'ano'>('dia');
  const [whatsSuporte, setWhatsSuporte] = useState<string | null>(null);
  // ===== LÓGICA =====
const temEstabelecimento = estabs.length > 0;
const isNovoUsuario = !temEstabelecimento;
const principal = useMemo(() => {
 
 if (!estabs.length) return null;
  return estabs.find(e => e.principal) || estabs[0];
}, [estabs]);
// 👉 NOVA REGRA CENTRAL
const planoFree = planoAtual === 'free';
const semPlano = !planoAtual;


const trialAtivo =
  planoAtual === 'trial' &&
  diasRestantes !== null &&
  diasRestantes > 0;

const trialExpirado =
  planoAtual === 'trial' &&
  diasRestantes !== null &&
  diasRestantes <= 0;

const planoPagoAtivo = assinaturaAtiva === true;
const planoPagoExpirado =
  !semPlano &&
  !planoFree &&
  planoAtual !== 'trial' &&
  !planoPagoAtivo;

// 🔥 REGRA FINAL
const isBloqueado = useMemo(() => {
  if (loading) return true;
  if (!temEstabelecimento) return true;

  // liberado se:
  if (planoPagoAtivo) return false;
  if (trialAtivo) return false;

  return true;
}, [loading, temEstabelecimento, planoPagoAtivo, trialAtivo]);

useEffect(() => {
  if (isBloqueado && (aba === 'agends' || aba === 'stories')) {
    setAba('dash');
  }
}, [aba, isBloqueado]);

  // ===== ABA CONTROLE =====
  const mudarAba = (novaAba: any) => {
  if (loading) return;

  if (novaAba === 'estabs') {
    setAba(novaAba);
    return;
  }

  if (isBloqueado) {
    let mensagem = '';

    if (!temEstabelecimento) {
      mensagem = 'Crie seu primeiro estabelecimento para começar.';
    } 
    else if (semPlano) {
      mensagem = 'Ative seu período de teste grátis ou plano.';
    } 
    else if (trialExpirado) {
      mensagem = 'Seu trial expirou. Ative um plano.';
    } else if (planoPagoExpirado) {
      mensagem = 'Sua assinatura expirou. Renove seu plano.';
    }

    Alert.alert('Acesso bloqueado 🔒', mensagem);
    return;
  }

  setAba(novaAba);
};

const checarBloqueio = () => {
  if (!isBloqueado) return false;

  let mensagem = '';

  if (!temEstabelecimento) {
    mensagem = 'Crie seu primeiro estabelecimento para começar.';
  } 
  else if (semPlano) {
    // 🔥 NUNCA ativou trial
    mensagem = 'Ative seu período de teste grátis ou escolha um plano.';
  } 
  else if (trialExpirado) {
    // 🔥 TRIAL ACABOU
    mensagem = 'Seu trial expirou. Ative um plano para continuar.';
  } else if (planoPagoExpirado) {
    mensagem = 'Sua assinatura expirou. Renove seu plano para continuar.';
  } 
  else {
    mensagem = 'Ative um plano para continuar.';
  }

  Alert.alert('Função bloqueada 🔒', mensagem);
  return true;
};
const abrirStoryAdmin = (storyId: string) => {
  const startIndex = meusStories.findIndex(story => story.id === storyId);

  if (startIndex < 0) return;

  navigation.navigate('StoryView', {
    stories: meusStories,
    startIndex,
  });
};

  // ===== LISTENERS =====
  useEffect(() => {
    if (!adminAuthPronto || !adminUid || !authUser) return;

    let ativo = true;
    let unsubEstabs: undefined | (() => void);
    let unsubAgends: undefined | (() => void);
    let unsubStories: undefined | (() => void);
    let unsubSelo: undefined | (() => void);

    const iniciarListenersAdmin = async () => {
      try {
        await authUser.getIdToken();

        if (!ativo) return;

    setLoading(true);

    unsubEstabs = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', adminUid)
      .onSnapshot(
        snap => {
          const lista = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
          })) as Estabelecimento[];

          setEstabs(lista);

          if (lista.length === 0) {
            setPlanoAtual(null);
            setAssinaturaAtiva(false);
            setDiasRestantes(null);
          } else {
            const principal = lista.find(e => e.principal) || lista[0];

            setPlanoAtual(principal?.plano ?? null);
            setVerificado(Boolean((principal as any)?.verificado));

            if (principal?.expiraEm?.toDate) {
              const agora = new Date();
              const expira = principal.expiraEm.toDate();
              const diff = expira.getTime() - agora.getTime();
              const dias = Math.ceil(diff / (1000 * 60 * 60 * 24));

              setAssinaturaAtiva(
                Boolean(principal?.assinaturaAtiva) && expira > agora
              );
              setDiasRestantes(Math.max(0, dias));
            } else {
              setAssinaturaAtiva(Boolean(principal?.assinaturaAtiva));
              setDiasRestantes(null);
            }
          }

          setLoading(false);
        },
        err => {
          logErroPermissaoAdmin('Erro Firestore:', err);
          setLoading(false);
        }
      );

    unsubAgends = firestore()
  .collection('agendamentos')
  .where('adminId', '==', adminUid)
  .orderBy('criadoEm', 'desc')
  .limit(100)
  .onSnapshot(
    snap => {
      if (!snap) return;

      setAgends(
        snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Agendamento[]
      );
    },
    err => {
      logErroPermissaoAdmin('ERRO AGENDAMENTOS ADMIN:', err);
    }
  );

    unsubStories = firestore()
  .collection('stories')
  .where('adminId', '==', adminUid)
  .where('ativo', '==', true)
  .onSnapshot(
    snap => {
      const storiesData = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as any[];

      setMeusStories(storiesData);

      const likes = storiesData.reduce(
        (acc, curr) => acc + (curr.likesCount || 0),
        0
      );

      setTotalLikes(likes);
    },
    err => {
      console.log('ERRO STORIES ADMIN:', err);
    }
  );

    // ✅ Busca status da solicitação de selo
    unsubSelo = firestore()
  .collection('solicitacoesVerificacao')
  .where('adminId', '==', adminUid)
  .orderBy('criadoEm', 'desc')
  .limit(1)
  .onSnapshot(
    snap => {
      if (snap && snap.docs.length > 0) {
        setSolicitacaoStatus(snap.docs[0].data().status || null);
      } else {
        setSolicitacaoStatus(null);
      }
    },
    err => {
      logErroPermissaoAdmin('ERRO SELO:', err);
    }
  );

      } catch (err) {
        logErroPermissaoAdmin('ERRO TOKEN DASH ADMIN:', err);
        setLoading(false);
      }
    };

    iniciarListenersAdmin();

    return () => {
      ativo = false;
      unsubEstabs?.();
      unsubAgends?.();
      unsubStories?.();
      unsubSelo?.();
    };
  }, [adminAuthPronto, adminUid, authUser, logErroPermissaoAdmin]);

  useEffect(() => {
  if (!adminAuthPronto || !adminUid || !authUser) return;

  let ativo = true;
  let unsubNotif: undefined | (() => void);

  const iniciarNotifAdmin = async () => {
    try {
      await authUser.getIdToken();

      if (!ativo) return;

  console.log('🔔 ESCUTANDO NOTIFICAÇÕES ADMIN:', adminUid);

  unsubNotif = firestore()
  .collection('notificacoes')
  .where('adminId', '==', adminUid)
  .where('tipo', '==', 'admin')
  .where('lida', '==', false)
  .where('apagada', '==', false)
  .onSnapshot(
    snap => {
      setNotifNaoLidas(snap?.size || 0);
    },
    err => {
      logErroPermissaoAdmin('ERRO NOTIF:', err);
    }
  );

    } catch (err) {
      logErroPermissaoAdmin('ERRO TOKEN NOTIF ADMIN:', err);
    }
  };

  iniciarNotifAdmin();

  return () => {
    ativo = false;
    unsubNotif?.();
  };

}, [adminAuthPronto, adminUid, authUser, logErroPermissaoAdmin]);
  // ===== HELPERS =====
  // ✅ formatDate declarado ANTES do chartData
 const parseDataBR = (data: any): Date | null => {
  try {
    if (!data) return null;

    if (data?.toDate) {
      return data.toDate();
    }

    if (data instanceof Date) {
      return isNaN(data.getTime()) ? null : data;
    }

    if (typeof data?.seconds === 'number') {
      const d = new Date(data.seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }

    if (typeof data === 'string') {
      const texto = data.trim();

      if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
        const d = new Date(texto);
        return isNaN(d.getTime()) ? null : d;
      }

      const [dia, mes, ano] = texto.split('/').map(Number);

      if (!dia || !mes || !ano) return null;

      const d = new Date(ano, mes - 1, dia);

      if (isNaN(d.getTime())) return null;

      return d;
    }

    return null;
  } catch {
    return null;
  }
};

const formatDate = (date: any): string => {
  const d = parseDataBR(date);

  if (!d) return '';

  return d.toLocaleDateString('pt-BR');
};

const fimAgendamento = (agendamento: Agendamento): Date | null => {
  const inicio = parseDataBR(agendamento.data);

  if (!inicio || typeof agendamento.horario !== 'string') {
    return null;
  }

  const [hora, minuto] = agendamento.horario.split(':').map(Number);

  if (
    !Number.isInteger(hora) ||
    !Number.isInteger(minuto) ||
    hora < 0 ||
    hora > 23 ||
    minuto < 0 ||
    minuto > 59
  ) {
    return null;
  }

  inicio.setHours(hora, minuto, 0, 0);

  const duracao = Number(
    (agendamento as any).servicoDuracaoMin ||
    (agendamento as any).duracao ||
    60
  );

  return new Date(
    inicio.getTime() +
      (duracao > 0 ? duracao : 60) * 60 * 1000
  );
};

  useEffect(() => {
    const timer = setInterval(
      () => setAgoraAgendamentos(Date.now()),
      60 * 1000
    );

    return () => clearInterval(timer);
  }, []);

  const agendamentosVisiveis = agends.filter(a => {
    if (a.status === 'concluido' || a.status === 'cancelado') {
      return false;
    }

    const fim = fimAgendamento(a);

    return !fim || fim.getTime() > agoraAgendamentos;
  });

  const compartilharRelatorio = async () => {
    try {
      const linhas = agends.map(a =>
        `📅 ${a.data} às ${a.horario}\n👤 ${a.clienteNome}\n✂️ ${a.servicoNome}\n💰 R$ ${a.servicoPreco}\n📌 ${a.status?.toUpperCase()}\n`
      ).join('\n─────────────────────\n');

      const receitaConf = agends
        .filter(a => a.status === 'confirmado' || a.status === 'concluido')
        .reduce((acc, a) => acc + (a.servicoPreco || 0), 0);

      const conteudo =
`══════════════════════════
  RELATÓRIO - BeautyHub
══════════════════════════
Admin: ${admin?.nome}
Data: ${new Date().toLocaleDateString('pt-BR')}
Total agendamentos: ${agends.length}
Receita confirmada: R$ ${receitaConf.toLocaleString('pt-BR')}
══════════════════════════

${linhas}

Gerado pelo BeautyHub`;

      await Share.open({
  title: 'Relatório',
  message: conteudo,
});
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        Alert.alert('Erro', 'Não foi possível gerar o relatório.');
      }
    }
  };

  const deletarStory = (id: string) => {
    Alert.alert('Apagar Postagem', 'Deseja excluir este story permanentemente?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => firestore().collection('stories').doc(id).delete() },
    ]);
  };

  // ✅ atualizarStatus usando fetch direto com token (sem SDK functions)
 const atualizarStatus = async (
  id: string,
  novoStatus: 'concluido' | 'cancelado'
) => {
  if (loadingAcao) return;

  try {
    setLoadingAcao({ id, acao: novoStatus });

    const functionsInstance = getFunctions(
      getApp(),
      'southamerica-east1'
    );

    const functionName =
      novoStatus === 'concluido'
        ? 'concluirAgendamento'
        : 'cancelarAgendamento';

    const fn = httpsCallable(functionsInstance, functionName);

    const res = await fn({
      agendamentoId: id,
    });

    setAgends(lista =>
      lista.filter(agendamento => agendamento.id !== id)
    );

    console.log('Resposta função:', res.data);

    Alert.alert(
      'Sucesso ✅',
      novoStatus === 'cancelado'
        ? 'Agendamento cancelado.'
        : 'Agendamento concluído.'
    );

  } catch (e: any) {
    console.log('ERRO FIREBASE:', JSON.stringify(e));

    const code = e?.code || '';
    const message = e?.message || 'Erro interno';

    if (code.includes('failed-precondition')) {
      Alert.alert('Plano necessário 🔒', message);
      return;
    }

    if (code.includes('permission-denied')) {
      Alert.alert('Sem permissão', 'Você não pode fazer isso.');
      return;
    }

    if (code.includes('unauthenticated')) {
      Alert.alert('Sessão expirada', 'Faça login novamente.');
      return;
    }

    if (code.includes('not-found')) {
      Alert.alert('Agendamento não encontrado', 'Esse agendamento não existe mais.');
      return;
    }

    if (code.includes('invalid-argument')) {
      Alert.alert('Erro', 'Dados inválidos enviados.');
      return;
    }

    Alert.alert('Erro', message);

  } finally {
    setLoadingAcao(null);
  }
};
const confirmarPagamentoManual = async (
  agendamentoId: string
) => {
  try {
    const functionsInstance = getFunctions(
      getApp(),
      'southamerica-east1'
    );

    const fn = httpsCallable(
      functionsInstance,
      'confirmarPagamentoManual'
    );

    await fn({
      agendamentoId,
    });

    Alert.alert(
      'Pagamento confirmado ✅',
      'O agendamento foi liberado.'
    );

  } catch (e: any) {
    Alert.alert(
      'Erro',
      e?.message || 'Erro ao confirmar pagamento'
    );
  }
};
const [saindo, setSaindo] = useState(false);
  const handleLogout = () => {
  if (saindo) return;

  Alert.alert(
    'Sair',
    'Deseja sair do painel?',
    [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaindo(true);

            // limpa estados locais antes
            setEstabs([]);
            setAgends([]);
            setMeusStories([]);
            setNotifNaoLidas(0);

            // AuthContext limpa o Firebase Auth e atualiza a navegacao.
            await signOut();

          } catch (e) {
            console.log('ERRO LOGOUT:', e);

            Alert.alert(
              'Erro',
              'Não foi possível sair da conta.'
            );

          } finally {
            setSaindo(false);
          }
        },
      },
    ]
  );
};

  // ✅ chartData usa formatDate que agora está declarado antes
 const chartData = useMemo(() => {
  const labels: string[] = [];
  const valores: number[] = [];
  const hoje = new Date();

  const agendamentosValidos = agends.filter(a =>
    (a.status === 'confirmado' || a.status === 'concluido') &&
    a.data
  );

  if (periodoGrafico === 'dia') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(hoje.getDate() - i);

      labels.push(
        d.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        })
      );

      const total = agendamentosValidos
        .filter(a => {
          const dataAg = parseDataBR(a.data);
          if (!dataAg) return false;

          return (
            dataAg.getDate() === d.getDate() &&
            dataAg.getMonth() === d.getMonth() &&
            dataAg.getFullYear() === d.getFullYear()
          );
        })
        .reduce((acc, a) => acc + Number(a.servicoPreco || 0), 0);

      valores.push(total);
    }
  }

  if (periodoGrafico === 'mes') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(hoje.getMonth() - i);

      labels.push(
        d.toLocaleDateString('pt-BR', {
          month: 'short',
        })
      );

      const total = agendamentosValidos
        .filter(a => {
          const dataAg = parseDataBR(a.data);
          if (!dataAg) return false;

          return (
            dataAg.getMonth() === d.getMonth() &&
            dataAg.getFullYear() === d.getFullYear()
          );
        })
        .reduce((acc, a) => acc + Number(a.servicoPreco || 0), 0);

      valores.push(total);
    }
  }

  if (periodoGrafico === 'ano') {
    for (let i = 4; i >= 0; i--) {
      const ano = hoje.getFullYear() - i;

      labels.push(String(ano));

      const total = agendamentosValidos
        .filter(a => {
          const dataAg = parseDataBR(a.data);
          if (!dataAg) return false;

          return dataAg.getFullYear() === ano;
        })
        .reduce((acc, a) => acc + Number(a.servicoPreco || 0), 0);

      valores.push(total);
    }
  }

  return {
    labels,
    datasets: [
      {
        data: valores.length ? valores : [0],
      },
    ],
    total: valores.reduce((acc, valor) => acc + valor, 0),
  };
}, [agends, periodoGrafico]);

  const safeChartData = useMemo(() => {
  const dados = chartData?.datasets?.[0]?.data || [];

  if (!dados.length) {
    return {
      labels: ['-'],
      datasets: [{ data: [0] }],
    };
  }

  return chartData;
}, [chartData]);

  const planoBadge = () => {
  if (!temEstabelecimento) {
    return { label: 'COMEÇAR GRÁTIS', cor: GOLD, bg: 'rgba(201,169,110,0.12)' };
  }

  if (!planoAtual) {
    return { label: 'SEM PLANO', cor: '#999', bg: 'rgba(0,0,0,0.05)' };
  }

  if (planoAtual === 'trial') {
    let dias = diasRestantes ?? 7;
    if (dias > 7) dias = 7;
    if (dias < 0) dias = 0;

    const expirado = dias <= 0;

    return {
      label: expirado
        ? 'TRIAL ENCERRADO'
        : `${dias} ${dias === 1 ? 'DIA' : 'DIAS'} DE TESTE`,
      cor: expirado ? '#FF3B30' : '#FF9800',
      bg: expirado ? 'rgba(255,59,48,0.12)' : 'rgba(255,152,0,0.12)',
    };
  }

  const nomes: Record<string, string> = {
    free: 'PLANO FREE',
    essencial: 'PLANO ESSENCIAL',
    pro: 'PLANO PRO',
    elite: 'PLANO ELITE',
  };

  const nomePlano = nomes[planoAtual] || 'PLANO';

  if (!assinaturaAtiva) {
    return {
      label: `${nomePlano} (INATIVO)`,
      cor: '#FF3B30',
      bg: 'rgba(255,59,48,0.12)',
    };
  }

  return {
    label: nomePlano,
    cor:
      planoAtual === 'elite'
        ? '#9C27B0'
        : planoAtual === 'pro'
        ? GOLD
        : '#4CAF50',
    bg: 'rgba(100,100,100,0.1)',
  };
};

  const seloInfo = () => {
    if (verificado) return { titulo: 'Selo Verificado Ativo', sub: 'Seu estabelecimento é verificado', cor: '#4CAF50', emoji: '✅' };
    if (solicitacaoStatus === 'pendente') return { titulo: 'Solicitação em Análise', sub: 'Aguardando aprovação do BeautyHub', cor: '#FF9800', emoji: '⏳' };
    if (solicitacaoStatus === 'rejeitado') return { titulo: 'Solicitação Rejeitada', sub: 'Verifique os critérios e tente novamente', cor: '#F44336', emoji: '❌' };
    if (planoAtual === 'elite') return { titulo: 'Selo Elite Automático', sub: 'Incluído no seu plano Elite', cor: '#9C27B0', emoji: '👑' };
    return { titulo: 'Obter Selo Verificado', sub: 'Plano Pro — solicite o selo por R$ 14,90', cor: GOLD, emoji: '⭐' };
  };

 const badge = planoBadge();
const selo = seloInfo();
const mostrarCardSelo = planoAtual === 'pro' || planoAtual === 'elite';

const temSelo =
  verificado === true ||
  planoAtual === 'elite';

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      <View style={s.header}>
        <View>
          <Text style={s.headerSub}>PAINEL ADMINISTRATIVO</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={s.headerTitulo}>Olá, {admin?.nome?.split(' ')[0]}</Text>
          {temSelo && (
  <Image
    source={SeloVerificado}
    style={{
      width: 20,
      height: 20,
      resizeMode: 'contain',
    }}
  />
)}
          </View>
        </View>
        <View style={s.headerAcoes}>
          <TouchableOpacity onPress={() => navigation.navigate('AdminNotif')} style={s.sinoBtn}>
            <Text style={s.sinoIcon}>🔔</Text>
            {notifNaoLidas > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{notifNaoLidas}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={s.sairBtn}>
            <Text style={s.sairText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ABAS */}
      <View style={s.abasContainer}>
        <View style={s.abasInner}>
          {([['dash', '📊 Dash'], ['agends', '📅 Agenda'], ['stories', '🎬 Posts'], ['estabs', '🏪 Locais']] as [string, string][])
            .map(([k, l]) => (
              <TouchableOpacity
                key={k}
                onPress={() => mudarAba(k as any)}
                style={[
                  s.aba,
                  aba === k && s.abaAtiva,
                  (isBloqueado && k !== 'dash') && { opacity: 0.3 }
                ]}
              >
                <Text style={[s.abaText, aba === k && s.abaTextAtiva]}>{l}</Text>
              </TouchableOpacity>
            ))}
        </View>
      </View>

      {/* ─── ABA DASH ─── */}
      {aba === 'dash' && (
        <ScrollView contentContainerStyle={s.lista} showsVerticalScrollIndicator={false}>

          <TouchableOpacity
  style={[s.planoCard, { borderColor: badge.cor, backgroundColor: badge.bg }]}
  onPress={async () => {

  if (!planoAtual && temEstabelecimento) {
    try {
      setLoading(true);

      const estabelecimentoId = principal?.id;

      const fn = httpsCallable(
  getFunctions(getApp(), 'southamerica-east1'),
  'iniciarTrial'
);

      const res = await fn({ estabelecimentoId });

      console.log('TRIAL:', res.data);

      Alert.alert('Sucesso 🚀', 'Seu período de teste foi ativado!');

    } catch (e: any) {
      console.error(e);

      if (e?.code?.includes('failed-precondition')) {
        Alert.alert('Trial já usado', e?.message);
      } else {
        Alert.alert('Erro', e?.message || 'Erro ao ativar trial');
      }
    } finally {
      setLoading(false);
    }

    return;
  }

  navigation.navigate('Assinatura');
}}
>
            <View style={s.planoCardLeft}>
              <View style={[s.planoBadge, { backgroundColor: badge.cor }]}>
                <Text style={s.planoBadgeText}>{badge.label}</Text>
              </View>
              <View style={{ marginLeft: 12 }}>
          <Text style={s.planoCardTitulo}>
  {
    loading
      ? 'Carregando informações...'
      : !temEstabelecimento
      ? 'Crie seu primeiro estabelecimento'
      : semPlano || planoFree
      ? 'Comece seus 7 dias grátis'
      : trialExpirado
      ? 'Trial expirado'
      : !assinaturaAtiva && planoAtual !== 'trial'
      ? 'Assinatura expirada'
      : `Plano ${(planoAtual ?? '').toUpperCase()}`
  }
</Text>
    <Text style={s.planoCardSub}>
  {
    loading
      ? 'Aguarde...'
      : !temEstabelecimento
      ? 'Crie um estabelecimento para começar.'
      : semPlano || planoFree
      ? 'Ative seu período de teste grátis ou escolha um plano.'
      : trialAtivo
      ? `Você tem ${diasRestantes} dias restantes.`
      : trialExpirado
      ? 'Seu período de teste terminou. Ative um plano.'
      : !assinaturaAtiva
      ? 'Sua assinatura expirou.'
      : 'Plano ativo.'
  }
</Text>
              </View>
            </View>
           <Text style={{ color: badge.cor, fontSize: 18, fontWeight: 'bold' }}>→</Text>
</TouchableOpacity>

{isBloqueado ? (
  <View style={s.dashBloqueadoCard}>
    <Text style={s.dashBloqueadoTitulo}>Painel bloqueado</Text>
    <Text style={s.dashBloqueadoTexto}>
      {trialExpirado
        ? 'Seu periodo de teste terminou. Ative um plano para liberar o painel.'
        : planoPagoExpirado
        ? 'Sua assinatura expirou. Renove o plano para liberar o painel.'
        : 'Ative seu periodo de teste ou plano para liberar o painel.'}
    </Text>
    <TouchableOpacity
      style={s.dashBloqueadoBtn}
      activeOpacity={0.86}
      onPress={() => navigation.navigate('Assinatura')}
    >
      <Text style={s.dashBloqueadoBtnText}>Ver planos</Text>
    </TouchableOpacity>
  </View>
) : (
  <>
{/* BOTÃO SELO VERIFICADO */}
{temEstabelecimento && (
  <TouchableOpacity
    style={s.seloVerificacaoBtn}
    activeOpacity={0.85}
    onPress={() => navigation.navigate('SeloVerificacaoScreen')}
  >
    <View style={s.seloVerificacaoIcon}>
      <Image
        source={SeloVerificado}
        style={{
          width: 30,
          height: 30,
          resizeMode: 'contain',
        }}
      />
    </View>

    <View style={{ flex: 1 }}>
      <Text style={s.seloVerificacaoTitulo}>
        {verificado
          ? 'Seu selo está ativo'
          : 'Solicitar selo verificado'}
      </Text>

      <Text style={s.seloVerificacaoSub}>
        {verificado
          ? 'Seu estabelecimento possui selo verificado.'
          : 'Aumente sua credibilidade no BeautyHub'}
      </Text>
    </View>

    <Text style={s.seloVerificacaoArrow}>→</Text>
  </TouchableOpacity>
)}
 {/* BOTÃO IMPULSIONAR */}
{temEstabelecimento && (
  <TouchableOpacity
    style={s.impulsionarBtn}
    activeOpacity={0.85}
    onPress={() =>
      navigation.navigate('ImpulsionarScreen', {
        estabelecimentoId: principal?.id,
      })
    }
  >
    <View style={s.impulsionarIcon}>
      <Text style={{ fontSize: 26 }}>🚀</Text>
    </View>

    <View style={{ flex: 1 }}>
      <Text style={s.impulsionarTitulo}>
        Impulsionar estabelecimento
      </Text>

      <Text style={s.impulsionarSub}>
        Coloque seu espaço em destaque para mais clientes
      </Text>
    </View>

    <Text style={s.impulsionarArrow}>→</Text>
  </TouchableOpacity>
)}
{temEstabelecimento && (
  <TouchableOpacity
    style={s.simulacaoBtn}
    activeOpacity={0.85}
    onPress={() =>
      navigation.navigate('SimulacaoDivulgacaoScreen', {
        estabelecimentoId: principal?.id,
        estabelecimentoNome: principal?.nome,
      })
    }
  >
    <View style={s.simulacaoIcon}>
      <Text style={{ fontSize: 24, color: GOLD, fontWeight: '900' }}>Play</Text>
    </View>

    <View style={{ flex: 1 }}>
      <Text style={s.simulacaoTitulo}>
        Simular divulgacao e agendamento
      </Text>

      <Text style={s.simulacaoSub}>
        Veja como o cliente encontra seu espaco e marca horario
      </Text>
    </View>

    <Text style={s.simulacaoArrow}>{'>'}</Text>
  </TouchableOpacity>
)}
          {/* FATURAMENTO */}
          <View style={s.financeiroCardDash}>
            <Text style={s.financeiroTitulo}>RESUMO DE FATURAMENTO</Text>
            <View style={s.periodoRow}>
              {['dia', 'semana', 'mes'].map((p) => {
                const hoje = new Date();
                const valor = agends
                  .filter(a => (a.status === 'concluido' || a.status === 'confirmado') && a.data)
                  .filter(a => {
                    try {
                      if (!a.data || typeof a.data !== 'string') return false;
                      const parts = formatDate(a.data).split('/');
                      if (parts.length !== 3) return false;
                      const dAgend = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                      if (isNaN(dAgend.getTime())) return false;
                      const diff = (hoje.getTime() - dAgend.getTime()) / (1000 * 60 * 60 * 24);
                      return p === 'dia' ? diff <= 1 : p === 'semana' ? diff <= 7 : diff <= 30;
                    } catch {
                      return false;
                    }
                  })
                  .reduce((acc, curr) => acc + (curr.servicoPreco || 0), 0);
                return (
                  <View key={p} style={s.periodoItem}>
                    <Text style={s.periodoLabel}>{p === 'dia' ? 'HOJE' : p === 'semana' ? '7 DIAS' : '30 DIAS'}</Text>
                    <Text style={s.periodoValor}>R$ {valor.toLocaleString('pt-BR')}</Text>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
  style={s.btnRelatorioFaturamento}
  activeOpacity={0.8}
  onPress={() => {
    if (planoAtual !== 'pro' && planoAtual !== 'elite') {
      Alert.alert(
        'Recurso Pro',
        'Relatórios financeiros profissionais estão disponíveis nos planos Pro e Elite.'
      );
      return;
    }

    navigation.navigate('RelatorioFinanceiroScreen', {
      estabelecimentoId: principal?.id,
    });
  }}
>
  <Text style={s.btnRelatorioFaturamentoText}>
    📊 Relatório financeiro profissional
  </Text>
</TouchableOpacity>
          </View>

          {/* GRÁFICO PROFISSIONAL */}
<View style={s.chartWrapper}>
  <View style={s.chartHeader}>
    <View>
      <Text style={s.chartTitle}>
        Faturamento
      </Text>

      <Text style={s.chartSub}>
        Visão por {periodoGrafico === 'dia'
          ? 'dia'
          : periodoGrafico === 'mes'
          ? 'mês'
          : 'ano'}
      </Text>
    </View>

    <Text style={s.chartTotal}>
      R$ {chartData.total.toLocaleString('pt-BR')}
    </Text>
  </View>

  <View style={s.periodoGraficoRow}>
    {[
      { k: 'dia', l: 'Dia' },
      { k: 'mes', l: 'Mês' },
      { k: 'ano', l: 'Ano' },
    ].map(p => (
      <TouchableOpacity
        key={p.k}
        onPress={() => setPeriodoGrafico(p.k as any)}
        style={[
          s.periodoGraficoBtn,
          periodoGrafico === p.k && s.periodoGraficoBtnAtivo,
        ]}
      >
        <Text
          style={[
            s.periodoGraficoText,
            periodoGrafico === p.k && s.periodoGraficoTextAtivo,
          ]}
        >
          {p.l}
        </Text>
      </TouchableOpacity>
    ))}
  </View>

  <BarChart
    data={safeChartData}
    width={width - 40}
    height={230}
    yAxisLabel="R$"
    yAxisSuffix=""
    chartConfig={chartConfig}
    fromZero
    showBarTops={false}
    showValuesOnTopOfBars
    withInnerLines
    segments={4}
    style={s.chartStyle}
  />
</View>

          {/* POSTAR STORY COM BLOQUEIO */}
          <TouchableOpacity
            style={[s.storyBtnPremium, isBloqueado && { opacity: 0.6 }]}
            activeOpacity={0.8}
            onPress={() => {
  if (isBloqueado) {
    Alert.alert('Recurso Bloqueado 📸', 'Ative seu período de teste ou plano.');
  } else {
    navigation.navigate('PostarStory');
  }
}}
          >
            <View style={[s.storyGradientBorder, isBloqueado && { backgroundColor: '#666' }]}>
              <View style={s.storyIconInner}>
                <Text style={s.storyEmoji}>{isBloqueado ? '🔒' : '📸'}</Text>
              </View>
            </View>
            <View style={s.storyTextContent}>
              <Text style={s.storyTitlePremium}>Postar novo Story</Text>
              <Text style={s.storySubPremium}>
  {isBloqueado
    ? 'Ative seu plano para liberar'
    : planoAtual === 'essencial'
    ? 'Seu plano permite stories com foto'
    : planoAtual === 'pro'
    ? 'Foto e vídeo até 15 segundos'
    : planoAtual === 'elite'
    ? 'Foto e vídeo até 30 segundos'
    : planoAtual === 'trial'
    ? 'Teste liberado: foto e vídeo até 15s'
    : 'Divulgue novidades para os clientes'}
</Text>
            </View>
            {!isBloqueado && (
              <View style={s.storyBadgeNovo}><Text style={s.storyBadgeNovoText}>NOVO</Text></View>
            )}
          </TouchableOpacity>

          {/* STATS */}
          <View style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: '#1A1A1A' }]}>
              <Text style={s.statIc}>❤️</Text>
              <Text style={[s.statV, { color: '#FFF' }]}>{totalLikes}</Text>
              <Text style={s.statL}>Curtidas</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statIc}>📅</Text>
              <Text style={s.statV}>{agends.length}</Text>
              <Text style={s.statL}>Total Agend.</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statIc}>📉</Text>
              <Text style={s.statV}>{estabs.reduce((a, e) => a + (e.avaliacoesNegativas || 0), 0)}</Text>
              <Text style={s.statL}>Negativas</Text>
            </View>
          </View>
		  {/* BOTÃO CONTA BANCÁRIA */}
<TouchableOpacity
  style={s.contaBancariaBtn}
  activeOpacity={0.85}
  onPress={() =>
  navigation.navigate('ContaBancariaScreen', {
    estabelecimentoId: principal?.id,
  })
}
>
  <View style={s.contaBancariaIcon}>
    <Text style={{ fontSize: 22 }}>🏦</Text>
  </View>

  <View style={{ flex: 1 }}>
    <Text style={s.contaBancariaTitulo}>
      Cadastrar Conta Bancária
    </Text>

    <Text style={s.contaBancariaSub}>
      Preencha os dados para recebimentos e saques
    </Text>
  </View>

  <Text style={s.contaBancariaArrow}>→</Text>
</TouchableOpacity>
  </>
)}

{/* CARD SUPORTE */}
<View style={s.suporteCard}>

  <View style={s.suporteLogo}>
    <Text style={s.suporteLogoText}>BH</Text>
  </View>

  <Text style={s.suporteTitulo}>
    Suporte Administrativo
  </Text>

  <Text style={s.suporteTexto}>
    Em caso de dúvidas, problemas técnicos, pagamentos,
    verificação ou suporte da plataforma,
    entre em contato diretamente com o suporte oficial.
  </Text>

  <View style={s.suporteInfos}>
    <Text style={s.suporteInfo}>📧 suporte@beautyhub.com</Text>
    <Text style={s.suporteInfo}>🕐 Atendimento: 08h às 22h</Text>
  </View>

  <TouchableOpacity
    style={s.whatsBtn}
    activeOpacity={0.85}
    onPress={() => {
      Linking.openURL(
        'https://wa.me/5588997839664?text=Olá,%20preciso%20de%20suporte%20no%20BeautyHub'
      );
    }}
  >
    <Text style={s.whatsBtnText}>
      💬 Falar com Suporte
    </Text>
  </TouchableOpacity>
</View>
        </ScrollView>
      )}

      {/* ─── ABA STORIES ─── */}
      {aba === 'stories' && (
        <FlatList
          data={meusStories}
          keyExtractor={item => item.id}
          contentContainerStyle={s.lista}
          ListHeaderComponent={<Text style={s.secTitulo}>Gerenciar Postagens</Text>}
          renderItem={({ item }) => (
            <View style={s.storyManageCard}>
              <TouchableOpacity
                style={s.storyPreviewAction}
                activeOpacity={0.86}
                onPress={() => abrirStoryAdmin(item.id)}
              >
              <Image source={{ uri: item.url || item.imagem }} style={s.storyMiniatura} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.storyInfoText}>
  {item?.timestamp?.seconds
    ? new Date(item.timestamp.seconds * 1000).toLocaleDateString('pt-BR')
    : 'Sem data'}
</Text>
                <Text style={s.storyInfoSub}>❤️ {item.likesCount || 0} curtidas  •  👁️ {item.views || 0} views</Text>
                <Text style={s.storyInfoHint}>Toque para ver o story</Text>
              </View>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnLixo} onPress={() => deletarStory(item.id)}>
                <Text style={{ fontSize: 18 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={s.emptyText}>Você ainda não postou stories.</Text>}
        />
      )}

      {/* ─── ABA AGENDAMENTOS ─── */}
    {aba === 'agends' && (
  <FlatList
    data={agendamentosVisiveis}
    keyExtractor={a => a.id}
    contentContainerStyle={s.lista}
    ListHeaderComponent={
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15
      }}>
        <Text style={[s.secTitulo, { marginBottom: 0 }]}>
          Gerenciar Agendamentos
        </Text>

        <TouchableOpacity
          style={s.btnPdf}
          onPress={compartilharRelatorio}
        >
          <Text style={s.btnPdfText}>📄 PDF</Text>
        </TouchableOpacity>
      </View>
    }
    renderItem={({ item }) => (
      <View style={s.agendCard}>
              <View style={s.agendTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.agendNome}>{item.clienteNome}</Text>
                  <Text style={s.agendSub}>{item.servicoNome} • {item.estabelecimentoNome}</Text>
                  <Text style={s.agendData}>{item.data} às {item.horario}</Text>
                </View>
                <Text style={s.agendPreco}>R$ {item.servicoPreco}</Text>
              </View>
              <View
  style={[
    s.statusBadge,
    item.status === 'confirmado'
      ? s.bgConfirmado
      : item.status === 'cancelado'
      ? s.bgCancelado
      : s.bgConcluido,
  ]}
>
  <Text
    style={[
      s.statusText,
      item.status === 'confirmado'
        ? s.txtConfirmado
        : item.status === 'cancelado'
        ? s.txtCancelado
        : s.txtConcluido,
    ]}
  >
    {item.status?.toUpperCase()}
  </Text>
</View>

{/* ✅ NOVO BOTÃO */}
{item.formaPagamento === 'app' &&
  item.status === 'aguardando_pagamento' &&
  item.statusPagamento !== 'approved' && (
    <TouchableOpacity
      style={s.btnConfirmarPagamento}
      onPress={() =>
        confirmarPagamentoManual(item.id)
      }
    >
      <Text style={s.btnConfirmarPagamentoText}>
        ✅ Confirmar pagamento
      </Text>
    </TouchableOpacity>
)}

{item.status === 'confirmado' && (
  <View style={s.acoesWrap}>

    {/* CONCLUIR */}
    <TouchableOpacity
  style={s.btnConcluir}
  disabled={loadingAcao?.id === item.id}
  onPress={() => atualizarStatus(item.id, 'concluido')}
>
  {loadingAcao?.id === item.id && loadingAcao?.acao === 'concluido' ? (
    <ActivityIndicator color={GOLD} />
  ) : (
    <Text style={s.btnConcluirText}>Concluir</Text>
  )}
</TouchableOpacity>

<TouchableOpacity
  style={s.btnCancelar}
  disabled={loadingAcao?.id === item.id}
  onPress={() => atualizarStatus(item.id, 'cancelado')}
>
  {loadingAcao?.id === item.id && loadingAcao?.acao === 'cancelado' ? (
    <ActivityIndicator color="#999" />
  ) : (
    <Text style={s.btnCancelarText}>Cancelar</Text>
  )}
</TouchableOpacity>

  </View>
)}
            </View>
          )}
        />
      )}

      {/* ─── ABA ESTABELECIMENTOS ─── */}
      {aba === 'estabs' && (
        <FlatList
          data={estabs}
          keyExtractor={e => e.id}
          contentContainerStyle={s.lista}
          ListHeaderComponent={
            <TouchableOpacity
              style={s.novoBtn}
              onPress={() => {
  if (!temEstabelecimento) {
    navigation.navigate('AdminEstab', { estabelecimentoId: 'novo' });
    return;
  }

  if (isBloqueado) {
    Alert.alert('Plano necessário', 'Ative seu plano ou trial para continuar.');
    return;
  }

  const limitePorPlano: Record<string, number> = {
  free: 1,
  trial: 2,
  essencial: 2,
  pro: 5,
  elite: Infinity,
};

  const limite = limitePorPlano[planoAtual || 'free'] ?? 0;

  if (estabs.length >= limite) {
  Alert.alert(
    'Limite atingido',
    `Seu plano permite apenas ${limite} estabelecimento(s).`
  );
  return;
}

navigation.navigate('AdminEstab', { estabelecimentoId: 'novo' });

}}
            >
              <Text style={s.novoBtnText}>+ Novo Estabelecimento</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.estabCard, { borderLeftColor: item.cor || GOLD }]}
              onPress={() => navigation.navigate('AdminEstab', { estabelecimentoId: item.id })}
            >
              <EstabImage item={item} />
              <View style={s.estabInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.estabNome}>{item.nome}</Text>
                  {(item as any).verificado && (
                    <Image source={SeloVerificado} style={{ width: 14, height: 14, resizeMode: 'contain' }} />
                  )}
                </View>
                <Text style={s.estabTipo}>{item.tipo} • ⭐ {item.avaliacao?.toFixed(1)}</Text>
              </View>
              <Text style={s.arrow}>﹥</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB - ASSINAR/UPGRADE */}
      {(planoAtual !== 'pro' && planoAtual !== 'elite') && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => navigation.navigate('Assinatura')}
          activeOpacity={0.88}
        >
          <View style={s.fabGlow} />
          <Text style={s.fabIcon}>{planoAtual === 'essencial' ? '🚀' : '⭐'}</Text>
          <View>
            <Text style={s.fabText}>
              {planoAtual === 'essencial' ? 'Fazer upgrade' : 'Assinar agora'}
            </Text>
            <Text style={s.fabSub}>
              {planoAtual === 'essencial' ? 'Desbloqueie recursos Pro e Elite' : 'Apareça para mais clientes'}
            </Text>
          </View>
          <Text style={s.fabArrow}>→</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const chartConfig = {
  backgroundGradientFrom: '#1A1A1A',
  backgroundGradientTo: '#1A1A1A',

  color: (opacity = 1) =>
    `rgba(201, 169, 110, ${opacity})`,

  labelColor: (opacity = 1) =>
    `rgba(255, 255, 255, ${opacity * 0.55})`,

  decimalPlaces: 0,

  propsForDots: {
    r: '4',
    strokeWidth: '2',
    stroke: GOLD,
  },

  propsForBackgroundLines: {
    stroke: 'rgba(255,255,255,0.06)',
  },

  formatTopBarValue: (valor: number) =>
    Number(valor || 0).toLocaleString('pt-BR'),

  barPercentage: 0.65,
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  header: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 16 : 60,
    paddingBottom: 25,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  chartSub: {
  color: '#777',
  fontSize: 11,
  marginTop: 3,
  fontWeight: '600',
},

periodoGraficoRow: {
  flexDirection: 'row',
  backgroundColor: '#0D0D0D',
  borderRadius: 14,
  padding: 4,
  marginBottom: 16,
},

periodoGraficoBtn: {
  flex: 1,
  paddingVertical: 9,
  borderRadius: 11,
  alignItems: 'center',
},

periodoGraficoBtnAtivo: {
  backgroundColor: GOLD,
},

periodoGraficoText: {
  color: '#777',
  fontSize: 12,
  fontWeight: '800',
},

periodoGraficoTextAtivo: {
  color: '#000',
},
  seloVerificacaoBtn: {
  backgroundColor: '#1A1A1A',
  borderRadius: 22,
  padding: 18,
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 20,
  borderWidth: 1,
  borderColor: 'rgba(201,169,110,0.25)',
},
impulsionarBtn: {
  backgroundColor: '#1A1A1A',
  borderRadius: 22,
  padding: 18,
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 20,
  borderWidth: 1,
  borderColor: 'rgba(201,169,110,0.25)',
},

impulsionarIcon: {
  width: 58,
  height: 58,
  borderRadius: 18,
  backgroundColor: 'rgba(201,169,110,0.12)',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 16,
},

impulsionarTitulo: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '800',
},

impulsionarSub: {
  color: '#AAA',
  fontSize: 12,
  marginTop: 4,
  lineHeight: 18,
},

impulsionarArrow: {
  color: GOLD,
  fontSize: 22,
  fontWeight: '800',
},
simulacaoBtn: {
  backgroundColor: '#101010',
  borderRadius: 22,
  padding: 18,
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 20,
  borderWidth: 1,
  borderColor: 'rgba(76,175,80,0.28)',
},

simulacaoIcon: {
  width: 58,
  height: 58,
  borderRadius: 18,
  backgroundColor: 'rgba(76,175,80,0.12)',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 16,
},

simulacaoTitulo: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '800',
},

simulacaoSub: {
  color: '#AAA',
  fontSize: 12,
  marginTop: 4,
  lineHeight: 18,
},

simulacaoArrow: {
  color: '#8BE28F',
  fontSize: 22,
  fontWeight: '800',
},
seloVerificacaoIcon: {
  width: 58,
  height: 58,
  borderRadius: 18,
  backgroundColor: 'rgba(201,169,110,0.12)',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 16,
},

seloVerificacaoTitulo: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '800',
},

seloVerificacaoSub: {
  color: '#AAA',
  fontSize: 12,
  marginTop: 4,
  lineHeight: 18,
},

seloVerificacaoArrow: {
  color: GOLD,
  fontSize: 22,
  fontWeight: '800',
},
  headerSub: { color: GOLD, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  headerTitulo: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  headerAcoes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sinoBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  sinoIcon: { fontSize: 20 },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#FF3B30', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1A1A1A' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  sairBtn: { backgroundColor: 'rgba(201,169,110,0.15)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  sairText: { color: GOLD, fontSize: 13, fontWeight: '700' },
  abasContainer: { marginTop: -20, paddingHorizontal: 20 },
  abasInner: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 6, elevation: 4 },
  aba: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  abaAtiva: { backgroundColor: '#1A1A1A' },
  abaText: { color: '#999', fontSize: 13, fontWeight: '600' },
  abaTextAtiva: { color: GOLD, fontWeight: '800' },
  lista: { padding: 20, paddingBottom: 120 },
  planoCard: { borderRadius: 18, borderWidth: 1.5, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  planoCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  planoBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  planoBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  planoCardTitulo: { color: '#1A1A1A', fontSize: 13, fontWeight: '700' },
  planoCardSub: { color: '#888', fontSize: 11, marginTop: 2, maxWidth: 180 },
  dashBloqueadoCard: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: '#FFE0E0', padding: 18, marginBottom: 16 },
  dashBloqueadoTitulo: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  dashBloqueadoTexto: { color: '#777', fontSize: 13, lineHeight: 19, marginTop: 6 },
  dashBloqueadoBtn: { alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, marginTop: 14 },
  dashBloqueadoBtnText: { color: GOLD, fontSize: 13, fontWeight: '800' },
  upgradePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  upgradePillText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  seloCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, elevation: 2, borderLeftWidth: 4 },
  seloEmoji: { fontSize: 28 },
  seloTitulo: { color: '#1A1A1A', fontSize: 14, fontWeight: '700' },
  seloSub: { color: '#888', fontSize: 11, marginTop: 2 },
financeiroCardDash: {
  backgroundColor: '#FFF',
  borderRadius: 18,
  padding: 20,
  marginBottom: 20,

  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 10,
  elevation: 3,
},
  financeiroTitulo: { color: '#AAA', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 15, textAlign: 'center' },
  periodoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  periodoItem: { alignItems: 'center', flex: 1 },
  periodoLabel: { color: GOLD, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  periodoValor: { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },
  btnRelatorioFaturamento: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 15, alignItems: 'center', backgroundColor: 'rgba(201,169,110,0.08)', borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(201,169,110,0.25)' },
  btnRelatorioFaturamentoText: { color: GOLD, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  chartWrapper: { backgroundColor: '#1A1A1A', borderRadius: 24, padding: 20, marginBottom: 20 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
  chartTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  chartTotal: { color: GOLD, fontSize: 14, fontWeight: '600' },
  chartStyle: { marginLeft: -20, borderRadius: 16 },
  storyBtnPremium: { backgroundColor: '#1A1A1A', borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  storyGradientBorder: { width: 58, height: 58, borderRadius: 29, padding: 3, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  storyIconInner: { width: '100%', height: '100%', borderRadius: 29, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  storyEmoji: { fontSize: 24 },
  storyTextContent: { flex: 1 },
  storyTitlePremium: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  storySubPremium: { color: GOLD, fontSize: 12, opacity: 0.8 },
  storyBadgeNovo: { backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, position: 'absolute', top: 12, right: 12 },
  storyBadgeNovoText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 18, padding: 12, alignItems: 'center', elevation: 2 },
  statIc: { fontSize: 18, marginBottom: 4 },
  statV: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  statL: { color: '#AAA', fontSize: 9, fontWeight: '600' },
  secTitulo: { color: '#1A1A1A', fontSize: 18, fontWeight: '800', marginBottom: 15 },
  storyManageCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 10, elevation: 1 },
  storyPreviewAction: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  storyMiniatura: { width: 50, height: 70, borderRadius: 10, backgroundColor: '#EEE' },
  storyInfoText: { color: '#1A1A1A', fontSize: 14, fontWeight: '700' },
  storyInfoSub: { color: GOLD, fontSize: 12, fontWeight: '600', marginTop: 4 },
  storyInfoHint: { color: '#666', fontSize: 11, fontWeight: '600', marginTop: 4 },
  btnLixo: { backgroundColor: '#FFF0F0', width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#AAA', marginTop: 30, fontSize: 14 },
  agendCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 12 },
  agendTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  agendNome: { color: '#1A1A1A', fontSize: 15, fontWeight: '700' },
  agendSub: { color: '#777', fontSize: 12 },
  agendData: { color: GOLD, fontSize: 12, fontWeight: '600' },
  agendPreco: { color: '#1A1A1A', fontSize: 17, fontWeight: '800' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  bgConfirmado: { backgroundColor: '#E8F5E9' }, txtConfirmado: { color: '#2E7D32' },
  bgCancelado: { backgroundColor: '#FFEBEE' }, txtCancelado: { color: '#C62828' },
  bgConcluido: { backgroundColor: '#E3F2FD' }, txtConcluido: { color: '#1565C0' },
  acoesWrap: { flexDirection: 'row', gap: 10, marginTop: 15, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 15 },
  btnConcluir: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, alignItems: 'center' },
  btnConcluirText: { color: GOLD, fontSize: 13, fontWeight: '700' },
  btnCancelar: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 12, alignItems: 'center' },
  btnCancelarText: { color: '#999', fontSize: 13, fontWeight: '700' },
  btnConfirmarPagamento: {
  marginTop: 14,
  backgroundColor: '#25D366',
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: 'center',
},

btnConfirmarPagamentoText: {
  color: '#FFF',
  fontSize: 14,
  fontWeight: '800',
},
  novoBtn: { backgroundColor: GOLD, borderRadius: 16, padding: 18, alignItems: 'center', marginVertical: 20 },
  novoBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },
  estabCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 15, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 6 },
  estabInfo: { flex: 1 },
  estabNome: { color: '#1A1A1A', fontSize: 16, fontWeight: '700' },
  estabTipo: { color: '#888', fontSize: 13 },
  arrow: { color: '#DDD', fontSize: 20 },
  estabFoto: { width: 50, height: 50, borderRadius: 14, marginRight: 15 },
  estabIcon: { borderRadius: 14, width: 50, height: 50, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  estabEmoji: { fontSize: 24 },
  fab: { position: 'absolute', bottom: 28, left: 20, right: 20, backgroundColor: '#1A1A1A', borderRadius: 22, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 16, shadowColor: GOLD, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 20, borderWidth: 1.5, borderColor: GOLD },
  fabGlow: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(201,169,110,0.3)' },
  fabIcon: { fontSize: 22 },
  fabText: { color: GOLD, fontWeight: '900', fontSize: 15, letterSpacing: 0.4 },
  fabSub: { color: 'rgba(201,169,110,0.6)', fontSize: 10, fontWeight: '600', marginTop: 1 },
  fabArrow: { color: GOLD, fontSize: 20, fontWeight: '800', marginLeft: 'auto' },
  btnPdf: { backgroundColor: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: GOLD },
  btnPdfText: { color: GOLD, fontSize: 12, fontWeight: '800' },
contaBancariaBtn: {
  backgroundColor: '#1A1A1A',
  borderRadius: 22,
  padding: 18,
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 22,
  marginBottom: 18,
  borderWidth: 1,
  borderColor: 'rgba(201,169,110,0.25)',
},

contaBancariaIcon: {
  width: 58,
  height: 58,
  borderRadius: 18,
  backgroundColor: 'rgba(201,169,110,0.12)',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 16,
},

contaBancariaTitulo: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '800',
},

contaBancariaSub: {
  color: '#AAA',
  fontSize: 12,
  marginTop: 4,
  lineHeight: 18,
},

contaBancariaArrow: {
  color: GOLD,
  fontSize: 22,
  fontWeight: '800',
},

suporteCard: {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 24,
  marginBottom: 120,

  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 10,
  elevation: 3,
},

suporteLogo: {
  width: 72,
  height: 72,
  borderRadius: 24,
  backgroundColor: '#1A1A1A',
  justifyContent: 'center',
  alignItems: 'center',
  alignSelf: 'center',
  marginBottom: 18,
  borderWidth: 2,
  borderColor: GOLD,
},

suporteLogoText: {
  color: GOLD,
  fontSize: 24,
  fontWeight: '900',
},

suporteTitulo: {
  color: '#1A1A1A',
  fontSize: 18,
  fontWeight: '800',
  textAlign: 'center',
  marginBottom: 10,
},

suporteTexto: {
  color: '#666',
  fontSize: 13,
  textAlign: 'center',
  lineHeight: 22,
},

suporteInfos: {
  marginTop: 18,
  gap: 8,
},

suporteInfo: {
  color: '#444',
  fontSize: 13,
  fontWeight: '600',
  textAlign: 'center',
},

whatsBtn: {
  backgroundColor: '#25D366',
  borderRadius: 18,
  paddingVertical: 16,
  marginTop: 22,
  justifyContent: 'center',
  alignItems: 'center',
},

whatsBtnText: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '800',
},
});
