import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

const GOLD = '#C9A96E';
const DARK = '#090909';
const CARD = '#121212';
const BORDER = '#252525';
const GREEN = '#42C875';
const RED = '#FF6B6B';
const BLUE = '#55A7FF';
const AMBER = '#F1B451';
const PAYMENT_LIMIT = 180;

type FinanceMode = 'pagamentos' | 'assinaturas';
type PaymentFilter = 'todos' | 'approved' | 'pending' | 'failed';
type MethodFilter = 'todos' | 'pix' | 'credit_card';
type TypeFilter = 'todos' | 'assinatura' | 'impulsionamento';
type SubscriptionFilter = 'todas' | 'ativas' | 'vencendo' | 'pendentes' | 'vencidas';

const PLAN_PRICES: Record<string, number> = {
  essencial: 29.9,
  pro: 49.9,
  elite: 89.90,
};

const PAID_PLANS = Object.keys(PLAN_PRICES);
const APPROVED_STATUS = ['approved', 'authorized', 'accredited'];
const PENDING_STATUS = ['pending', 'in_process', 'in_mediation', 'processing'];
const FAILED_STATUS = [
  'rejected',
  'cancelled',
  'canceled',
  'expired',
  'charged_back',
  'refunded',
  'failed',
];

const toDate = (value: any): Date | null => {
  const date = value?.toDate?.() || value;

  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
};

const dateLabel = (value: any) => {
  const date = toDate(value);

  return date
    ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '--';
};

const money = (value: any) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const clean = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase();

const statusKey = (value: any) => clean(value) || 'pending';

const paymentType = (payment: any): Exclude<TypeFilter, 'todos'> =>
  payment?.tipo === 'impulsionamento' || payment?.pacoteId
    ? 'impulsionamento'
    : 'assinatura';

const paymentMethod = (payment: any): string =>
  clean(payment?.metodo || payment?.paymentType || payment?.tipoPagamento);

const isApproved = (value: any) => APPROVED_STATUS.includes(statusKey(value));
const isPending = (value: any) => PENDING_STATUS.includes(statusKey(value));
const isFailed = (value: any) => FAILED_STATUS.includes(statusKey(value));

const daysUntil = (value: any) => {
  const date = toDate(value);

  if (!date) return null;

  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
};

const subscriptionState = (estab: any) => {
  const plano = clean(estab?.plano);
  const expiraEm = toDate(estab?.expiraEm);
  const days = daysUntil(estab?.expiraEm);
  const pagante = PAID_PLANS.includes(plano);
  const pendente =
    !!estab?.planoPendente ||
    isPending(estab?.paymentStatus) ||
    estab?.statusPlano === 'pendente';

  if (pendente) return 'pendente';

  if (pagante && expiraEm && expiraEm.getTime() <= Date.now()) {
    return 'vencida';
  }

  if (pagante && estab?.assinaturaAtiva === true) {
    return days !== null && days >= 0 && days <= 7 ? 'vencendo' : 'ativa';
  }

  return 'inativa';
};

const paymentStatusView = (value: any) => {
  const status = statusKey(value);

  if (isApproved(status)) {
    return { label: 'Aprovado', color: GREEN, bg: 'rgba(66,200,117,0.14)' };
  }

  if (isPending(status)) {
    return { label: 'Pendente', color: AMBER, bg: 'rgba(241,180,81,0.14)' };
  }

  if (isFailed(status)) {
    return { label: 'Falhou', color: RED, bg: 'rgba(255,107,107,0.14)' };
  }

  return { label: status || 'Status', color: '#B8B8B8', bg: '#202020' };
};

const subscriptionStatusView = (value: string) => {
  if (value === 'ativa') {
    return { label: 'Ativa', color: GREEN, bg: 'rgba(66,200,117,0.14)' };
  }

  if (value === 'vencendo') {
    return { label: 'Vencendo', color: AMBER, bg: 'rgba(241,180,81,0.14)' };
  }

  if (value === 'pendente') {
    return { label: 'Pendente', color: BLUE, bg: 'rgba(85,167,255,0.14)' };
  }

  if (value === 'vencida') {
    return { label: 'Vencida', color: RED, bg: 'rgba(255,107,107,0.14)' };
  }

  return { label: 'Inativa', color: '#A0A0A0', bg: '#202020' };
};

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string | number;
  detail: string;
  color: string;
}) {
  return (
    <View style={s.metric}>
      <View style={[s.metricLine, { backgroundColor: color }]} />
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricDetail}>{detail}</Text>
    </View>
  );
}

