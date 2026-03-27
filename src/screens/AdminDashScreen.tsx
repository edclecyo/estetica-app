import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Dimensions, StatusBar, Image, ScrollView
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { BarChart } from 'react-native-chart-kit';
import type { Estabelecimento, Agendamento } from '../types';

const { width } = Dimensions.get('window');

const EstabImage = ({ item }: { item: Estabelecimento }) => {
  const [imgErro, setImgErro] = useState(false);
  const uri = item.fotoPerfil || item.img;
  const isUrl = typeof uri === 'string' && uri.startsWith('http');

  if (isUrl && !imgErro) {
    return <Image source={{ uri }} style={s.estabFoto} onError={() => setImgErro(true)} />;
  }
  return (
    <View style={[s.estabIcon, { backgroundColor: (item.cor || '#C9A96E') + '15' }]}>
      <Text style={s.estabEmoji}>{(!isUrl ? item.img : null) || '🏪'}</Text>
    </View>
  );
};

export default function AdminDashScreen() {
  const navigation = useNavigation<any>();
  const { admin, signOut } = useAuth();
  const [aba, setAba] = useState<'dash' | 'agends' | 'estabs' | 'stories'>('dash');
  const [estabs, setEstabs] = useState<Estabelecimento[]>([]);
  const [agends, setAgends] = useState<Agendamento[]>([]);
  const [meusStories, setMeusStories] = useState<any[]>([]);
  const [totalLikes, setTotalLikes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notifNaoLidas, setNotifNaoLidas] = useState(0);

  // ESTABELECIMENTOS
  useEffect(() => {
    if (!admin?.id) return;

    const unsub = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', admin.id)
      .onSnapshot(snap => {
        const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Estabelecimento[];
        setEstabs(lista);
      });

    return unsub;
  }, [admin?.id]);

  // AGENDAMENTOS
  useEffect(() => {
    if (!estabs.length) return;

    const ids = estabs.map(e => e.id).slice(0, 10);

    const unsub = firestore()
      .collection('agendamentos')
      .where('estabelecimentoId', 'in', ids)
      .orderBy('criadoEm', 'desc')
      .limit(100)
      .onSnapshot(snap => {
        setAgends(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Agendamento[]);
        setLoading(false);
      });

    return unsub;
  }, [estabs]);

  // STORIES
  useEffect(() => {
    if (!admin?.id) return;

    const unsub = firestore()
      .collection('stories')
      .where('adminId', '==', admin.id)
      .onSnapshot(snap => {
        const storiesData = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as any[];

        storiesData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        setMeusStories(storiesData);

        const likes = storiesData.reduce((acc, curr: any) => acc + (curr.likesCount || 0), 0);
        setTotalLikes(likes);
      }, err => {
        console.error("Erro na consulta de stories:", err);
      });

    return unsub;
  }, [admin?.id]);

  // NOTIFICAÇÕES
  useEffect(() => {
    if (!admin?.id) return;

    const unsubNotif = firestore()
      .collection('notificacoes')
      .where('adminId', '==', admin.id)
      .where('lida', '==', false)
      .onSnapshot(snap => setNotifNaoLidas(snap.docs.length));

    return unsubNotif;
  }, [admin?.id]);

  const deletarStory = (id: string) => {
    Alert.alert('Apagar Postagem', 'Deseja excluir este story permanentemente?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => firestore().collection('stories').doc(id).delete() }
    ]);
  };

  const atualizarStatusAgendamento = (id: string, novoStatus: 'concluido' | 'cancelado') => {
    Alert.alert('Confirmar', `Deseja marcar como ${novoStatus}?`, [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim',
        onPress: async () => {
          try {
            if (novoStatus === 'concluido') {
              await functions().httpsCallable('concluirAgendamento')({
                agendamentoId: id
              });
            } else {
              await firestore()
                .collection('agendamentos')
                .doc(id)
                .update({ status: 'cancelado' });
            }
          } catch {
            Alert.alert('Erro', 'Não foi possível atualizar o status');
          }
        }
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja sair do painel?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => await signOut() },
    ]);
  };

  const receitaTotal = useMemo(() =>
    agends.filter(a => a.status === 'confirmado' || a.status === 'concluido')
      .reduce((acc, a) => acc + (a.servicoPreco || 0), 0)
    , [agends]);

  const chartData = useMemo(() => {
    const labels = []; const valores = []; const hoje = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(hoje.getDate() - i);
      labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
      const ds = d.toLocaleDateString('pt-BR');
      valores.push(agends.filter(a => a.data === ds && (a.status === 'confirmado' || a.status === 'concluido'))
        .reduce((acc, a) => acc + (a.servicoPreco || 0), 0));
    }
    return { labels, datasets: [{ data: valores }] };
  }, [agends]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#C9A96E" /></View>;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={s.header}>
        <View>
          <Text style={s.headerSub}>PAINEL ADMINISTRATIVO</Text>
          <Text style={s.headerTitulo}>Olá, {admin?.nome?.split(' ')[0]} 👋</Text>
        </View>
        <View style={s.headerAcoes}>
          <TouchableOpacity onPress={() => navigation.navigate('AdminNotif')} style={s.sinoBtn}>
            <Text style={s.sinoIcon}>🔔</Text>
            {notifNaoLidas > 0 && <View style={s.badge}><Text style={s.badgeText}>{notifNaoLidas}</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={s.sairBtn}>
            <Text style={s.sairText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.abasContainer}>
        <View style={s.abasInner}>
          {[
            ['dash', '📊 Dash'], 
            ['agends', '📅 Agenda'], 
            ['stories', '🎬 Posts'],
            ['estabs', '🏪 Locais']
          ].map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setAba(k as any)} style={[s.aba, aba === k && s.abaAtiva]}>
              <Text style={[s.abaText, aba === k && s.abaTextAtiva]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {aba === 'dash' && (
        <ScrollView contentContainerStyle={s.lista} showsVerticalScrollIndicator={false}>
          <View style={s.financeiroCardDash}>
            <Text style={s.financeiroTitulo}>RESUMO DE FATURAMENTO</Text>
            <View style={s.periodoRow}>
              {['dia', 'semana', 'mes'].map((p) => {
                const hoje = new Date();
                const valor = agends.filter(a => (a.status === 'concluido' || a.status === 'confirmado')).filter(a => {
                   const dParts = a.data.split('/');
                   const dAgend = new Date(Number(dParts[2]), Number(dParts[1]) - 1, Number(dParts[0]));
                   const diff = (hoje.getTime() - dAgend.getTime()) / (1000 * 60 * 60 * 24);
                   return p === 'dia' ? diff <= 1 : p === 'semana' ? diff <= 7 : diff <= 30;
                }).reduce((acc, curr) => acc + (curr.servicoPreco || 0), 0);
                return (
                  <View key={p} style={s.periodoItem}>
                    <Text style={s.periodoLabel}>{p === 'dia' ? 'HOJE' : p === 'semana' ? '7 DIAS' : '30 DIAS'}</Text>
                    <Text style={s.periodoValor}>R$ {valor.toLocaleString('pt-BR')}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={s.chartWrapper}>
            <View style={s.chartHeader}>
              <Text style={s.chartTitle}>Faturamento 6 dias</Text>
              <Text style={s.chartTotal}>Total: R$ {receitaTotal.toLocaleString('pt-BR')}</Text>
            </View>
            <BarChart
              data={chartData} width={width - 40} height={180} yAxisLabel="R$"
              chartConfig={{ ...chartConfig, fillShadowGradient: "#C9A96E", fillShadowGradientOpacity: 1 }}
              fromZero withInnerLines={false} style={s.chartStyle} flatColor showValuesOnTopOfBars
            />
          </View>

          <TouchableOpacity style={s.storyBtnPremium} activeOpacity={0.8} onPress={() => navigation.navigate('PostarStory')}>
            <View style={s.storyGradientBorder}>
               <View style={s.storyIconInner}><Text style={s.storyEmoji}>📸</Text></View>
            </View>
            <View style={s.storyTextContent}>
              <Text style={s.storyTitlePremium}>Postar novo Story</Text>
              <Text style={s.storySubPremium}>Divulgue novidades para os clientes</Text>
            </View>
            <View style={s.storyBadge}><Text style={s.storyBadgeText}>NOVO</Text></View>
          </TouchableOpacity>

          <View style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: '#1A1A1A' }]}>
              <Text style={[s.statIc, { color: '#C9A96E' }]}>❤️</Text>
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
        </ScrollView>
      )}

      {aba === 'stories' && (
        <FlatList
          data={meusStories}
          keyExtractor={item => item.id}
          contentContainerStyle={s.lista}
          ListHeaderComponent={<Text style={s.secTitulo}>Gerenciar Minhas Postagens</Text>}
          renderItem={({ item }) => (
            <View style={s.storyManageCard}>
              <Image source={{ uri: item.url }} style={s.storyMiniatura} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.storyInfoText}>Postado em {new Date(item.timestamp?.seconds * 1000).toLocaleDateString('pt-BR')}</Text>
                <Text style={s.storyInfoSub}>❤️ {item.likesCount || 0} curtidas • 👁️ {item.views || 0}</Text>
              </View>
              <TouchableOpacity style={s.btnLixo} onPress={() => deletarStory(item.id)}>
                <Text style={{ fontSize: 18 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={s.emptyText}>Você ainda não postou stories.</Text>}
        />
      )}

      {aba === 'agends' && (
        <FlatList
          data={agends}
          keyExtractor={a => a.id}
          contentContainerStyle={s.lista}
          ListHeaderComponent={<Text style={s.secTitulo}>Gerenciar Agendamentos</Text>}
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
              <View style={[s.statusBadge, item.status === 'confirmado' ? s.bgConfirmado : item.status === 'cancelado' ? s.bgCancelado : s.bgConcluido]}>
                <Text style={[s.statusText, item.status === 'confirmado' ? s.txtConfirmado : item.status === 'cancelado' ? s.txtCancelado : s.txtConcluido]}>
                  {item.status?.toUpperCase()}
                </Text>
              </View>
              {item.status === 'confirmado' && (
                <View style={s.acoesWrap}>
                  <TouchableOpacity style={s.btnConcluir} onPress={() => atualizarStatusAgendamento(item.id, 'concluido')}>
                    <Text style={s.btnConcluirText}>Concluir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.btnCancelar} onPress={() => atualizarStatusAgendamento(item.id, 'cancelado')}>
                    <Text style={s.btnCancelarText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      {aba === 'estabs' && (
        <FlatList
          data={estabs}
          keyExtractor={e => e.id}
          contentContainerStyle={s.lista}
          ListHeaderComponent={
            <TouchableOpacity style={s.novoBtn} onPress={() => navigation.navigate('AdminEstab', { estabelecimentoId: 'novo' })}>
              <Text style={s.novoBtnText}>＋ Novo Estabelecimento</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={[s.estabCard, { borderLeftColor: item.cor || '#C9A96E' }]} onPress={() => navigation.navigate('AdminEstab', { estabelecimentoId: item.id })}>
              <EstabImage item={item} />
              <View style={s.estabInfo}>
                <Text style={s.estabNome}>{item.nome}</Text>
                <Text style={s.estabTipo}>{item.tipo} • ⭐ {item.avaliacao?.toFixed(1)}</Text>
              </View>
              <Text style={s.arrow}>﹥</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const chartConfig = {
  backgroundGradientFrom: "#1A1A1A", backgroundGradientTo: "#1A1A1A",
  color: (opacity = 1) => `rgba(201, 169, 110, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.4})`,
  strokeWidth: 2, barPercentage: 0.5, decimalPlaces: 0,
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#1A1A1A', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerSub: { color: '#C9A96E', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  headerTitulo: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  headerAcoes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sinoBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  sinoIcon: { fontSize: 20 },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#FF3B30', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1A1A1A' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  sairBtn: { backgroundColor: 'rgba(201, 169, 110, 0.15)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  sairText: { color: '#C9A96E', fontSize: 13, fontWeight: '700' },
  abasContainer: { marginTop: -20, paddingHorizontal: 20 },
  abasInner: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 6, elevation: 4 },
  aba: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  abaAtiva: { backgroundColor: '#1A1A1A' },
  abaText: { color: '#999', fontSize: 13, fontWeight: '600' },
  abaTextAtiva: { color: '#C9A96E', fontWeight: '800' },
  lista: { padding: 20, paddingBottom: 40 },
  
  financeiroCardDash: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 15, elevation: 3 },
  financeiroTitulo: { color: '#AAA', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 15, textAlign: 'center' },
  periodoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  periodoItem: { alignItems: 'center', flex: 1 },
  periodoLabel: { color: '#C9A96E', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  periodoValor: { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },

  chartWrapper: { backgroundColor: '#1A1A1A', borderRadius: 24, padding: 20, marginBottom: 20 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
  chartTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  chartTotal: { color: '#C9A96E', fontSize: 14, fontWeight: '600' },
  chartStyle: { marginLeft: -20, borderRadius: 16 },

  storyBtnPremium: { backgroundColor: '#1A1A1A', borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  storyGradientBorder: { width: 58, height: 58, borderRadius: 29, padding: 3, backgroundColor: '#C9A96E', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  storyIconInner: { width: '100%', height: '100%', borderRadius: 29, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  storyEmoji: { fontSize: 24 },
  storyTextContent: { flex: 1 },
  storyTitlePremium: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  storySubPremium: { color: '#C9A96E', fontSize: 12, opacity: 0.8 },
  storyBadge: { backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, position: 'absolute', top: 12, right: 12 },
  storyBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 18, padding: 12, alignItems: 'center', elevation: 2 },
  statIc: { fontSize: 18, marginBottom: 4 },
  statV: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  statL: { color: '#AAA', fontSize: 9, fontWeight: '600' },

  secTitulo: { color: '#1A1A1A', fontSize: 18, fontWeight: '800', marginBottom: 15 },
  storyManageCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 10, elevation: 1 },
  storyMiniatura: { width: 50, height: 70, borderRadius: 10, backgroundColor: '#EEE' },
  storyInfoText: { color: '#1A1A1A', fontSize: 14, fontWeight: '700' },
  storyInfoSub: { color: '#C9A96E', fontSize: 12, fontWeight: '600' },
  btnLixo: { backgroundColor: '#FFF0F0', width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#AAA', marginTop: 30, fontSize: 14 },

  agendCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 12 },
  agendTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  agendNome: { color: '#1A1A1A', fontSize: 15, fontWeight: '700' },
  agendSub: { color: '#777', fontSize: 12 },
  agendData: { color: '#C9A96E', fontSize: 12, fontWeight: '600' },
  agendPreco: { color: '#1A1A1A', fontSize: 17, fontWeight: '800' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  bgConfirmado: { backgroundColor: '#E8F5E9' }, txtConfirmado: { color: '#2E7D32' },
  bgCancelado: { backgroundColor: '#FFEBEE' }, txtCancelado: { color: '#C62828' },
  bgConcluido: { backgroundColor: '#E3F2FD' }, txtConcluido: { color: '#1565C0' },
  acoesWrap: { flexDirection: 'row', gap: 10, marginTop: 15, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 15 },
  btnConcluir: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, alignItems: 'center' },
  btnConcluirText: { color: '#C9A96E', fontSize: 13, fontWeight: '700' },
  btnCancelar: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 12, alignItems: 'center' },
  btnCancelarText: { color: '#999', fontSize: 13, fontWeight: '700' },

  novoBtn: { backgroundColor: '#C9A96E', borderRadius: 16, padding: 18, alignItems: 'center', marginVertical: 20 },
  novoBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },
  estabCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 15, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 6 },
  estabInfo: { flex: 1 },
  estabNome: { color: '#1A1A1A', fontSize: 16, fontWeight: '700' },
  estabTipo: { color: '#888', fontSize: 13 },
  arrow: { color: '#DDD', fontSize: 20 },
  estabFoto: { width: 50, height: 50, borderRadius: 14, marginRight: 15 },
  estabIcon: { borderRadius: 14, width: 50, height: 50, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  estabEmoji: { fontSize: 24 },
});