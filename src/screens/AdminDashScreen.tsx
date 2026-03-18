import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Dimensions, StatusBar, Image
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { BarChart } from 'react-native-chart-kit';
import type { Estabelecimento, Agendamento } from '../types';

const { width } = Dimensions.get('window');

// Componente Interno para gerenciar Foto ou Emoji
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
    <View style={[s.estabIcon, { backgroundColor: (item.cor || '#C9A96E') + '15' }]}>
      <Text style={s.estabEmoji}>{(!isUrl ? item.img : null) || '🏪'}</Text>
    </View>
  );
};

export default function AdminDashScreen() {
  const navigation = useNavigation<any>();
  const { admin, signOut } = useAuth();
  const [aba, setAba] = useState<'dash' | 'estabs'>('dash');
  const [estabs, setEstabs] = useState<Estabelecimento[]>([]);
  const [agends, setAgends] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifNaoLidas, setNotifNaoLidas] = useState(0);

  // --- LÓGICA DE CARREGAMENTO ---
  useEffect(() => {
    if (!admin?.id) return;
    const u1 = firestore()
      .collection('estabelecimentos')
      .where('adminId', '==', admin.id)
      .onSnapshot(snap => {
        const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Estabelecimento[];
        setEstabs(lista);
        setLoading(false);
        if (lista.length > 0) {
          const ids = lista.map(e => e.id);
          firestore()
            .collection('agendamentos')
            .where('estabelecimentoId', 'in', ids)
            .orderBy('criadoEm', 'desc')
            .limit(50)
            .onSnapshot(snapA => {
                if (!snapA || !snapA.docs) return;
                const listaA = snapA.docs.map(d => ({ id: d.id, ...d.data() })) as Agendamento[];
                setAgends(listaA);
              }, error => console.log('Agendamentos error:', error)
            );
        } else {
          setAgends([]);
          setLoading(false);
        }
      });
    return u1;
  }, [admin?.id]);

  useEffect(() => {
    if (!admin?.id) return;
    const unsub = firestore()
      .collection('notificacoes')
      .where('adminId', '==', admin.id)
      .where('lida', '==', false)
      .where('apagada', '==', false)
      .onSnapshot(snap => {
          if (!snap) return;
          setNotifNaoLidas(snap.docs.length);
        }, error => console.log('Badge error:', error.message)
      );
    return unsub;
  }, [admin?.id]);

  useEffect(() => {
    if (!admin) {
      navigation.reset({ index: 0, routes: [{ name: 'HomeTabs' }] });
    }
  }, [admin]);

  // --- FUNÇÕES DE AÇÃO ---
  const atualizarStatusAgendamento = (id: string, novoStatus: 'concluido' | 'cancelado') => {
    const titulo = novoStatus === 'concluido' ? 'Concluir' : 'Cancelar';
    Alert.alert(
      `${titulo} Agendamento`,
      `Tem certeza que deseja marcar como ${novoStatus}?`,
      [
        { text: 'Não', style: 'cancel' },
        { 
          text: 'Sim', 
          onPress: () => {
            firestore()
              .collection('agendamentos')
              .doc(id)
              .update({ status: novoStatus })
              .catch(err => Alert.alert('Erro', 'Não foi possível atualizar o status.'));
          }
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja sair do painel?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => await signOut() },
    ]);
  };

  // --- MEMOS PARA GRÁFICOS E STATS ---
  const chartData = useMemo(() => {
    const labels = [];
    const valores = [];
    const hoje = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(hoje.getDate() - i);
      labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
      const dataString = d.toLocaleDateString('pt-BR');
      const totalDia = agends
        .filter(a => a.data === dataString && (a.status === 'confirmado' || a.status === 'concluido'))
        .reduce((acc, a) => acc + (a.servicoPreco || 0), 0);
      valores.push(totalDia);
    }
    return { labels, datasets: [{ data: valores }] };
  }, [agends]);

  const receitaTotal = useMemo(() => {
    return agends
      .filter(a => a.status === 'confirmado' || a.status === 'concluido')
      .reduce((acc, a) => acc + (a.servicoPreco || 0), 0);
  }, [agends]);

  const chartConfig = {
    backgroundGradientFrom: "#1A1A1A",
    backgroundGradientTo: "#1A1A1A",
    color: (opacity = 1) => `rgba(201, 169, 110, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.4})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    decimalPlaces: 0,
    fillShadowGradient: "#C9A96E",
    fillShadowGradientOpacity: 1,
  };

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
            {notifNaoLidas > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{notifNaoLidas}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={s.sairBtn}>
            <Text style={s.sairText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.abasContainer}>
        <View style={s.abasInner}>
          {[['dash', '📊 Geral'], ['estabs', '🏪 Locais']].map(([k, l]) => (
            <TouchableOpacity
              key={k}
              onPress={() => setAba(k as any)}
              style={[s.aba, aba === k && s.abaAtiva]}>
              <Text style={[s.abaText, aba === k && s.abaTextAtiva]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {aba === 'dash' && (
        <FlatList
          data={agends}
          keyExtractor={a => a.id}
          contentContainerStyle={s.lista}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={s.chartWrapper}>
                <View style={s.chartHeader}>
                  <Text style={s.chartTitle}>Faturamento 6 dias</Text>
                  <Text style={s.chartTotal}>R$ {receitaTotal.toLocaleString('pt-BR')}</Text>
                </View>
                <BarChart
                  data={chartData}
                  width={width - 40}
                  height={180}
                  yAxisLabel="R$"
                  chartConfig={chartConfig}
                  fromZero={true}
                  withInnerLines={false}
                  style={s.chartStyle}
                  flatColor={true}
                  showValuesOnTopOfBars={true}
                />
              </View>

              <View style={s.statsRow}>
                {[
                  { ic: '🏪', v: estabs.length, l: 'Locais' },
                  { ic: '📅', v: agends.length, l: 'Agend.' },
                  { ic: '💰', v: `R$${receitaTotal}`, l: 'Receita' },
                  { ic: '⭐', v: estabs.length > 0 ? (estabs.reduce((a, e) => a + (e.avaliacao || 0), 0) / estabs.length).toFixed(1) : '—', l: 'Média' },
                ].map(({ ic, v, l }) => (
                  <View key={l} style={s.statCard}>
                    <Text style={s.statIc}>{ic}</Text>
                    <Text style={s.statV} numberOfLines={1}>{v}</Text>
                    <Text style={s.statL}>{l}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.secTitulo}>Últimos Agendamentos</Text>
            </>
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

              <View style={s.agendRodape}>
                <View style={[s.statusBadge, 
                  item.status === 'confirmado' && s.bgConfirmado,
                  item.status === 'cancelado' && s.bgCancelado,
                  item.status === 'concluido' && s.bgConcluido
                ]}>
                  <Text style={[s.statusText, 
                    item.status === 'confirmado' && s.txtConfirmado,
                    item.status === 'cancelado' && s.txtCancelado,
                    item.status === 'concluido' && s.txtConcluido
                  ]}>
                    {item.status?.toUpperCase()}
                  </Text>
                </View>
              </View>

              {item.status === 'confirmado' && (
                <View style={s.acoesWrap}>
                  <TouchableOpacity 
                    style={s.btnConcluir} 
                    onPress={() => atualizarStatusAgendamento(item.id, 'concluido')}>
                    <Text style={s.btnConcluirText}>Concluir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={s.btnCancelar} 
                    onPress={() => atualizarStatusAgendamento(item.id, 'cancelado')}>
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
            <TouchableOpacity
              style={s.novoBtn}
              onPress={() => navigation.navigate('AdminEstab', { estabelecimentoId: 'novo' })}>
              <Text style={s.novoBtnText}>＋ Novo Estabelecimento</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.estabCard, { borderLeftColor: item.cor || '#C9A96E' }]}
              onPress={() => navigation.navigate('AdminEstab', { estabelecimentoId: item.id })}>
              
              <EstabImage item={item} />

              <View style={s.estabInfo}>
                <Text style={s.estabNome}>{item.nome}</Text>
                <Text style={s.estabTipo}>{item.tipo}</Text>
                <Text style={s.estabSub}>
                  {item.servicos?.length || 0} serviços ativos
                </Text>
              </View>
              <Text style={s.arrow}>﹥</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  header: { backgroundColor: '#1A1A1A', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerSub: { color: '#C9A96E', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  headerTitulo: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  headerAcoes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sinoBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  sinoIcon: { fontSize: 20 },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#FF3B30', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1A1A1A' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  sairBtn: { backgroundColor: 'rgba(201, 169, 110, 0.15)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  sairText: { color: '#C9A96E', fontSize: 13, fontWeight: '700' },
  abasContainer: { marginTop: -20, paddingHorizontal: 20 },
  abasInner: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 6, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  aba: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  abaAtiva: { backgroundColor: '#1A1A1A' },
  abaText: { color: '#999', fontSize: 13, fontWeight: '600' },
  abaTextAtiva: { color: '#C9A96E', fontWeight: '800' },
  lista: { padding: 20, paddingBottom: 40 },
  chartWrapper: { backgroundColor: '#1A1A1A', borderRadius: 24, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 15, elevation: 10 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
  chartTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  chartTotal: { color: '#C9A96E', fontSize: 18, fontWeight: '800' },
  chartStyle: { marginLeft: -20, borderRadius: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 18, padding: 12, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  statIc: { fontSize: 20, marginBottom: 6 },
  statV: { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },
  statL: { color: '#AAA', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  secTitulo: { color: '#1A1A1A', fontSize: 18, fontWeight: '800', marginBottom: 15 },
  agendCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  agendTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  agendNome: { color: '#1A1A1A', fontSize: 15, fontWeight: '700' },
  agendSub: { color: '#777', fontSize: 12, marginTop: 2 },
  agendData: { color: '#C9A96E', fontSize: 12, fontWeight: '600', marginTop: 4 },
  agendPreco: { color: '#1A1A1A', fontSize: 17, fontWeight: '800' },
  agendRodape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  bgConfirmado: { backgroundColor: '#E8F5E9' }, txtConfirmado: { color: '#2E7D32' },
  bgCancelado: { backgroundColor: '#FFEBEE' }, txtCancelado: { color: '#C62828' },
  bgConcluido: { backgroundColor: '#E3F2FD' }, txtConcluido: { color: '#1565C0' },
  acoesWrap: { flexDirection: 'row', gap: 10, marginTop: 15, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 15 },
  btnConcluir: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, alignItems: 'center' },
  btnConcluirText: { color: '#C9A96E', fontSize: 13, fontWeight: '700' },
  btnCancelar: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 12, alignItems: 'center' },
  btnCancelarText: { color: '#999', fontSize: 13, fontWeight: '700' },
  novoBtn: { backgroundColor: '#C9A96E', borderRadius: 16, padding: 18, alignItems: 'center', marginBottom: 20, elevation: 4 },
  novoBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },
  estabCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 15, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 6, elevation: 2 },
  estabInfo: { flex: 1 },
  estabNome: { color: '#1A1A1A', fontSize: 16, fontWeight: '700' },
  estabTipo: { color: '#888', fontSize: 13 },
  estabSub: { color: '#C9A96E', fontSize: 11, fontWeight: '600', marginTop: 4 },
  arrow: { color: '#DDD', fontSize: 20, fontWeight: '300' },
  emptyCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 40, alignItems: 'center', marginTop: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: '#AAA', fontSize: 14, fontWeight: '600' },

  estabFoto: { width: 50, height: 50, borderRadius: 14, marginRight: 15 },
  estabIcon: { borderRadius: 14, width: 50, height: 50, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  estabEmoji: { fontSize: 24 },
});