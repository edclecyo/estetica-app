import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, Switch, Image, Dimensions, Platform, PermissionsAndroid
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import type { Servico, Agendamento } from '../types';
import { launchImageLibrary } from "react-native-image-picker";
import storage from "@react-native-firebase/storage";

const { width } = Dimensions.get('window');

const EMOJIS = [
  '✂️', '💇', '💇‍♂️', '💇‍♀️', '💈', '🪮', '🧔🏻‍♂️', '🧴', '🚿',
  '💅', '💅🏾', '💅🏼', '🎨', '🖌️', '🧤',
  '💄', '💋', '👄', '👁️', '✨', '🎭', '💉', '📏',
  '🌿', '🧘', '💆', '💆‍♂️', '💆‍♀️', '🛁', '🧖‍♀️', '🧖‍♂️', '🌸', '🕯️', '🍵', '🎋', '🐚',
  '👙', '🪒', '🍯', '🦵', '🌡️', '⭐', '💎', '👑', '📸', '📍', '🔥', '🖋️', '🐉', '🩸'
];

const TIPOS = [
  'Salão de Beleza', 'Barbearia Premium', 'Espaço de Unhas', 'Manicure & Pedicure',
  'Clínica de Estética', 'Estética Avançada', 'Spa & Relaxamento', 'Especialista em Cabelos',
  'Terapia Capilar', 'Estúdio de Maquiagem', 'Design de Sobrancelhas', 'Extensão de Cílios',
  'Micropigmentação', 'Depilação a Laser', 'Depilação com Cera', 'Estúdio de Tatuagem',
  'Body Piercing', 'Massoterapia', 'Bronzeamento Artificial', 'Podologia'
];

const PRESETS_CORES = [
  '#C9A96E', '#D4A5A5', '#A5BDD4', '#A5D4B5', '#C4A5D4',
  '#1A1A1A', '#FF5F5F', '#4CAF50', '#2196F3', '#FFFFFF'
];

