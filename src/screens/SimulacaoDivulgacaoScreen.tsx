import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

const GOLD = '#C9A96E';

const passos = [
  {
    titulo: 'Cliente encontra seu espaco',
    descricao:
      'Seu estabelecimento aparece no BeautyHub com foto, selo, avaliacao, endereco e servicos.',
    dono:
      'Mantenha fotos, servicos e horarios atualizados para passar confianca logo no primeiro toque.',
  },
  {
    titulo: 'Cliente escolhe um servico',
    descricao:
      'Ele abre seu perfil, ve preco, tempo do procedimento e escolhe o melhor horario disponivel.',
    dono:
      'Cadastre servicos claros e organize a agenda para evitar mensagens manuais e horarios duplicados.',
  },
  {
    titulo: 'Agendamento chega no painel',
    descricao:
      'Depois da confirmacao, o horario entra na sua agenda administrativa com os dados do cliente.',
    dono:
      'Acompanhe tudo pelo Dash: agenda, faturamento, notificacoes, posts e impulsionamento.',
  },
  {
    titulo: 'Divulgacao traz mais clientes',
    descricao:
      'Com posts, selo e impulsionamento, seu espaco ganha destaque e aumenta as chances de reserva.',
    dono:
      'Use o impulsionamento em datas fortes, horarios vagos e servicos com maior margem.',
  },
];

export default function SimulacaoDivulgacaoScreen({ route, navigation }: any) {
  const { estabelecimentoNome } = route.params || {};
  const [passoAtual, setPassoAtual] = useState(0);

  const passo = passos[passoAtual];
  const progresso = useMemo(
    () => `${passoAtual + 1}/${passos.length}`,
    [passoAtual]
  );

  const avancar = () => {
    if (passoAtual < passos.length - 1) {
      setPassoAtual(passoAtual + 1);
      return;
    }

    navigation.goBack();
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>Voltar</Text>
        </TouchableOpacity>
        <Text style={s.progress}>{progresso}</Text>
      </View>

      <Text style={s.kicker}>Simulacao de divulgacao</Text>
      <Text style={s.title}>Veja como o cliente agenda no BeautyHub</Text>
      <Text style={s.subtitle}>
        Um guia rapido para o dono entender como seu estabelecimento aparece,
        recebe visitas e transforma interesse em agendamento.
      </Text>

      <View style={s.phone}>
        <View style={s.phoneTop}>
          <View>
            <Text style={s.phoneLabel}>BeautyHub</Text>
            <Text style={s.phoneTitle}>
              {estabelecimentoNome || 'Seu estabelecimento'}
            </Text>
          </View>
          <View style={s.badge}>
            <Text style={s.badgeText}>Destaque</Text>
          </View>
        </View>

        <View style={s.cover} />

        <View style={s.serviceCard}>
          <View>
            <Text style={s.serviceName}>Design de sobrancelhas</Text>
            <Text style={s.serviceMeta}>45 min - horario disponivel hoje</Text>
          </View>
          <Text style={s.price}>R$ 65</Text>
        </View>

        <View style={s.scheduleRow}>
          {['09:00', '14:30', '17:00'].map((hora, index) => (
            <View
              key={hora}
              style={[s.hourChip, index === 1 && s.hourChipActive]}
            >
              <Text
                style={[
                  s.hourText,
                  index === 1 && s.hourTextActive,
                ]}
              >
                {hora}
              </Text>
            </View>
          ))}
        </View>

        <View style={s.confirmBox}>
          <Text style={s.confirmTitle}>Agendamento confirmado</Text>
          <Text style={s.confirmText}>
            O cliente recebe aviso e voce acompanha pelo painel.
          </Text>
        </View>
      </View>

      <View style={s.explainCard}>
        <Text style={s.stepTitle}>{passo.titulo}</Text>
        <Text style={s.stepText}>{passo.descricao}</Text>
        <View style={s.ownerTip}>
          <Text style={s.ownerLabel}>Para o dono</Text>
          <Text style={s.ownerText}>{passo.dono}</Text>
        </View>
      </View>

      <View style={s.dots}>
        {passos.map((item, index) => (
          <TouchableOpacity
            key={item.titulo}
            onPress={() => setPassoAtual(index)}
            style={[s.dot, index === passoAtual && s.dotActive]}
          />
        ))}
      </View>

      <TouchableOpacity style={s.primaryBtn} activeOpacity={0.86} onPress={avancar}>
        <Text style={s.primaryText}>
          {passoAtual === passos.length - 1 ? 'Concluir simulacao' : 'Proximo passo'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0B',
  },
  content: {
    padding: 20,
    paddingBottom: 42,
  },
  header: {
    marginTop: 32,
    marginBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.35)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '800',
  },
  progress: {
    color: '#888',
    fontSize: 13,
    fontWeight: '800',
  },
  kicker: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    marginTop: 8,
  },
  subtitle: {
    color: '#A7A7A7',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  phone: {
    marginTop: 22,
    backgroundColor: '#171717',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  phoneTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phoneLabel: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '900',
  },
  phoneTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },
  badge: {
    backgroundColor: 'rgba(201,169,110,0.16)',
    borderColor: 'rgba(201,169,110,0.35)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '900',
  },
  cover: {
    height: 118,
    borderRadius: 18,
    backgroundColor: '#2A2418',
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.16)',
  },
  serviceCard: {
    marginTop: 14,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceName: {
    color: '#111',
    fontSize: 14,
    fontWeight: '900',
  },
  serviceMeta: {
    color: '#777',
    fontSize: 12,
    marginTop: 4,
  },
  price: {
    color: '#111',
    fontSize: 16,
    fontWeight: '900',
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  hourChip: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#242424',
  },
  hourChipActive: {
    backgroundColor: GOLD,
  },
  hourText: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: '800',
  },
  hourTextActive: {
    color: '#111',
  },
  confirmBox: {
    marginTop: 14,
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.28)',
  },
  confirmTitle: {
    color: '#8BE28F',
    fontSize: 13,
    fontWeight: '900',
  },
  confirmText: {
    color: '#CFCFCF',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  explainCard: {
    marginTop: 18,
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
  },
  stepTitle: {
    color: '#111',
    fontSize: 18,
    fontWeight: '900',
  },
  stepText: {
    color: '#555',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  ownerTip: {
    marginTop: 14,
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(201,169,110,0.12)',
  },
  ownerLabel: {
    color: '#8B6B2E',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ownerText: {
    color: '#3A321F',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#444',
  },
  dotActive: {
    width: 24,
    backgroundColor: GOLD,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '900',
  },
});
