import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, StatusBar, Platform, FlatList,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';

const GOLD = '#C9A96E';
const DARK = '#0A0A0A';

const MODELOS = [
  { titulo: '🎉 Nova funcionalidade!', msg: 'Lançamos uma nova funcionalidade incrível no BeautyHub. Acesse o app para conferir!' },
  { titulo: '🔧 Manutenção programada', msg: 'O sistema entrará em manutenção no dia [DATA] às [HORA]. Duração estimada: 30 minutos.' },
  { titulo: '💰 Promoção especial!', msg: 'Por tempo limitado, upgrade para o plano Pro com 20% de desconto. Aproveite!' },
  { titulo: '⚠️ Aviso importante', msg: 'Informamos que [MENSAGEM]. Em caso de dúvidas, entre em contato com o suporte.' },
];

export default function SuperAdminNotifScreen() {
  const navigation = useNavigation<any>();
  const [titulo, setTitulo] = useState('');
  const [msg, setMsg] = useState('');
  const [destino, setDestino] = useState<'todos' | 'plano'>('todos');
  const [planoFiltro, setPlanoFiltro] = useState('pro');
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [aba, setAba] = useState<'novo' | 'historico'>('novo');

  useEffect(() => {
    const unsub = firestore()
      .collection('comunicados')
      .orderBy('criadoEm', 'desc')
      .limit(20)
      .onSnapshot(
        snap => setHistorico(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        () => {}
      );
    return unsub;
  }, []);

  const enviar = async () => {
    if (!titulo.trim() || !msg.trim()) {
      Alert.alert('Atenção', 'Preencha título e mensagem.');
      return;
    }

    Alert.alert(
      'Confirmar envio',
      `Enviar para: ${destino === 'todos' ? 'TODOS os estabelecimentos' : `plano ${planoFiltro.toUpperCase()}`}\n\nTítulo: ${titulo}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            setEnviando(true);
            try {
              // ✅ Busca todos os admins
              const adminsSnap = await firestore().collection('admins').get();
              const admins = adminsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

              let destinatarios = admins;

              // ✅ Filtra por plano se necessário
              if (destino === 'plano') {
                const estabsSnap = await firestore()
                  .collection('estabelecimentos')
                  .where('plano', '==', planoFiltro)
                  .where('assinaturaAtiva', '==', true)
                  .get();
                const adminIds = new Set(estabsSnap.docs.map(d => d.data().adminId));
                destinatarios = admins.filter(a => adminIds.has(a.id));
              }

              // ✅ Cria notificações em batch
              const batch = firestore().batch();
              let enviados = 0;

              for (const a of destinatarios) {
                const ref = firestore().collection('notificacoes').doc();
                batch.set(ref, {
                  adminId: a.id,
                  titulo,
                  msg,
                  tipo: 'comunicado',
                  lida: false,
                  apagada: false,
                  criadoEm: firestore.FieldValue.serverTimestamp(),
                });
                enviados++;
              }

              // ✅ Salva no histórico de comunicados
              const comunicadoRef = firestore().collection('comunicados').doc();
              batch.set(comunicadoRef, {
                titulo,
                msg,
                destino,
                planoFiltro: destino === 'plano' ? planoFiltro : null,
                totalEnviados: enviados,
                criadoEm: firestore.FieldValue.serverTimestamp(),
              });

              await batch.commit();

              Alert.alert('✅ Enviado!', `Comunicado enviado para ${enviados} estabelecimento(s)!`);
              setTitulo('');
              setMsg('');
              setAba('historico');
            } catch (e) {
              console.error(e);
              Alert.alert('Erro', 'Não foi possível enviar o comunicado.');
            } finally {
              setEnviando(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK} />

      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitulo}>📢 Comunicados</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ABAS */}
      <View style={s.abas}>
        {([['novo', '✍️ Novo'], ['historico', '📋 Histórico']] as [string, string][]).map(([k, l]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setAba(k as any)}
            style={[s.aba, aba === k && s.abaAtiva]}
          >
            <Text style={[s.abaText, aba === k && s.abaTextAtiva]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {aba === 'novo' ? (
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* MODELOS RÁPIDOS */}
          <Text style={s.label}>MODELOS RÁPIDOS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 20 }}
          >
            {MODELOS.map((m, i) => (
              <TouchableOpacity
                key={i}
                style={s.modeloCard}
                onPress={() => { setTitulo(m.titulo); setMsg(m.msg); }}
              >
                <Text style={s.modeloTitulo}>{m.titulo}</Text>
                <Text style={s.modeloMsg} numberOfLines={2}>{m.msg}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* DESTINO */}
          <Text style={s.label}>DESTINO</Text>
          <View style={s.destinoRow}>
            {[
              { k: 'todos', l: '🌍 Todos' },
              { k: 'plano', l: '💎 Por plano' },
            ].map(({ k, l }) => (
              <TouchableOpacity
                key={k}
                onPress={() => setDestino(k as any)}
                style={[s.destinoChip, destino === k && s.destinoChipAtivo]}
              >
                <Text style={[s.destinoText, destino === k && s.destinoTextAtivo]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* FILTRO DE PLANO */}
          {destino === 'plano' && (
            <View style={s.planoRow}>
              {['essencial', 'pro', 'elite', 'trial'].map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPlanoFiltro(p)}
                  style={[s.planoChip, planoFiltro === p && s.planoChipAtivo]}
                >
                  <Text style={[s.planoChipText, planoFiltro === p && { color: '#000' }]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* TÍTULO */}
          <Text style={s.label}>TÍTULO</Text>
          <TextInput
            style={s.input}
            placeholder="Ex: 🎉 Nova funcionalidade!"
            placeholderTextColor="#333"
            value={titulo}
            onChangeText={setTitulo}
            maxLength={80}
          />
          <Text style={s.charCount}>{titulo.length}/80</Text>

          {/* MENSAGEM */}
          <Text style={s.label}>MENSAGEM</Text>
          <TextInput
            style={[s.input, s.inputMulti]}
            placeholder="Digite a mensagem para os estabelecimentos..."
            placeholderTextColor="#333"
            value={msg}
            onChangeText={setMsg}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={s.charCount}>{msg.length}/500</Text>

          {/* PREVIEW */}
          {(titulo || msg) ? (
            <View style={s.preview}>
              <Text style={s.previewLabel}>PREVIEW</Text>
              <View style={s.previewCard}>
                <Text style={s.previewTitulo}>{titulo || 'Título...'}</Text>
                <Text style={s.previewMsg}>{msg || 'Mensagem...'}</Text>
              </View>
            </View>
          ) : null}

          {/* BOTÃO ENVIAR */}
          <TouchableOpacity
            style={[s.btnEnviar, (enviando || !titulo || !msg) && s.btnDisabled]}
            onPress={enviar}
            disabled={enviando || !titulo || !msg}
          >
            {enviando
              ? <ActivityIndicator color="#000" />
              : <Text style={s.btnEnviarText}>📢 Enviar Comunicado</Text>
            }
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>

      ) : (
        <FlatList
          data={historico}
          keyExtractor={item => item.id}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.vazio}>
              <Text style={s.vazioEmoji}>📋</Text>
              <Text style={s.vazioTitulo}>Nenhum comunicado ainda</Text>
              <Text style={s.vazioSub}>Os comunicados enviados aparecerão aqui</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.historicoCard}>
              <View style={s.historicoTop}>
                <Text style={s.historicoTitulo} numberOfLines={1}>{item.titulo}</Text>
                <View style={s.historicoBadge}>
                  <Text style={s.historicoBadgeText}>{item.totalEnviados} enviados</Text>
                </View>
              </View>
              <Text style={s.historicoMsg} numberOfLines={2}>{item.msg}</Text>
              <View style={s.historicoRodape}>
                <Text style={s.historicoData}>
                  {item.criadoEm?.toDate?.()?.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  }) || 'Processando...'}
                </Text>
                <View style={s.destinoBadge}>
                  <Text style={s.destinoBadgeText}>
                    {item.planoFiltro ? `Plano ${item.planoFiltro.toUpperCase()}` : 'Todos'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 56,
    paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
  },
  backBtn: {
    backgroundColor: '#1A1A1A', width: 40, height: 40,
    borderRadius: 20, justifyContent: 'center', alignItems: 'center',
  },
  backIcon: { color: GOLD, fontSize: 20 },
  headerTitulo: { color: '#FFF', fontSize: 17, fontWeight: '800' },

  abas: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  aba: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  abaAtiva: { borderBottomWidth: 2, borderBottomColor: GOLD },
  abaText: { color: '#555', fontSize: 13, fontWeight: '600' },
  abaTextAtiva: { color: GOLD, fontWeight: '800' },

  scroll: { padding: 16 },
  label: { color: GOLD, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },

  modeloCard: {
    backgroundColor: '#111', borderRadius: 14, padding: 14,
    marginRight: 10, width: 200,
    borderWidth: 1, borderColor: '#1A1A1A',
  },
  modeloTitulo: { color: '#FFF', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  modeloMsg: { color: '#555', fontSize: 11, lineHeight: 16 },

  destinoRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  destinoChip: {
    flex: 1, padding: 12, borderRadius: 12,
    backgroundColor: '#111', alignItems: 'center',
    borderWidth: 1, borderColor: '#1A1A1A',
  },
  destinoChipAtivo: { backgroundColor: GOLD, borderColor: GOLD },
  destinoText: { color: '#666', fontSize: 13, fontWeight: '600' },
  destinoTextAtivo: { color: '#000', fontWeight: '800' },

  planoRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  planoChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1A1A1A',
  },
  planoChipAtivo: { backgroundColor: GOLD, borderColor: GOLD },
  planoChipText: { color: '#666', fontSize: 11, fontWeight: '700' },

  input: {
    backgroundColor: '#111', borderRadius: 14, padding: 16,
    color: '#FFF', fontSize: 14,
    borderWidth: 1, borderColor: '#1A1A1A', marginBottom: 4,
  },
  inputMulti: { minHeight: 120, textAlignVertical: 'top' },
  charCount: { color: '#333', fontSize: 11, textAlign: 'right', marginBottom: 16 },

  preview: { marginBottom: 20 },
  previewLabel: { color: GOLD, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  previewCard: {
    backgroundColor: '#111', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#1A1A1A',
    borderLeftWidth: 3, borderLeftColor: GOLD,
  },
  previewTitulo: { color: '#FFF', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  previewMsg: { color: '#888', fontSize: 13, lineHeight: 20 },

  btnEnviar: {
    backgroundColor: GOLD, borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { backgroundColor: '#222' },
  btnEnviarText: { color: '#000', fontSize: 15, fontWeight: '900' },

  historicoCard: {
    backgroundColor: '#111', borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#1A1A1A',
  },
  historicoTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  historicoTitulo: { color: '#FFF', fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  historicoBadge: {
    backgroundColor: 'rgba(201,169,110,0.12)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  historicoBadgeText: { color: GOLD, fontSize: 10, fontWeight: '700' },
  historicoMsg: { color: '#666', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  historicoRodape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historicoData: { color: '#333', fontSize: 10 },
  destinoBadge: {
    backgroundColor: '#1A1A1A', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 8,
  },
  destinoBadgeText: { color: '#555', fontSize: 10, fontWeight: '600' },

  vazio: { alignItems: 'center', paddingVertical: 80 },
  vazioEmoji: { fontSize: 48, marginBottom: 12 },
  vazioTitulo: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  vazioSub: { color: '#444', fontSize: 13, textAlign: 'center' },
});