export default function AdminEstabScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { admin } = useAuth();
  const { estabelecimentoId } = route.params;
  const isNovo = estabelecimentoId === 'novo';

  const fn = useMemo(() => functions(), []);
  const mapRef = useRef<MapView>(null);

  const [aba, setAba] = useState<'info' | 'servicos' | 'horarios' | 'agenda'>('info');
  const [loading, setLoading] = useState(!isNovo);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoEnd, setBuscandoEnd] = useState(false);

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [bairro, setBairro] = useState('');
  const [numero, setNumero] = useState('');
  const [cidade, setCidade] = useState('');
  const [telefone, setTelefone] = useState('');
  const [descricao, setDescricao] = useState('');
  const [horarioFunc, setHorarioFunc] = useState('08:00 - 20:00');
  const [img, setImg] = useState('✨');

  const [r, setR] = useState(212);
  const [g, setG] = useState(165);
  const [b, setB] = useState(165);
  const [cor, setCor] = useState('#D4A5A5');

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [horarios, setHorarios] = useState<string[]>([]);
  const [agends, setAgends] = useState<Agendamento[]>([]);
  const [fotoPerfil, setFotoPerfil] = useState('');
  const [fotoCapa, setFotoCapa] = useState('');

  const [coords, setCoords] = useState({ lat: -8.0, lng: -35.0 });
  const [coordsOk, setCoordsOk] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [gInicio, setGInicio] = useState('08:00');
  const [gFim, setGFim] = useState('18:00');
  const [gIntervalo, setGIntervalo] = useState('60');
  
  // States para Novo Serviço
  const [nsNome, setNsNome] = useState('');
  const [nsPreco, setNsPreco] = useState('');
  const [nsDuracao, setNsDuracao] = useState('');
  const [nsFoto, setNsFoto] = useState('');
  const [subindoFotoServico, setSubindoFotoServico] = useState(false);

  const stats = useMemo(() => {
    const concluido = agends.filter(a => a.status === 'concluido').reduce((acc, curr) => acc + (curr.servicoPreco || 0), 0);
    const pendente = agends.filter(a => a.status === 'confirmado').reduce((acc, curr) => acc + (curr.servicoPreco || 0), 0);
    return { concluido, pendente, total: concluido + pendente };
  }, [agends]);

  useEffect(() => {
    const obter = async () => {
      if (Platform.OS === 'android') {
        try {
          const ok = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (ok !== PermissionsAndroid.RESULTS.GRANTED) return;
        } catch { return; }
      }
      try {
        navigator.geolocation?.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setUserLocation(loc);
            if (isNovo && !coordsOk) {
              setCoords(loc);
              setCoordsOk(true);
            }
          },
          (err) => console.log('GPS erro', err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } catch { }
    };
    obter();
  }, []);

  const geocodificarEndereco = async (rua: string, cid: string, n: string, bairo: string) => {
    if (!rua || !cid) return;
    try {
      const query = encodeURIComponent(`${rua}, ${n}, ${bairo}, ${cid}, Brasil`);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&accept-language=pt-BR&countrycodes=br`,
        { headers: { 'User-Agent': 'EsteticaApp/1.0' } }
      );
      const data = await res.json();
      if (data?.length > 0) {
        const novaCoord = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setCoords(novaCoord);
        setCoordsOk(true);
        mapRef.current?.animateToRegion({
          latitude: novaCoord.lat,
          longitude: novaCoord.lng,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        }, 800);
      }
    } catch { }
    finally { setBuscandoEnd(false); }
  };

  const handleCepChange = async (text: string) => {
    const cleanCep = text.replace(/\D/g, '');
    setCep(cleanCep);
    if (cleanCep.length === 8) {
      try {
        setBuscandoCep(true);
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setEndereco(data.logradouro);
          setBairro(data.bairro);
          setCidade(data.localidade);
          await geocodificarEndereco(data.logradouro, data.localidade, numero, data.bairro);
        } else {
          Alert.alert("Erro", "CEP não encontrado.");
        }
      } catch {
        Alert.alert("Erro", "Falha ao consultar o CEP.");
      } finally {
        setBuscandoCep(false);
      }
    }
  };

  const updateHex = (red: number, green: number, blue: number) => {
    const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
    setCor(`#${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase());
  };

  const gerarGradeHorarios = () => {
    const lista: string[] = [];
    let atual = new Date(`2026-01-01T${gInicio}:00`);
    const fim = new Date(`2026-01-01T${gFim}:00`);
    if (isNaN(atual.getTime()) || isNaN(fim.getTime())) { Alert.alert('Erro', 'Use HH:MM'); return; }
    while (atual <= fim) {
      lista.push(`${atual.getHours().toString().padStart(2,'0')}:${atual.getMinutes().toString().padStart(2,'0')}`);
      atual.setMinutes(atual.getMinutes() + Number(gIntervalo));
    }
    setHorarios(Array.from(new Set([...horarios, ...lista])).sort());
    Alert.alert('Sucesso ✅', `${lista.length} horários adicionados!`);
  };

  useEffect(() => {
    if (!isNovo) {
      firestore().collection('estabelecimentos').doc(estabelecimentoId).get().then(snap => {
        if (snap.exists) {
          const d = snap.data() as any;
          setNome(d.nome); setTipo(d.tipo); setEndereco(d.endereco);
          setCep(d.cep || ''); setBairro(d.bairro || ''); setNumero(d.numero || '');
          setCidade(d.cidade); setTelefone(d.telefone); setDescricao(d.descricao);
          setHorarioFunc(d.horarioFuncionamento); setImg(d.img); setCor(d.cor);
          setServicos(d.servicos || []); setHorarios(d.horarios || []);
          setFotoPerfil(d.fotoPerfil || ''); setFotoCapa(d.fotoCapa || '');
          if (d.lat && d.lng) {
            setCoords({ lat: d.lat, lng: d.lng });
            setCoordsOk(true);
          }
          if (d.cor?.startsWith('#')) {
            setR(parseInt(d.cor.slice(1, 3), 16));
            setG(parseInt(d.cor.slice(3, 5), 16));
            setB(parseInt(d.cor.slice(5, 7), 16));
          }
        }
        setLoading(false);
      }).catch(() => setLoading(false));

      const unsub = firestore().collection('agendamentos')
        .where('estabelecimentoId', '==', estabelecimentoId)
        .onSnapshot(
          snap => setAgends(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Agendamento[]),
          err => console.log('Agendamentos error:', err)
        );
      return unsub;
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (coordsOk) {
      setTimeout(() => {
        mapRef.current?.animateToRegion({
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 800);
      }, 500);
    }
  }, [coordsOk]);

  const salvar = async () => {
    if (!nome || !endereco || !cidade) { Alert.alert('Atenção', 'Nome, endereço e cidade são obrigatórios.'); return; }
    try {
      setSalvando(true);
      await fn.httpsCallable('salvarEstabelecimento')({
        estabelecimentoId: isNovo ? undefined : estabelecimentoId,
        nome, tipo, endereco, cep, bairro, numero, cidade, telefone, descricao,
        horarioFuncionamento: horarioFunc, img, cor, servicos, horarios,
        fotoPerfil, fotoCapa, avaliacao: 5.0, ativo: true,
        lat: coords.lat, lng: coords.lng
      });
      Alert.alert('Sucesso! ✅', isNovo ? 'Criado!' : 'Atualizado!', [{ text: 'OK', onPress: () => isNovo && navigation.goBack() }]);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao salvar.');
    } finally { setSalvando(false); }
  };

  const escolherImagem = async (tipoImg: 'perfil' | 'capa') => {
    if (isNovo) { Alert.alert("Aviso", "Salve o local antes de adicionar fotos."); return; }
    const res = await launchImageLibrary({ mediaType: "photo", quality: 0.5 });
    if (!res.assets || !res.assets[0]) return;
    const uri = res.assets[0].uri;
    const extension = uri?.split('.').pop();
    const path = `estabelecimentos/${estabelecimentoId}/${tipoImg}.${extension}`;
    const reference = storage().ref(path);
    try {
      setSalvando(true);
      await reference.putFile(uri!);
      const url = await reference.getDownloadURL();
      if (tipoImg === 'perfil') { setFotoPerfil(url); setImg(url); } else { setFotoCapa(url); }
      await firestore().collection('estabelecimentos').doc(estabelecimentoId).update({
        [tipoImg === 'perfil' ? 'fotoPerfil' : 'fotoCapa']: url,
        img: tipoImg === 'perfil' ? url : img
      });
      Alert.alert("Sucesso! ✅", "Foto atualizada.");
    } catch { Alert.alert("Erro", "Falha no upload."); } finally { setSalvando(false); }
  };

  // Função para escolher foto do serviço
  const escolherFotoServico = async () => {
    const res = await launchImageLibrary({ mediaType: "photo", quality: 0.4 });
    if (!res.assets || !res.assets[0]) return;
    
    if (isNovo) {
      setNsFoto(res.assets[0].uri!);
      return;
    }

    const uri = res.assets[0].uri;
    const path = `estabelecimentos/${estabelecimentoId}/servicos/${Date.now()}.jpg`;
    const reference = storage().ref(path);
    
    try {
      setSubindoFotoServico(true);
      await reference.putFile(uri!);
      const url = await reference.getDownloadURL();
      setNsFoto(url);
    } catch {
      Alert.alert("Erro", "Upload da foto do serviço falhou.");
    } finally {
      setSubindoFotoServico(false);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#C9A96E" /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}><Text style={s.backIcon}>✕</Text></TouchableOpacity>
        <View style={s.headerTitleContainer}>
          <Text style={[s.headerLabel, { color: cor }]}>{isNovo ? 'NOVO LOCAL' : tipo.toUpperCase()}</Text>
          <Text style={s.headerTitle} numberOfLines={1}>{isNovo ? 'Criar Cadastro' : nome}</Text>
        </View>
        <TouchableOpacity onPress={salvar} disabled={salvando} style={[s.saveBtn, { backgroundColor: cor }]}>
          {salvando ? <ActivityIndicator size="small" color="#111" /> : <Text style={s.saveBtnText}>Salvar</Text>}
        </TouchableOpacity>
      </View>

      {!isNovo && (
        <View style={s.statsContainer}>
          <View style={s.statsInner}>
            <View style={{ flex: 1 }}>
              <View style={s.rowBetween}>
                <Text style={s.statLabel}>Financeiro (Concluído / Previsto)</Text>
                <Text style={[s.statValue, { color: cor }]}>R$ {stats.total}</Text>
              </View>
              <View style={s.barContainer}>
                <View style={[s.bar, { flex: stats.concluido || 0.1, backgroundColor: '#4CAF50' }]} />
                <View style={[s.bar, { flex: stats.pendente || 0.1, backgroundColor: cor + '66' }]} />
              </View>
              <View style={s.rowBetween}>
                <Text style={s.miniLabel}>R$ {stats.concluido} em caixa</Text>
                <Text style={s.miniLabel}>{agends.length} agendamentos</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      <View style={s.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsContent}>
          {([['info','Informações'],['servicos','Serviços'],['horarios','Horários'],['agenda','Agenda']] as const)
            .filter(([k]) => !isNovo || k !== 'agenda')
            .map(([k, l]) => (
              <TouchableOpacity key={k} onPress={() => setAba(k)} style={[s.tabItem, aba === k && { backgroundColor: cor, borderColor: cor }]}>
                <Text style={[s.tabText, aba === k && { color: '#111' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
      </View>

      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {aba === 'info' && (
          <View>
            <Text style={s.sectionTitle}>Aparência & Identidade</Text>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <View style={s.emojiContainer}>
                  <Text style={s.inputLabel}>ÍCONE PRINCIPAL</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.emojiList}>
                    {EMOJIS.map((e, i) => (
                      <TouchableOpacity key={`${e}-${i}`} onPress={() => setImg(e)} style={[s.emojiBtn, img === e && { borderColor: cor, backgroundColor: cor + '44', borderWidth: 2 }]}>
                        <Text style={s.emojiTxt}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={[s.colorPreview, { backgroundColor: cor }]} />
              </View>

              <Text style={[s.inputLabel, { marginTop: 25 }]}>MIXER DE CORES</Text>
              <View style={s.mixerContainer}>
                {[['R', r, setR, '#FF4444'], ['G', g, setG, '#4CAF50'], ['B', b, setB, '#2196F3']].map(([l, val, setVal, color]: any) => (
                  <View key={l} style={s.mixerRow}>
                    <Text style={[s.mixerLabel, { color }]}>{l}</Text>
                    <Slider style={{ flex: 1, height: 40 }} minimumValue={0} maximumValue={255} value={val} minimumTrackTintColor={color}
                      onValueChange={(v) => { setVal(v); updateHex(l === 'R' ? v : r, l === 'G' ? v : g, l === 'B' ? v : b); }} />
                    <Text style={s.mixerValue}>{Math.round(val)}</Text>
                  </View>
                ))}
              </View>

              <View style={s.colorGrid}>
                {PRESETS_CORES.map(c => (
                  <TouchableOpacity key={c} onPress={() => { setCor(c); setR(parseInt(c.slice(1,3),16)); setG(parseInt(c.slice(3,5),16)); setB(parseInt(c.slice(5,7),16)); }}
                    style={[s.colorCircle, { backgroundColor: c }, cor === c && s.colorActive]} />
                ))}
              </View>
            </View>

            <Text style={s.sectionTitle}>Logomarca</Text>
            <View style={s.photoRow}>
              <TouchableOpacity onPress={() => escolherImagem('perfil')} style={s.photoBox}>
                {fotoPerfil ? <Image source={{ uri: fotoPerfil }} style={s.imgFill} /> : <Text style={s.photoAdd}>＋ Logomarca</Text>}
              </TouchableOpacity>
            </View>

            <Text style={s.sectionTitle}>Dados Gerais</Text>
            <View style={s.card}>
              <View style={s.inputBox}>
                <Text style={s.inputLabel}>NOME DO ESTABELECIMENTO</Text>
                <TextInput style={s.input} value={nome} onChangeText={setNome} placeholderTextColor="#444" />
              </View>

              <Text style={s.inputLabel}>TIPO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.typeList}>
                {TIPOS.map(t => (
                  <TouchableOpacity key={t} onPress={() => setTipo(t)} style={[s.typeChip, tipo === t && { borderColor: cor, backgroundColor: cor + '22' }]}>
                    <Text style={[s.typeChipTxt, tipo === t && { color: cor, fontWeight: '900' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={s.row}>
                <View style={[s.inputBox, { flex: 2, marginRight: 10 }]}>
                  <Text style={s.inputLabel}>
                    CEP {(buscandoCep || buscandoEnd) && <ActivityIndicator size="small" color={cor} />}
                  </Text>
                  <TextInput style={s.input} value={cep} onChangeText={handleCepChange} maxLength={8} keyboardType="numeric" placeholderTextColor="#444" />
                </View>
                <View style={[s.inputBox, { flex: 1 }]}>
                  <Text style={s.inputLabel}>Nº</Text>
                  <TextInput style={s.input} value={numero} onChangeText={setNumero} keyboardType="numeric" placeholderTextColor="#444"
                    onBlur={() => geocodificarEndereco(endereco, cidade, numero, bairro)} />
                </View>
              </View>

              <View style={s.inputBox}>
                <Text style={s.inputLabel}>ENDEREÇO (RUA)</Text>
                <TextInput style={s.input} value={endereco} onChangeText={setEndereco} placeholderTextColor="#444"
                  onBlur={() => geocodificarEndereco(endereco, cidade, numero, bairro)} />
              </View>

              <View style={s.row}>
                <View style={[s.inputBox, { flex: 1, marginRight: 10 }]}>
                  <Text style={s.inputLabel}>BAIRRO</Text>
                  <TextInput style={s.input} value={bairro} onChangeText={setBairro} placeholderTextColor="#444"
                    onBlur={() => geocodificarEndereco(endereco, cidade, numero, bairro)} />
                </View>
                <View style={[s.inputBox, { flex: 1 }]}>
                  <Text style={s.inputLabel}>CIDADE</Text>
                  <TextInput style={s.input} value={cidade} onChangeText={setCidade} placeholderTextColor="#444"
                    onBlur={() => geocodificarEndereco(endereco, cidade, numero, bairro)} />
                </View>
              </View>

              <View style={s.inputBox}>
                <Text style={s.inputLabel}>TEL</Text>
                <TextInput style={s.input} value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" placeholderTextColor="#444" />
              </View>

              <Text style={[s.inputLabel, { marginTop: 10 }]}>
                LOCALIZAÇÃO NO MAPA {buscandoEnd && <ActivityIndicator size="small" color={cor} />}
              </Text>
              <Text style={s.mapHint}>Arraste o pino para ajustar a posição exata</Text>

              <View style={s.mapCard}>
                {coordsOk ? (
                  <MapView
                    ref={mapRef}
                    style={s.map}
                    provider={PROVIDER_GOOGLE}
                    showsUserLocation={false}
                    showsMyLocationButton={false}
                    customMapStyle={[{ elementType: 'labels', stylers: [{ languageOverride: 'pt-BR' }] }]}
                    region={{
                      latitude: coords.lat,
                      longitude: coords.lng,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    }}
                  >
                    {userLocation && (
                      <Marker
                        coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }}
                        title="Você está aqui"
                        pinColor="#2196F3"
                      />
                    )}
                    <Marker
                      coordinate={{ latitude: coords.lat, longitude: coords.lng }}
                      draggable
                      onDragEnd={(e) => setCoords({
                        lat: e.nativeEvent.coordinate.latitude,
                        lng: e.nativeEvent.coordinate.longitude,
                      })}
                      pinColor={cor}
                      title={nome || "Estabelecimento"}
                    />
                  </MapView>
                ) : (
                  <View style={s.mapPlaceholder}>
                    <Text style={s.mapPlaceholderText}>
                      {buscandoEnd ? '🔍 Buscando localização...' : '📍 Digite o endereço para ver no mapa'}
                    </Text>
                  </View>
                )}
              </View>

              {userLocation && (
                <TouchableOpacity
                  onPress={() => {
                    setCoords(userLocation);
                    setCoordsOk(true);
                    mapRef.current?.animateToRegion({
                      latitude: userLocation.lat,
                      longitude: userLocation.lng,
                      latitudeDelta: 0.003,
                      longitudeDelta: 0.003,
                    }, 600);
                  }}
                  style={[s.btnMinhaLoc, { borderColor: cor }]}
                >
                  <Text style={[s.btnMinhaLocText, { color: cor }]}>📍 Usar minha localização atual</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {aba === 'servicos' && (
          <View>
            <Text style={s.sectionTitle}>Novo Serviço</Text>
            <View style={s.card}>
              <View style={s.row}>
                {/* Seleção de Foto do Serviço */}
                <TouchableOpacity 
                  onPress={escolherFotoServico} 
                  style={[s.nsFotoBox, { borderColor: cor + '44' }]}
                >
                  {subindoFotoServico ? (
                    <ActivityIndicator size="small" color={cor} />
                  ) : nsFoto ? (
                    <Image source={{ uri: nsFoto }} style={s.imgFill} />
                  ) : (
                    <Text style={s.nsFotoAdd}>📸</Text>
                  )}
                </TouchableOpacity>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <TextInput 
                    style={s.input} 
                    value={nsNome} 
                    onChangeText={setNsNome} 
                    placeholder="Nome do serviço" 
                    placeholderTextColor="#444" 
                  />
                  <View style={[s.row, { marginTop: 10 }]}>
                    <TextInput style={[s.input, { flex: 1, marginRight: 8 }]} value={nsPreco} onChangeText={setNsPreco} placeholder="R$" keyboardType="numeric" placeholderTextColor="#444" />
                    <TextInput style={[s.input, { flex: 1 }]} value={nsDuracao} onChangeText={setNsDuracao} placeholder="Min" keyboardType="numeric" placeholderTextColor="#444" />
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (!nsNome || !nsPreco) return;
                  setServicos([...servicos, { 
                    id: Date.now().toString(), 
                    nome: nsNome, 
                    preco: Number(nsPreco), 
                    duracao: Number(nsDuracao) || 30, 
                    ativo: true,
                    foto: nsFoto // Adiciona a foto ao objeto do serviço
                  }]);
                  setNsNome(''); setNsPreco(''); setNsDuracao(''); setNsFoto('');
                }}
                style={[s.btnAdd, { borderColor: cor, marginTop: 15 }]}
              >
                <Text style={[s.btnAddText, { color: cor }]}>Adicionar à Lista</Text>
              </TouchableOpacity>
            </View>

            {servicos.map(item => (
              <View key={item.id} style={s.itemCard}>
                {item.foto ? (
                  <Image source={{ uri: item.foto }} style={s.itemThumb} />
                ) : (
                  <View style={[s.itemThumb, { backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 18 }}>{img.length < 3 ? img : '✨'}</Text>
                  </View>
                )}
                
                <View style={s.itemInfo}>
                  <Text style={s.itemTitle}>{item.nome}</Text>
                  <Text style={s.itemSub}>R$ {item.preco} • {item.duracao} min</Text>
                </View>

                <Switch 
                  value={item.ativo} 
                  onValueChange={() => setServicos(servicos.map(x => x.id === item.id ? { ...x, ativo: !x.ativo } : x))} 
                  trackColor={{ false: '#333', true: cor + '66' }}
                  thumbColor={item.ativo ? cor : '#666'} 
                />
                
                <TouchableOpacity onPress={() => setServicos(servicos.filter(x => x.id !== item.id))} style={s.itemRemove}>
                  <Text style={{ color: '#FF4444', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {aba === 'horarios' && (
          <View>
            <Text style={s.sectionTitle}>Grade Automática</Text>
            <View style={s.card}>
              <View style={s.row}>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={s.miniLabel}>INÍCIO</Text><TextInput style={s.input} value={gInicio} onChangeText={setGInicio} placeholderTextColor="#444" /></View>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={s.miniLabel}>FIM</Text><TextInput style={s.input} value={gFim} onChangeText={setGFim} placeholderTextColor="#444" /></View>
                <View style={{ flex: 1 }}><Text style={s.miniLabel}>MINS</Text><TextInput style={s.input} value={gIntervalo} onChangeText={setGIntervalo} keyboardType="numeric" placeholderTextColor="#444" /></View>
              </View>
              <TouchableOpacity onPress={gerarGradeHorarios} style={[s.btnAdd, { backgroundColor: cor, marginTop: 15 }]}>
                <Text style={[s.btnAddText, { color: '#111' }]}>Gerar Horários</Text>
              </TouchableOpacity>
            </View>
            <View style={s.horariosGrid}>
              {horarios.map(h => {
                const ocupado = agends.some(a => a.horario === h && a.status === 'confirmado');
                return (
                  <TouchableOpacity key={h} onPress={() => ocupado ? Alert.alert("Ocupado") : setHorarios(horarios.filter(x => x !== h))}
                    style={[s.timeChip, { borderColor: ocupado ? '#FF4444' : cor + '44', backgroundColor: ocupado ? '#FF444422' : 'transparent' }]}>
                    <Text style={[s.timeText, ocupado && { color: '#FF4444' }]}>{h}</Text>
                    {!ocupado && <Text style={s.timeRemove}>✕</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {aba === 'agenda' && (
          <View>
            {agends.length === 0 ? <Text style={s.emptyText}>Nenhum agendamento.</Text> : agends.map(ag => (
              <View key={ag.id} style={s.agendCard}>
                <View style={s.agendHeader}>
                  <Text style={s.agendClient}>{ag.clienteNome}</Text>
                  <Text style={[s.agendPrice, { color: cor }]}>R$ {ag.servicoPreco}</Text>
                </View>
                <Text style={s.agendServ}>{ag.servicoNome}</Text>
                <View style={s.agendMeta}>
                  <Text style={s.agendDate}>📅 {ag.data} - {ag.horario}</Text>
                  <div style={[s.statusBadge, { backgroundColor: ag.status === 'concluido' ? '#4CAF50' : '#222' }]}>
                    <Text style={s.statusTxt}>{ag.status?.toUpperCase()}</Text>
                  </div>
                </View>
                {ag.status === 'confirmado' && (
                  <View style={[s.row, { gap: 10, marginTop: 15 }]}>
                    <TouchableOpacity onPress={() => fn.httpsCallable('concluirAgendamento')({ agendamentoId: ag.id })} style={[s.actionBtn, { borderColor: '#4CAF50' }]}>
                      <Text style={{ color: '#4CAF50', fontWeight: '900' }}>CONCLUIR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => fn.httpsCallable('cancelarAgendamento')({ agendamentoId: ag.id })} style={[s.actionBtn, { borderColor: '#FF4444' }]}>
                      <Text style={{ color: '#FF4444', fontWeight: '900' }}>CANCELAR</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', borderBottomWidth: 1, borderBottomColor: '#222' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: '#888', fontSize: 18 },
  headerTitleContainer: { flex: 1, paddingHorizontal: 15 },
  headerLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  saveBtnText: { color: '#111', fontWeight: '800' },
  statsContainer: { paddingHorizontal: 20, marginTop: -20 },
  statsInner: { backgroundColor: '#1A1A1A', borderRadius: 20, padding: 15, elevation: 10 },
  statLabel: { color: '#666', fontSize: 10, fontWeight: '800' },
  statValue: { fontSize: 16, fontWeight: '800' },
  barContainer: { height: 6, flexDirection: 'row', backgroundColor: '#000', borderRadius: 3, marginVertical: 8, overflow: 'hidden' },
  bar: { height: '100%' },
  tabsWrapper: { paddingVertical: 20 },
  tabsContent: { paddingHorizontal: 20, gap: 10 },
  tabItem: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#222' },
  tabText: { color: '#888', fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 20 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 15, marginTop: 10 },
  card: { backgroundColor: '#121212', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  inputBox: { marginBottom: 18 },
  inputLabel: { color: '#555', fontSize: 10, fontWeight: '800', marginBottom: 8 },
  input: { backgroundColor: '#000', borderRadius: 15, padding: 15, color: '#FFF', fontSize: 15, borderWidth: 1, borderColor: '#1A1A1A' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emojiContainer: { flex: 1 },
  emojiList: { marginTop: 10 },
  emojiBtn: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  emojiTxt: { fontSize: 24 },
  colorPreview: { width: 45, height: 45, borderRadius: 22.5, borderWidth: 3, borderColor: '#FFF' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 15 },
  colorCircle: { width: 35, height: 35, borderRadius: 10 },
  colorActive: { borderWidth: 3, borderColor: '#FFF' },
  mixerContainer: { backgroundColor: '#000', padding: 15, borderRadius: 15 },
  mixerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  mixerLabel: { width: 20, fontWeight: 'bold' },
  mixerValue: { width: 30, color: '#FFF', textAlign: 'right', fontSize: 12 },
  photoRow: { flexDirection: 'row', marginBottom: 20 },
  photoBox: { width: 100, height: 100, borderRadius: 20, backgroundColor: '#121212', borderWidth: 1, borderColor: '#222', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  imgFill: { width: '100%', height: '100%' },
  photoAdd: { color: '#666', fontSize: 12, fontWeight: '700' },
  typeList: { marginBottom: 20 },
  typeChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#222', marginRight: 8 },
  typeChipTxt: { color: '#666', fontSize: 12 },
  mapHint: { color: '#444', fontSize: 11, marginBottom: 10 },
  mapCard: { height: 200, borderRadius: 20, overflow: 'hidden', backgroundColor: '#111', borderWidth: 1, borderColor: '#222' },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapPlaceholderText: { color: '#444', fontSize: 12 },
  btnMinhaLoc: { marginTop: 10, padding: 12, borderRadius: 15, borderWidth: 1, alignItems: 'center' },
  btnMinhaLocText: { fontWeight: '700', fontSize: 12 },
  btnAdd: { padding: 15, borderRadius: 15, borderWidth: 1, alignItems: 'center' },
  btnAddText: { fontWeight: '800' },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', borderRadius: 20, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#1A1A1A' },
  itemThumb: { width: 50, height: 50, borderRadius: 12, marginRight: 12, overflow: 'hidden' },
  itemInfo: { flex: 1 },
  itemTitle: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  itemSub: { color: '#666', fontSize: 12, marginTop: 2 },
  itemRemove: { padding: 10, marginLeft: 5 },
  horariosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  timeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  timeText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  timeRemove: { color: '#666', marginLeft: 8, fontSize: 10 },
  miniLabel: { color: '#444', fontSize: 9, fontWeight: '800', marginBottom: 4 },
  emptyText: { color: '#444', textAlign: 'center', marginTop: 40 },
  agendCard: { backgroundColor: '#121212', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  agendHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  agendClient: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  agendPrice: { fontWeight: '800' },
  agendServ: { color: '#888', fontSize: 14, marginBottom: 12 },
  agendMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  agendDate: { color: '#666', fontSize: 12, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusTxt: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  actionBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  nsFotoBox: { width: 80, height: 80, borderRadius: 15, backgroundColor: '#000', borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  nsFotoAdd: { fontSize: 24 }
});