export default function SuperAdminFinanceScreen() {
  const navigation = useNavigation<any>();
  const [mode, setMode] = useState<FinanceMode>('pagamentos');
  const [payments, setPayments] = useState<any[]>([]);
  const [estabs, setEstabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [access, setAccess] = useState(false);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('todos');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('todos');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos');
  const [subscriptionFilter, setSubscriptionFilter] =
    useState<SubscriptionFilter>('todas');

  const loadFinance = async () => {
    try {
      const [paymentSnap, estabsSnap] = await Promise.all([
        firestore()
          .collection('pagamentos')
          .orderBy('criadoEm', 'desc')
          .limit(PAYMENT_LIMIT)
          .get(),
        firestore().collection('estabelecimentos').get(),
      ]);

      setPayments(paymentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setEstabs(estabsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error: any) {
      console.log('Erro financeiro Super Admin:', error);
      Alert.alert('Financeiro', error?.message || 'Nao foi possivel carregar os dados.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const verifyAccess = async () => {
      try {
        const uid = auth().currentUser?.uid;

        if (!uid) {
          navigation.replace('AdminLogin');
          return;
        }

        const adminSnap = await firestore().collection('admins').doc(uid).get();

        if (!adminSnap.exists || adminSnap.data()?.cargo !== 'Super Admin') {
          Alert.alert('Acesso negado', 'Somente Super Admin pode acessar o financeiro.');
          navigation.goBack();
          return;
        }

        setAccess(true);
        await loadFinance();
      } catch (error) {
        console.log('Erro permissao financeiro Super Admin:', error);
        setLoading(false);
        navigation.goBack();
      }
    };

    verifyAccess();
  }, [navigation]);

  const estabsById = useMemo(
    () =>
      estabs.reduce((map, estab) => {
        map[estab.id] = estab;
        return map;
      }, {} as Record<string, any>),
    [estabs]
  );

  const searchTerm = clean(search);

  const filteredPayments = useMemo(
    () =>
      payments.filter(payment => {
        const estab = estabsById[payment.estabelecimentoId];
        const status = payment.status;
        const metodo = paymentMethod(payment);
        const tipo = paymentType(payment);
        const searchData = [
          estab?.nome,
          estab?.email,
          payment.clienteNome,
          payment.clienteEmail,
          payment.mercadoPagoId,
          payment.plano,
          payment.pacoteNome,
        ]
          .map(clean)
          .join(' ');

        const statusOk =
          paymentFilter === 'todos' ||
          (paymentFilter === 'approved' && isApproved(status)) ||
          (paymentFilter === 'pending' && isPending(status)) ||
          (paymentFilter === 'failed' && isFailed(status));

        const methodOk =
          methodFilter === 'todos' ||
          (methodFilter === 'pix' && metodo === 'pix') ||
          (methodFilter === 'credit_card' && metodo === 'credit_card');

        const typeOk = typeFilter === 'todos' || typeFilter === tipo;
        const searchOk = !searchTerm || searchData.includes(searchTerm);

        return statusOk && methodOk && typeOk && searchOk;
      }),
    [estabsById, methodFilter, paymentFilter, payments, searchTerm, typeFilter]
  );

  const filteredSubscriptions = useMemo(
    () =>
      estabs.filter(estab => {
        const state = subscriptionState(estab);
        const searchData = [
          estab.nome,
          estab.email,
          estab.responsavelEmail,
          estab.adminId,
          estab.plano,
          estab.planoPendente,
        ]
          .map(clean)
          .join(' ');

        const filterOk =
          subscriptionFilter === 'todas' ||
          (subscriptionFilter === 'ativas' && state === 'ativa') ||
          (subscriptionFilter === 'vencendo' && state === 'vencendo') ||
          (subscriptionFilter === 'pendentes' && state === 'pendente') ||
          (subscriptionFilter === 'vencidas' && state === 'vencida');

        return filterOk && (!searchTerm || searchData.includes(searchTerm));
      }),
    [estabs, searchTerm, subscriptionFilter]
  );

  const metrics = useMemo(() => {
    const paidSubscriptions = estabs.filter(estab => {
      const state = subscriptionState(estab);
      return state === 'ativa' || state === 'vencendo';
    });

    const monthlyRecurring = paidSubscriptions.reduce((total, estab) => {
      const planValue = PLAN_PRICES[clean(estab.plano)] || 0;

      return total + planValue;
    }, 0);

    const approvedPayments = payments.filter(payment => isApproved(payment.status));
    const pendingPayments = payments.filter(payment => isPending(payment.status));
    const failedPayments = payments.filter(payment => isFailed(payment.status));

    return {
      monthlyRecurring,
      activeSubscriptions: paidSubscriptions.length,
      expiringSubscriptions: estabs.filter(estab => subscriptionState(estab) === 'vencendo').length,
      expiredSubscriptions: estabs.filter(estab => subscriptionState(estab) === 'vencida').length,
      paidHistory: approvedPayments.reduce((total, payment) => total + Number(payment.valor || 0), 0),
      pendingHistory: pendingPayments.reduce((total, payment) => total + Number(payment.valor || 0), 0),
      approvedCount: approvedPayments.length,
      pendingCount: pendingPayments.length,
      failedCount: failedPayments.length,
    };
  }, [estabs, payments]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFinance();
  };

  if (loading || !access) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={GOLD} size="large" />
        <Text style={s.loadingText}>Carregando financeiro...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK} />

      <View style={s.header}>
        <TouchableOpacity style={s.iconButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={GOLD} />
        </TouchableOpacity>

        <View style={s.headerText}>
          <Text style={s.eyebrow}>SUPER ADMIN</Text>
          <Text style={s.title}>Controle financeiro</Text>
        </View>

        <TouchableOpacity style={s.iconButton} onPress={onRefresh}>
          <MaterialCommunityIcons name="refresh" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
        }
      >
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View>
              <Text style={s.heroLabel}>Receita recorrente estimada</Text>
              <Text style={s.heroValue}>{money(metrics.monthlyRecurring)}</Text>
            </View>
            <View style={s.heroBadge}>
              <MaterialCommunityIcons name="shield-check-outline" color={GREEN} size={18} />
              <Text style={s.heroBadgeText}>Master</Text>
            </View>
          </View>

          <View style={s.heroFacts}>
            <View style={s.heroFact}>
              <Text style={s.heroFactValue}>{metrics.activeSubscriptions}</Text>
              <Text style={s.heroFactLabel}>assinaturas pagantes</Text>
            </View>
            <View style={s.heroFact}>
              <Text style={s.heroFactValue}>{money(metrics.paidHistory)}</Text>
              <Text style={s.heroFactLabel}>aprovado no historico</Text>
            </View>
          </View>
        </View>

        <View style={s.metricsGrid}>
          <Metric
            label="Pagamentos aprovados"
            value={metrics.approvedCount}
            detail={`${PAYMENT_LIMIT} ultimos lancamentos`}
            color={GREEN}
          />
          <Metric
            label="Pagamentos pendentes"
            value={money(metrics.pendingHistory)}
            detail={`${metrics.pendingCount} aguardando`}
            color={AMBER}
          />
          <Metric
            label="Assinaturas vencendo"
            value={metrics.expiringSubscriptions}
            detail="janela de 7 dias"
            color={BLUE}
          />
          <Metric
            label="Atencao"
            value={metrics.expiredSubscriptions + metrics.failedCount}
            detail={`${metrics.expiredSubscriptions} vencidas, ${metrics.failedCount} falhas`}
            color={RED}
          />
        </View>

        <View style={s.modeBar}>
          <TouchableOpacity
            style={[s.modeButton, mode === 'pagamentos' && s.modeButtonActive]}
            onPress={() => setMode('pagamentos')}
          >
            <MaterialCommunityIcons
              name="cash-multiple"
              size={18}
              color={mode === 'pagamentos' ? '#090909' : '#FFF'}
            />
            <Text style={[s.modeText, mode === 'pagamentos' && s.modeTextActive]}>
              Pagamentos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeButton, mode === 'assinaturas' && s.modeButtonActive]}
            onPress={() => setMode('assinaturas')}
          >
            <MaterialCommunityIcons
              name="calendar-sync-outline"
              size={18}
              color={mode === 'assinaturas' ? '#090909' : '#FFF'}
            />
            <Text style={[s.modeText, mode === 'assinaturas' && s.modeTextActive]}>
              Assinaturas
            </Text>
          </TouchableOpacity>
        </View>

        <View style={s.searchWrap}>
          <MaterialCommunityIcons name="magnify" color="#777" size={20} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={
              mode === 'pagamentos'
                ? 'Buscar estabelecimento, cliente ou pagamento'
                : 'Buscar estabelecimento, plano ou admin'
            }
            placeholderTextColor="#666"
            style={s.search}
          />
        </View>

        {mode === 'pagamentos' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
              <FilterChip active={paymentFilter === 'todos'} label="Todos" onPress={() => setPaymentFilter('todos')} />
              <FilterChip active={paymentFilter === 'approved'} label="Aprovados" onPress={() => setPaymentFilter('approved')} />
              <FilterChip active={paymentFilter === 'pending'} label="Pendentes" onPress={() => setPaymentFilter('pending')} />
              <FilterChip active={paymentFilter === 'failed'} label="Falhas" onPress={() => setPaymentFilter('failed')} />
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
              <FilterChip active={methodFilter === 'todos'} label="PIX + cartao" onPress={() => setMethodFilter('todos')} />
              <FilterChip active={methodFilter === 'pix'} label="PIX" onPress={() => setMethodFilter('pix')} />
              <FilterChip active={methodFilter === 'credit_card'} label="Cartao" onPress={() => setMethodFilter('credit_card')} />
              <FilterChip active={typeFilter === 'todos'} label="Todos os tipos" onPress={() => setTypeFilter('todos')} />
              <FilterChip active={typeFilter === 'assinatura'} label="Assinaturas" onPress={() => setTypeFilter('assinatura')} />
              <FilterChip active={typeFilter === 'impulsionamento'} label="Impulsionamentos" onPress={() => setTypeFilter('impulsionamento')} />
            </ScrollView>

            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Lancamentos</Text>
              <Text style={s.sectionCount}>{filteredPayments.length}</Text>
            </View>

            {filteredPayments.map(payment => {
              const estab = estabsById[payment.estabelecimentoId];
              const visual = paymentStatusView(payment.status);
              const tipo = paymentType(payment);
              const metodo = paymentMethod(payment);

              return (
                <View key={payment.id} style={s.rowCard}>
                  <View style={s.rowTop}>
                    <View style={s.rowTitleWrap}>
                      <Text style={s.rowTitle} numberOfLines={1}>
                        {estab?.nome || payment.clienteNome || 'Estabelecimento'}
                      </Text>
                      <Text style={s.rowMeta}>
                        {tipo === 'assinatura' ? `Plano ${payment.plano || '--'}` : payment.pacoteNome || 'Impulsionamento'}
                      </Text>
                    </View>
                    <View style={[s.pill, { backgroundColor: visual.bg }]}>
                      <Text style={[s.pillText, { color: visual.color }]}>{visual.label}</Text>
                    </View>
                  </View>

                  <View style={s.moneyLine}>
                    <Text style={s.paymentValue}>{money(payment.valor)}</Text>
                    <Text style={s.paymentMethod}>
                      {metodo === 'credit_card' ? 'Cartao' : metodo === 'pix' ? 'PIX' : metodo || '--'}
                    </Text>
                  </View>

                  <View style={s.detailGrid}>
                    <Text style={s.detailText}>Criado: {dateLabel(payment.criadoEm)}</Text>
                    <Text style={s.detailText}>Aprovado: {dateLabel(payment.aprovadoEm)}</Text>
                    <Text style={s.detailText} numberOfLines={1}>
                      MP: {payment.mercadoPagoId || '--'}
                    </Text>
                    <Text style={s.detailText} numberOfLines={1}>
                      Cliente: {payment.clienteEmail || payment.clienteId || '--'}
                    </Text>
                  </View>
                </View>
              );
            })}

            {filteredPayments.length === 0 && (
              <View style={s.empty}>
                <MaterialCommunityIcons name="cash-remove" color="#777" size={28} />
                <Text style={s.emptyText}>Nenhum pagamento nesse filtro.</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
              <FilterChip active={subscriptionFilter === 'todas'} label="Todas" onPress={() => setSubscriptionFilter('todas')} />
              <FilterChip active={subscriptionFilter === 'ativas'} label="Ativas" onPress={() => setSubscriptionFilter('ativas')} />
              <FilterChip active={subscriptionFilter === 'vencendo'} label="Vencendo" onPress={() => setSubscriptionFilter('vencendo')} />
              <FilterChip active={subscriptionFilter === 'pendentes'} label="Pendentes" onPress={() => setSubscriptionFilter('pendentes')} />
              <FilterChip active={subscriptionFilter === 'vencidas'} label="Vencidas" onPress={() => setSubscriptionFilter('vencidas')} />
            </ScrollView>

            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Carteira de assinaturas</Text>
              <Text style={s.sectionCount}>{filteredSubscriptions.length}</Text>
            </View>

            {filteredSubscriptions.map(estab => {
              const state = subscriptionState(estab);
              const visual = subscriptionStatusView(state);
              const days = daysUntil(estab.expiraEm);
              const plan = clean(estab.plano) || 'free';

              return (
                <View key={estab.id} style={s.rowCard}>
                  <View style={s.rowTop}>
                    <View style={s.rowTitleWrap}>
                      <Text style={s.rowTitle} numberOfLines={1}>{estab.nome || 'Sem nome'}</Text>
                      <Text style={s.rowMeta}>
                        Plano {plan.toUpperCase()}
                      </Text>
                    </View>
                    <View style={[s.pill, { backgroundColor: visual.bg }]}>
                      <Text style={[s.pillText, { color: visual.color }]}>{visual.label}</Text>
                    </View>
                  </View>

                  <View style={s.subscriptionValueRow}>
                    <Text style={s.paymentValue}>
                      {money(PLAN_PRICES[plan] || 0)}
                    </Text>
                    <Text style={s.paymentMethod}>
                      {estab.paymentType === 'credit_card'
                        ? 'Cartao'
                        : estab.paymentType === 'pix'
                          ? 'PIX'
                          : estab.paymentType || '--'}
                    </Text>
                  </View>

                  <View style={s.detailGrid}>
                    <Text style={s.detailText}>Expira: {dateLabel(estab.expiraEm)}</Text>
                    <Text style={s.detailText}>
                      Prazo: {days === null ? '--' : days >= 0 ? `${days} dias` : 'vencido'}
                    </Text>
                    <Text style={s.detailText} numberOfLines={1}>
                      Pagamento: {estab.paymentStatus || '--'}
                    </Text>
                    <Text style={s.detailText} numberOfLines={1}>
                      Pendente: {estab.planoPendente || '--'}
                    </Text>
                  </View>
                </View>
              );
            })}

            {filteredSubscriptions.length === 0 && (
              <View style={s.empty}>
                <MaterialCommunityIcons name="calendar-remove-outline" color="#777" size={28} />
                <Text style={s.emptyText}>Nenhuma assinatura nesse filtro.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DARK,
    gap: 12,
  },
  loadingText: { color: '#888', fontSize: 13 },
  header: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1 },
  eyebrow: { color: GOLD, fontSize: 10, fontWeight: '800', marginBottom: 2 },
  title: { color: '#FFF', fontSize: 21, fontWeight: '900' },
  scroll: { padding: 16, paddingBottom: 36 },
  hero: {
    backgroundColor: '#111519',
    borderWidth: 1,
    borderColor: '#253039',
    borderRadius: 8,
    padding: 18,
    marginBottom: 12,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  heroLabel: { color: '#A4B5C2', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  heroValue: { color: '#FFF', fontSize: 29, fontWeight: '900' },
  heroBadge: {
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(66,200,117,0.35)',
    backgroundColor: 'rgba(66,200,117,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroBadgeText: { color: GREEN, fontSize: 12, fontWeight: '800' },
  heroFacts: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroFact: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#253039',
    paddingTop: 12,
  },
  heroFactValue: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  heroFactLabel: { color: '#8C9AA5', fontSize: 11, marginTop: 3 },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  metric: {
    width: '48.3%',
    minHeight: 126,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 13,
  },
  metricLine: { width: 32, height: 3, borderRadius: 2, marginBottom: 12 },
  metricLabel: { color: '#A8A8A8', fontSize: 11, fontWeight: '700' },
  metricValue: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 7 },
  metricDetail: { color: '#727272', fontSize: 11, lineHeight: 15, marginTop: 5 },
  modeBar: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    gap: 5,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  modeButtonActive: { backgroundColor: GOLD },
  modeText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  modeTextActive: { color: DARK },
  searchWrap: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 11,
  },
  search: { flex: 1, color: '#FFF', fontSize: 13, paddingVertical: 10 },
  chipsRow: { gap: 8, paddingBottom: 10 },
  chip: {
    minHeight: 35,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chipActive: { borderColor: GOLD, backgroundColor: 'rgba(201,169,110,0.16)' },
  chipText: { color: '#AEAEAE', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: GOLD },
  sectionHead: {
    marginTop: 5,
    marginBottom: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  sectionCount: {
    minWidth: 30,
    minHeight: 28,
    borderRadius: 8,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    color: GOLD,
    backgroundColor: 'rgba(201,169,110,0.14)',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 7 : 5,
  },
  rowCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  rowTitleWrap: { flex: 1 },
  rowTitle: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  rowMeta: { color: '#8A8A8A', fontSize: 12, marginTop: 4 },
  pill: {
    borderRadius: 7,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  pillText: { fontSize: 11, fontWeight: '900' },
  moneyLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 12,
    paddingTop: 11,
  },
  subscriptionValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 12,
    paddingTop: 11,
  },
  paymentValue: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  paymentMethod: {
    color: '#D5D5D5',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    backgroundColor: '#202020',
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 11,
  },
  detailText: {
    width: '48.6%',
    color: '#7B7B7B',
    fontSize: 11,
    lineHeight: 15,
  },
  empty: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: CARD,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { color: '#8D8D8D', fontSize: 13, fontWeight: '700' },
});
