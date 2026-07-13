import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, Switch, Image, Dimensions, Platform, PermissionsAndroid
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import firestore from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import type { Servico, Agendamento } from '../types';
import { launchImageLibrary } from "react-native-image-picker";
import storage from "@react-native-firebase/storage";
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Geolocation from '@react-native-community/geolocation';
import LinearGradient from 'react-native-linear-gradient';

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
  '#C9A96E', // Ouro Clássico
  '#AF935B', // Ouro Envelhecido (Premium)
  '#D4A5A5', // Rose Gold
  '#533483', // Deep Purple
  '#004D40', // Deep Emerald
  '#1C1C1E', // Jet Black
  '#2C2C2E', // Graphite
  '#8B0000', // Blood Red (Vinho)
  '#0F3460', // Midnight Blue
  '#B8860B', // Dark Goldenrod
];

const DIAS_FUNCIONAMENTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_PADRAO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const normalizarHorario = (valor: string) => {
  const partes = String(valor || '').trim().split(':');
  if (partes.length !== 2) return '';

  const hora = Number(partes[0]);
  const minuto = Number(partes[1]);

  if (
    Number.isNaN(hora) ||
    Number.isNaN(minuto) ||
    hora < 0 ||
    hora > 23 ||
    minuto < 0 ||
    minuto > 59
  ) {
    return '';
  }

  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
};

const horarioParaMinutos = (valor: string) => {
  const normalizado = normalizarHorario(valor);
  if (!normalizado) return null;

  const [hora, minuto] = normalizado.split(':').map(Number);
  return hora * 60 + minuto;
};

const minutosParaHorario = (minutos: number) => {
  const hora = Math.floor(minutos / 60);
  const minuto = minutos % 60;

  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
};

const ordenarHorarios = (lista: string[]) =>
  Array.from(new Set(lista.map(normalizarHorario).filter(Boolean))).sort(
    (a, b) => (horarioParaMinutos(a) || 0) - (horarioParaMinutos(b) || 0)
  );

const normalizarDataBR = (valor: string) => {
  const partes = String(valor || '').trim().split('/');
  if (partes.length !== 3) return '';

  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  const ano = Number(partes[2]);
  const data = new Date(ano, mes - 1, dia);

  if (
    Number.isNaN(data.getTime()) ||
    data.getDate() !== dia ||
    data.getMonth() !== mes - 1 ||
    data.getFullYear() !== ano
  ) {
    return '';
  }

  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
};


Geolocation.setRNConfiguration({
  skipPermissionRequests: false,
  authorizationLevel: 'whenInUse',
});
export default function AdminEstabScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { admin } = useAuth();
  const { estabelecimentoId } = route.params;
  const isNovo = estabelecimentoId === 'novo';

 const functionsInstance = useMemo(
  () => getFunctions(getApp(), 'southamerica-east1'),
  []
);
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
  const telefoneCadastro = admin?.telefone?.trim() || '';

  const [gInicio, setGInicio] = useState('08:00');
  const [gFim, setGFim] = useState('18:00');
  const [gIntervalo, setGIntervalo] = useState('30');
  const [pausaAtiva, setPausaAtiva] = useState(true);
  const [pausaInicio, setPausaInicio] = useState('12:00');
  const [pausaFim, setPausaFim] = useState('14:00');
  const [horarioManual, setHorarioManual] = useState('');
  const [diasFuncionamento, setDiasFuncionamento] = useState<string[]>(DIAS_PADRAO);
  const [dataBloqueio, setDataBloqueio] = useState('');
  const [horarioBloqueio, setHorarioBloqueio] = useState('');
  const [diasFechados, setDiasFechados] = useState<string[]>([]);
  const [horariosBloqueados, setHorariosBloqueados] = useState<Record<string, string[]>>({});

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

const gerarGradiente = (hex: string) => {
  const escurecer = (cor: string, fator: number) => {
    const num = parseInt(cor.replace('#', ''), 16);
    let r = Math.floor((num >> 16) * fator);
    let g = Math.floor(((num >> 8) & 0x00FF) * fator);
    let b = Math.floor((num & 0x0000FF) * fator);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Se for uma cor muito escura (como preto), o gradiente deve clarear levemente para dar profundidade
  // Se for uma cor clara, ele escurece.
  return [hex, escurecer(hex, 0.7)];
};
const getContraste = (hex: string) => {
  // Remove o # se existir
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  // Fórmula de luminância padrão (ITU-R BT.709)
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b);

  // Se a luminância for alta (cor clara), retorna preto. Se baixa (cor escura), retorna branco.
  return luminancia > 160 ? '#121212' : '#FFFFFF';
};
 useEffect(() => {
  const obterLocalizacao = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Permissão negada');
          return;
        }
      }
Geolocation.requestAuthorization?.();
      Geolocation.getCurrentPosition(
        (pos) => {
          const loc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };

          console.log('LOCAL ATUAL:', loc);

          setUserLocation(loc);

          // 🔥 ESSA LINHA É A CHAVE
          if (isNovo) {
            setCoords(loc);
            setCoordsOk(true);

            // move o mapa automaticamente
            setTimeout(() => {
              mapRef.current?.animateToRegion({
                latitude: loc.lat,
                longitude: loc.lng,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }, 800);
            }, 500);
          }
        },
        (err) => {
          console.log('Erro GPS:', err);

          // fallback
          const fallback = userLocation || { lat: -7.31, lng: -38.94 };
          setCoords(fallback);
          setCoordsOk(true);
        },
        {
          enableHighAccuracy: false,
          timeout: 30000,
          maximumAge: 10000,
        }
      );
    } catch (e) {
      console.log('Erro geral:', e);
    }
  };

  obterLocalizacao();
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

  const preencherEnderecoPorCoordenadas = async (lat: number, lng: number) => {
    try {
      setBuscandoEnd(true);

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR&addressdetails=1`,
        { headers: { 'User-Agent': 'BeautyHub/1.0' } }
      );
      const data = await res.json();
      const addr = data?.address || {};

      const rua = addr.road || addr.pedestrian || addr.footway || addr.residential;
      const bairroNovo = addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter;
      const cidadeNova = addr.city || addr.town || addr.village || addr.municipality || addr.county;
      const cepNovo = String(addr.postcode || '').replace(/\D/g, '');

      if (rua) setEndereco(rua);
      if (bairroNovo) setBairro(bairroNovo);
      if (cidadeNova) setCidade(cidadeNova);
      if (addr.house_number) setNumero(String(addr.house_number));
      if (cepNovo) setCep(cepNovo);
    } catch (e) {
      console.log('Erro reverse geocode:', e);
    } finally {
      setBuscandoEnd(false);
    }
  };

  const selecionarCoordenada = async (lat: number, lng: number, carregarEndereco = true) => {
    const novaCoord = { lat, lng };

    setCoords(novaCoord);
    setCoordsOk(true);

    mapRef.current?.animateToRegion({
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.003,
      longitudeDelta: 0.003,
    }, 600);

    if (carregarEndereco) {
      await preencherEnderecoPorCoordenadas(lat, lng);
    }
  };

  const usarMinhaLocalizacao = async () => {
    if (userLocation) {
      await selecionarCoordenada(userLocation.lat, userLocation.lng, true);
      return;
    }

    try {
      setBuscandoEnd(true);
      Geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLocation({ lat, lng });
          await selecionarCoordenada(lat, lng, true);
        },
        () => {
          setBuscandoEnd(false);
          Alert.alert('Localização', 'Não foi possível pegar sua localização atual.');
        },
        {
          enableHighAccuracy: false,
          timeout: 30000,
          maximumAge: 10000,
        }
      );
    } catch {
      setBuscandoEnd(false);
      Alert.alert('Localização', 'Não foi possível pegar sua localização atual.');
    }
  };

  useEffect(() => {
    if (loading || !endereco || !cidade) return;

    const timer = setTimeout(() => {
      setBuscandoEnd(true);
      geocodificarEndereco(endereco, cidade, numero, bairro);
    }, 900);

    return () => clearTimeout(timer);
  }, [endereco, cidade, numero, bairro, loading]);

  const handleCepChange = async (text: string) => {
    const cleanCep = text.replace(/\D/g, '');
    setCep(cleanCep);
    if (cleanCep.length === 8 && !buscandoCep) {
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
    const inicio = horarioParaMinutos(gInicio);
    const fim = horarioParaMinutos(gFim);
    const intervalo = Number(gIntervalo);
    const pausaIni = horarioParaMinutos(pausaInicio);
    const pausaFinal = horarioParaMinutos(pausaFim);

    if (
      inicio === null ||
      fim === null ||
      !intervalo ||
      intervalo < 5 ||
      intervalo > 240
    ) {
      Alert.alert('Erro', 'Use horários no formato HH:MM e intervalo entre 5 e 240 minutos.');
      return;
    }

    if (inicio >= fim) {
      Alert.alert('Erro', 'O horário final precisa ser maior que o inicial.');
      return;
    }

    if (pausaAtiva && (pausaIni === null || pausaFinal === null || pausaIni >= pausaFinal)) {
      Alert.alert('Erro', 'Confira o início e fim da pausa.');
      return;
    }

    const lista: string[] = [];

    for (let atual = inicio; atual < fim; atual += intervalo) {
      const dentroDaPausa =
        pausaAtiva &&
        pausaIni !== null &&
        pausaFinal !== null &&
        atual >= pausaIni &&
        atual < pausaFinal;

      if (!dentroDaPausa) {
        lista.push(minutosParaHorario(atual));
      }
    }

    setHorarioFunc(`${normalizarHorario(gInicio)} - ${normalizarHorario(gFim)}`);
    setHorarios(ordenarHorarios(lista));

    Alert.alert('Grade atualizada ✅', `${lista.length} horários disponíveis foram gerados.`);
  };

  const adicionarHorarioManual = () => {
    const horario = normalizarHorario(horarioManual);

    if (!horario) {
      Alert.alert('Erro', 'Use um horário válido no formato HH:MM.');
      return;
    }

    setHorarios(prev => ordenarHorarios([...prev, horario]));
    setHorarioManual('');
  };

  const alternarDiaFuncionamento = (dia: string) => {
    setDiasFuncionamento(prev =>
      prev.includes(dia)
        ? prev.filter(item => item !== dia)
        : [...prev, dia]
    );
  };

  const existeAgendaConfirmada = (data: string, horario?: string) =>
    agends.some(a =>
      a.status === 'confirmado' &&
      a.data === data &&
      (!horario || a.horario === horario)
    );

  const removerHorario = (horario: string, ocupado: boolean) => {
    if (ocupado) {
      Alert.alert(
        'Horário com agenda',
        'Existe agendamento confirmado nesse horário. Cancele ou conclua antes de remover.'
      );
      return;
    }

    setHorarios(prev => prev.filter(item => item !== horario));
  };

  const limparHorariosLivres = () => {
    const ocupados = new Set(
      agends
        .filter(a => a.status === 'confirmado')
        .map(a => a.horario)
    );

    Alert.alert(
      'Limpar horários livres',
      'Isso remove todos os horários sem agenda confirmada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: () =>
            setHorarios(prev =>
              prev.filter(h => ocupados.has(h))
            ),
        },
      ]
    );
  };

  const fecharDataPontual = () => {
    const data = normalizarDataBR(dataBloqueio);

    if (!data) {
      Alert.alert('Erro', 'Informe uma data no formato DD/MM/AAAA.');
      return;
    }

    if (existeAgendaConfirmada(data)) {
      Alert.alert(
        'Data com agenda',
        'Existe agendamento confirmado nessa data. Cancele ou conclua antes de fechar o dia.'
      );
      return;
    }

    setDiasFechados(prev => Array.from(new Set([...prev, data])).sort());
    setDataBloqueio('');
  };

  const bloquearHorarioPontual = () => {
    const data = normalizarDataBR(dataBloqueio);
    const horario = normalizarHorario(horarioBloqueio);

    if (!data || !horario) {
      Alert.alert('Erro', 'Informe data DD/MM/AAAA e horário HH:MM.');
      return;
    }

    if (existeAgendaConfirmada(data, horario)) {
      Alert.alert(
        'Horário com agenda',
        'Existe agendamento confirmado nesse horário. Cancele ou conclua antes de bloquear.'
      );
      return;
    }

    setHorariosBloqueados(prev => ({
      ...prev,
      [data]: ordenarHorarios([...(prev[data] || []), horario]),
    }));

    setDataBloqueio('');
    setHorarioBloqueio('');
  };

  const removerDataFechada = (data: string) => {
    setDiasFechados(prev => prev.filter(item => item !== data));
  };

  const removerBloqueioPontual = (data: string, horario: string) => {
    setHorariosBloqueados(prev => {
      const proximos = {
        ...prev,
        [data]: (prev[data] || []).filter(item => item !== horario),
      };

      if (proximos[data].length === 0) {
        delete proximos[data];
      }

      return proximos;
    });
  };

  useEffect(() => {
if (!isNovo) {
  firestore()
    .collection('estabelecimentos')
    .doc(estabelecimentoId)
    .get()
    .then(snap => {
      if (snap.exists) {
        const d = snap.data() as any;
        setNome(d.nome);
        setTipo(d.tipo);
        setEndereco(d.endereco);
        setCep(d.cep || '');
        setBairro(d.bairro || '');
        setNumero(d.numero || '');
        setCidade(d.cidade);
        setTelefone(d.telefone);
        setDescricao(d.descricao);
        setHorarioFunc(d.horarioFuncionamento);
        setImg(d.img);
        setCor(d.cor);
        setServicos(d.servicos || []);
        setHorarios(ordenarHorarios(d.horarios || []));
        setDiasFuncionamento(
          Array.isArray(d.diasFuncionamento) && d.diasFuncionamento.length
            ? d.diasFuncionamento
            : DIAS_PADRAO
        );
        setDiasFechados(Array.isArray(d.diasFechados) ? d.diasFechados : []);
        setHorariosBloqueados(d.horariosBloqueados || {});
        setGIntervalo(String(d.intervaloMin || 30));

        if (d.horarioPausa) {
          setPausaAtiva(Boolean(d.horarioPausa.ativo));
          setPausaInicio(d.horarioPausa.inicio || '12:00');
          setPausaFim(d.horarioPausa.fim || '14:00');
        }

        setFotoPerfil(d.fotoPerfil || '');
        setFotoCapa(d.fotoCapa || '');

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
    })
    .catch(() => setLoading(false));

  if (!admin?.id) {
    setAgends([]);
    return;
  }

  const unsub = firestore()
    .collection('agendamentos')
    .where('adminId', '==', admin.id)
    .onSnapshot(
      snap => {
        if (!snap) {
          setAgends([]);
          return;
        }

        const lista = snap.docs
          .map(d => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((a: any) => a.estabelecimentoId === estabelecimentoId);

        setAgends(lista as Agendamento[]);
      },
      err => {
        console.log('Agendamentos error:', err);
        setAgends([]);
      }
    );

  return unsub;
}
  }, []);

  useEffect(() => {
    if (isNovo && !nome && admin?.nome) {
      setNome(admin.nome);
    }

    if (!telefone && telefoneCadastro) {
      setTelefone(telefoneCadastro);
    }
  }, [admin?.nome, isNovo, telefoneCadastro]);

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
  // 🔒 validação básica
  if (!nome || !endereco || !cidade) {
    Alert.alert('Atenção', 'Nome, endereço e cidade são obrigatórios.');
    return;
  }

  // 🔒 validação de localização (ANTES do try)
  if (!coords?.lat || !coords?.lng) {
    Alert.alert('Erro', 'Localização inválida.');
    return;
  }

  try {
    setSalvando(true);
    const telefoneFinal = telefone.trim() || telefoneCadastro;

    const res: any = await httpsCallable(
  functionsInstance,
  'salvarEstabelecimento'
)({
      estabelecimentoId: isNovo ? undefined : estabelecimentoId,
      nome,
      tipo,
      endereco,
      cep,
      bairro,
      numero,
      cidade,
      telefone: telefoneFinal,
      descricao,
      horarioFuncionamento: horarioFunc,
      img,
      cor,
      servicos,
      horarios: ordenarHorarios(horarios),
      diasFuncionamento,
      diasFechados,
      horariosBloqueados,
      intervaloMin: Number(gIntervalo || 30),
      horarioPausa: {
        ativo: pausaAtiva,
        inicio: normalizarHorario(pausaInicio) || '12:00',
        fim: normalizarHorario(pausaFim) || '14:00',
      },
      fotoPerfil,
      fotoCapa,
      avaliacao: 5.0,
      ativo: true,
      lat: coords.lat,
      lng: coords.lng,
      // ❌ NÃO precisa mandar adminId (vem do backend via auth)
    });

    // 🔥 NOVO PADRÃO (IMPORTANTE)
    if (!res.data?.ok) {
      if (res.data?.code === 'LIMITO_FREE') {
        Alert.alert(
          'Limite atingido 🚫',
          res.data.message || 'Você já possui um estabelecimento no plano gratuito.'
        );
        return;
      }

      Alert.alert('Erro', res.data?.message || 'Falha ao salvar.');
      return;
    }

    const estabId = res.data.id;

    if (isNovo) {
      navigation.replace('AdminDash', { estabelecimentoId: estabId });
    } else {
      Alert.alert('Sucesso!', 'Atualizado com sucesso');
    }

  } catch (e: any) {
    console.log('ERRO SALVAR:', e);

    // 🔥 fallback (caso backend ainda use throw)
    if (e.code === 'failed-precondition') {
      Alert.alert(
        'Plano necessário 🚫',
        'Você precisa ativar um plano para criar mais estabelecimentos.'
      );
      return;
    }

    if (e.code === 'not-found') {
      Alert.alert(
        'Erro de conexão',
        'Função não encontrada. Verifique região ou nome da function.'
      );
      return;
    }

    Alert.alert('Erro', e.message || 'Erro ao salvar.');
  } finally {
    setSalvando(false);
  }
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
      if (!uri) return;
await reference.putFile(uri);
      const url = await reference.getDownloadURL();
      if (tipoImg === 'perfil') { setFotoPerfil(url); setImg(url); } else { setFotoCapa(url); }
      await firestore().collection('estabelecimentos').doc(estabelecimentoId).update({
        [tipoImg === 'perfil' ? 'fotoPerfil' : 'fotoCapa']: url,
        img: tipoImg === 'perfil' ? url : img
      });
      Alert.alert("Sucesso! ✅", "Foto atualizada.");
    } catch { Alert.alert("Erro", "Falha no upload."); } finally { setSalvando(false); }
  };

  const removerImagem = (tipoImg: 'perfil' | 'capa') => {
    const urlAtual = tipoImg === 'perfil' ? fotoPerfil : fotoCapa;

    if (!urlAtual) return;

    Alert.alert(
      'Excluir foto',
      tipoImg === 'perfil'
        ? 'Deseja remover a logomarca do estabelecimento?'
        : 'Deseja remover a foto de capa do estabelecimento?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const imgFallback = img?.startsWith('http') ? '✨' : img;

            try {
              setSalvando(true);

              if (tipoImg === 'perfil') {
                setFotoPerfil('');
                setImg(imgFallback);
              } else {
                setFotoCapa('');
              }

              if (!isNovo) {
                await firestore().collection('estabelecimentos').doc(estabelecimentoId).update(
                  tipoImg === 'perfil'
                    ? { fotoPerfil: '', img: imgFallback }
                    : { fotoCapa: '' }
                );

                try {
                  await storage().refFromURL(urlAtual).delete();
                } catch (e) {
                  console.log('Foto removida do cadastro, storage manteve arquivo:', e);
                }
              }
            } catch {
              Alert.alert('Erro', 'Não foi possível remover a foto.');
            } finally {
              setSalvando(false);
            }
          },
        },
      ]
    );
  };

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
      if (!uri) return;
await reference.putFile(uri);
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
      {/* HEADER */}
      <View style={s.header}>
  <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
    <Icon name="close" size={20} color="#888" />
  </TouchableOpacity>

  <View style={s.headerTitleContainer}>
    <Text style={[s.headerLabel, { color: cor }]}>
      {isNovo ? 'NOVO LOCAL' : tipo.toUpperCase()}
    </Text>
    <Text style={s.headerTitle} numberOfLines={1}>
      {isNovo ? 'Criar Cadastro' : nome}
    </Text>
  </View>

  <TouchableOpacity 
    onPress={salvar} 
    disabled={salvando}
    style={{ opacity: salvando ? 0.6 : 1 }}
  >
    <LinearGradient
      colors={gerarGradiente(cor)}
      style={s.saveBtn}
    >
      {salvando
        ? <ActivityIndicator size="small" color={getContraste(cor)} />
        : (
          <Text style={[s.saveBtnText, { color: getContraste(cor) }]}>
            Salvar
          </Text>
        )
      }
    </LinearGradient>
  </TouchableOpacity>
</View>

      {/* STATS */}
      {!isNovo && (
        <View style={s.statsContainer}>
          <View style={s.statsInner}>
            <View style={{ flex: 1 }}>
              <View style={s.rowBetween}>
                <Text style={s.statLabel}>Financeiro (Concluído / Previsto)</Text>
                <Text style={[s.statValue, { color: cor }]}>
  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.total)}
</Text>
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

      {/* ABAS */}
      <View style={s.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsContent}>
         {([['info','Informações'],['servicos','Serviços'],['horarios','Horários'],['agenda','Agenda']] as const)
  .filter(([k]) => !isNovo || k !== 'agenda')
  .map(([k, l]) => (
    <TouchableOpacity 
      key={k} 
      onPress={() => setAba(k)} 
      style={[
        s.tabItem, 
        aba === k && { backgroundColor: cor, borderColor: cor }
      ]}
    >
      <Text style={[
        s.tabText, 
        aba === k && { color: getContraste(cor) } // <--- O texto agora muda aqui
      ]}>
        {l}
      </Text>
    </TouchableOpacity>
  ))}
        </ScrollView>
      </View>

      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ─── ABA INFO ─── */}
        {aba === 'info' && (
          <View>
            <Text style={s.sectionTitle}>Aparência & Identidade</Text>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <View style={s.emojiContainer}>
                  <Text style={s.inputLabel}>ÍCONE PRINCIPAL</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.emojiList}>
                    {EMOJIS.map((e, i) => (
                      <TouchableOpacity key={`${e}-${i}`} onPress={() => setImg(e)}
                        style={[s.emojiBtn, img === e && { borderColor: cor, backgroundColor: cor + '44', borderWidth: 2 }]}>
                        <Text style={s.emojiTxt}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
               <View
  style={[
    s.colorPreview,
    {
      backgroundColor: cor,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 4
    }
  ]}
>
  <Text
    numberOfLines={1}
    adjustsFontSizeToFit
    style={{
      color: getContraste(cor),
      fontWeight: 'bold',
      fontSize: 10,
      textAlign: 'center'
    }}
  >
    {cor}
  </Text>
</View>
</View>

              <Text style={[s.inputLabel, { marginTop: 25 }]}>MIXER DE CORES</Text>
              <View style={s.mixerContainer}>
                {[['R', r, setR, '#FF4444'], ['G', g, setG, '#4CAF50'], ['B', b, setB, '#2196F3']].map(([l, val, setVal, color]: any) => (
                  <View key={l} style={s.mixerRow}>
                    <Text style={[s.mixerLabel, { color }]}>{l}</Text>
                    <Slider style={{ flex: 1, height: 40 }} minimumValue={0} maximumValue={255} value={val}
                      minimumTrackTintColor={color}
                      onValueChange={(v) => { setVal(v); updateHex(l === 'R' ? v : r, l === 'G' ? v : g, l === 'B' ? v : b); }} />
                    <Text style={s.mixerValue}>{Math.round(val)}</Text>
                  </View>
                ))}
              </View>

              <View style={s.colorGrid}>
                {PRESETS_CORES.map(c => (
                  <TouchableOpacity key={c}
                    onPress={() => { setCor(c); setR(parseInt(c.slice(1,3),16)); setG(parseInt(c.slice(3,5),16)); setB(parseInt(c.slice(5,7),16)); }}
                    style={[s.colorCircle, { backgroundColor: c }, cor === c && s.colorActive]} />
                ))}
              </View>
            </View>

            {/* LOGOMARCA */}
            <Text style={s.sectionTitle}>Logomarca</Text>
            <View style={s.photoRow}>
              <TouchableOpacity onPress={() => escolherImagem('perfil')} style={s.photoBox}>
                {fotoPerfil
                  ? (
                    <>
                      <Image source={{ uri: fotoPerfil }} style={s.imgFill} />
                      <TouchableOpacity
                        onPress={() => removerImagem('perfil')}
                        style={s.photoRemoveBtn}
                      >
                        <Icon name="trash-can-outline" size={16} color="#fff" />
                      </TouchableOpacity>
                    </>
                  )
                  : (
                    <View style={s.photoAddContainer}>
                      <Icon name="image-plus" size={28} color="#555" />
                      <Text style={s.photoAdd}>Logomarca</Text>
                    </View>
                  )}
              </TouchableOpacity>
            </View>

{/* DADOS GERAIS */}
<Text style={s.sectionTitle}>Dados Gerais</Text>

<View style={s.card}>
  <View style={s.inputBox}>
    <Text style={s.inputLabel}>NOME DO ESTABELECIMENTO</Text>
    <TextInput
      style={s.input}
      value={nome}
      onChangeText={setNome}
      placeholderTextColor="#444"
    />
  </View>

  <Text style={s.inputLabel}>TIPO</Text>

  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={s.typeList}
  >
    {TIPOS.map(t => (
      <TouchableOpacity
        key={t}
        onPress={() => setTipo(t)}
        style={[
          s.typeChip,
          tipo === t && {
            borderColor: cor,
            backgroundColor: cor + '22',
          },
        ]}
      >
        <Text
          style={[
            s.typeChipTxt,
            tipo === t && {
              color: cor,
              fontWeight: '900',
            },
          ]}
        >
          {t}
        </Text>
      </TouchableOpacity>
    ))}
  </ScrollView>

  <View style={s.row}>
    <View style={[s.inputBox, { flex: 2, marginRight: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={[s.inputLabel, { marginBottom: 0 }]}>CEP</Text>

        {(buscandoCep || buscandoEnd) && (
          <ActivityIndicator
            size="small"
            color={cor}
            style={{ marginLeft: 6 }}
          />
        )}
      </View>

      <TextInput
        style={s.input}
        value={cep}
        onChangeText={handleCepChange}
        maxLength={8}
        keyboardType="numeric"
        placeholderTextColor="#444"
      />
    </View>

    <View style={[s.inputBox, { flex: 1 }]}>
      <Text style={s.inputLabel}>Nº</Text>

      <TextInput
        style={s.input}
        value={numero}
        onChangeText={setNumero}
        keyboardType="numeric"
        placeholderTextColor="#444"
        onBlur={() =>
          geocodificarEndereco(
            endereco,
            cidade,
            numero,
            bairro
          )
        }
      />
    </View>
  </View>

  <View style={s.inputBox}>
    <Text style={s.inputLabel}>ENDEREÇO (RUA)</Text>

    <TextInput
      style={s.input}
      value={endereco}
      onChangeText={setEndereco}
      placeholderTextColor="#444"
      onBlur={() =>
        geocodificarEndereco(
          endereco,
          cidade,
          numero,
          bairro
        )
      }
    />
  </View>

  <View style={s.row}>
    <View style={[s.inputBox, { flex: 1, marginRight: 10 }]}>
      <Text style={s.inputLabel}>BAIRRO</Text>

      <TextInput
        style={s.input}
        value={bairro}
        onChangeText={setBairro}
        placeholderTextColor="#444"
        onBlur={() =>
          geocodificarEndereco(
            endereco,
            cidade,
            numero,
            bairro
          )
        }
      />
    </View>

    <View style={[s.inputBox, { flex: 1 }]}>
      <Text style={s.inputLabel}>CIDADE</Text>

      <TextInput
        style={s.input}
        value={cidade}
        onChangeText={setCidade}
        placeholderTextColor="#444"
        onBlur={() =>
          geocodificarEndereco(
            endereco,
            cidade,
            numero,
            bairro
          )
        }
      />
    </View>
  </View>

  {telefoneCadastro ? (
    <View style={s.inputBox}>
      <Text style={s.inputLabel}>TELEFONE</Text>
      <View style={s.lockedPhoneBox}>
        <Icon name="phone-check" size={18} color={cor} style={{ marginRight: 8 }} />
        <Text style={s.lockedPhoneText}>{telefoneCadastro}</Text>
      </View>
    </View>
  ) : (
    <View style={s.inputBox}>
      <Text style={s.inputLabel}>TELEFONE DO ESTABELECIMENTO</Text>

      <TextInput
        style={s.input}
        value={telefone}
        onChangeText={setTelefone}
        keyboardType="phone-pad"
        placeholderTextColor="#444"
      />
    </View>
  )}

  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
    <Text style={[s.inputLabel, { marginBottom: 0 }]}>
      LOCALIZAÇÃO NO MAPA
    </Text>

    {buscandoEnd && (
      <ActivityIndicator
        size="small"
        color={cor}
        style={{ marginLeft: 6 }}
      />
    )}
  </View>

  <Text style={s.mapHint}>
    Arraste o pino para ajustar a posição exata
  </Text>

  <View style={s.mapCard}>
  {!coordsOk ? (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={cor} />
      <Text style={{ color: '#666', marginTop: 10 }}>
        Pegando sua localização...
      </Text>
    </View>
  ) : (
    <MapView
  ref={mapRef}
  style={s.map}
  provider={PROVIDER_GOOGLE}
  showsUserLocation={false}
  showsMyLocationButton={false}
  onPress={(e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    selecionarCoordenada(latitude, longitude, true);
  }}
  initialRegion={{
    latitude: coords.lat,
    longitude: coords.lng,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  }}
>
      {/* 📍 LOCAL DO USUÁRIO */}
      {userLocation && (
        <Marker
          coordinate={{
            latitude: userLocation.lat,
            longitude: userLocation.lng,
          }}
          title="Você está aqui"
          pinColor="#2196F3"
        />
      )}

      {/* 📍 LOCAL DO ESTABELECIMENTO */}
      <Marker
        coordinate={{
          latitude: coords.lat,
          longitude: coords.lng,
        }}
        draggable
        onDragEnd={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          selecionarCoordenada(latitude, longitude, true);
        }}
        pinColor={cor}
        title="Local do Estabelecimento"
      />
    </MapView>
  )}
</View>

{userLocation && (
  <TouchableOpacity
    onPress={usarMinhaLocalizacao}
    style={[s.btnMinhaLoc, { borderColor: cor }]}
  >
    <Icon name="crosshairs-gps" size={16} color={cor} style={{ marginRight: 8 }} />
    <Text style={[s.btnMinhaLocText, { color: cor }]}>Usar minha localização atual</Text>
  </TouchableOpacity>
)}
            </View>
          </View>
        )}

        {/* ─── ABA SERVIÇOS ─── */}
        {aba === 'servicos' && (
          <View>
            <Text style={s.sectionTitle}>Novo Serviço</Text>
            <View style={s.card}>
              <View style={s.row}>
                <TouchableOpacity onPress={escolherFotoServico} style={[s.nsFotoBox, { borderColor: cor + '44' }]}>
                  {subindoFotoServico
                    ? <ActivityIndicator size="small" color={cor} />
                    : nsFoto
                      ? <Image source={{ uri: nsFoto }} style={s.imgFill} />
                      : <Icon name="camera-plus" size={28} color="#555" />}
                </TouchableOpacity>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <TextInput style={s.input} value={nsNome} onChangeText={setNsNome} placeholder="Nome do serviço" placeholderTextColor="#444" />
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
                    foto: nsFoto,
                  }]);
                  setNsNome(''); setNsPreco(''); setNsDuracao(''); setNsFoto('');
                }}
                style={[s.btnAdd, { borderColor: cor, marginTop: 15 }]}
              >
                <Icon name="plus-circle-outline" size={18} color={cor} style={{ marginRight: 8 }} />
                <Text style={[s.btnAddText, { color: cor }]}>Adicionar à Lista</Text>
              </TouchableOpacity>
            </View>

            {servicos.map(item => (
              <View key={item.id} style={s.itemCard}>
                {item.foto
                  ? <Image source={{ uri: item.foto }} style={s.itemThumb} />
                  : (
                    <View style={[s.itemThumb, { backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' }]}>
                      <Icon name="scissors-cutting" size={22} color="#555" />
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
                  <Icon name="trash-can-outline" size={20} color="#FF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ─── ABA HORÁRIOS ─── */}
        {aba === 'horarios' && (
          <View>
            <Text style={s.sectionTitle}>Dias de funcionamento</Text>
            <View style={s.card}>
              <Text style={s.helperText}>
                Escolha em quais dias os clientes podem agendar nesse estabelecimento.
              </Text>

              <View style={s.daysGrid}>
                {DIAS_FUNCIONAMENTO.map(dia => {
                  const ativo = diasFuncionamento.includes(dia);

                  return (
                    <TouchableOpacity
                      key={dia}
                      onPress={() => alternarDiaFuncionamento(dia)}
                      style={[
                        s.dayChip,
                        ativo && {
                          borderColor: cor,
                          backgroundColor: cor + '22',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.dayChipText,
                          ativo && {
                            color: cor,
                            fontWeight: '900',
                          },
                        ]}
                      >
                        {dia}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Text style={s.sectionTitle}>Grade flexível</Text>
            <View style={s.card}>
              <Text style={s.helperText}>
                Gere horários por intervalo e remova pausas como almoço automaticamente.
              </Text>

              <View style={s.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={s.miniLabel}>INÍCIO</Text>
                  <TextInput
                    style={s.input}
                    value={gInicio}
                    onChangeText={setGInicio}
                    placeholder="08:00"
                    placeholderTextColor="#444"
                  />
                </View>

                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={s.miniLabel}>FIM</Text>
                  <TextInput
                    style={s.input}
                    value={gFim}
                    onChangeText={setGFim}
                    placeholder="18:00"
                    placeholderTextColor="#444"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>MINS</Text>
                  <TextInput
                    style={s.input}
                    value={gIntervalo}
                    onChangeText={setGIntervalo}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor="#444"
                  />
                </View>
              </View>

              <View style={[s.pauseBox, { borderColor: pausaAtiva ? cor + '66' : '#222' }]}>
                <View style={s.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pauseTitle}>Pausa / almoço</Text>
                    <Text style={s.helperTextSmall}>
                      Esse intervalo não aparece para o cliente.
                    </Text>
                  </View>

                  <Switch
                    value={pausaAtiva}
                    onValueChange={setPausaAtiva}
                    trackColor={{ false: '#333', true: cor + '66' }}
                    thumbColor={pausaAtiva ? cor : '#666'}
                  />
                </View>

                {pausaAtiva && (
                  <View style={[s.row, { marginTop: 12 }]}> 
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={s.miniLabel}>PAUSA INÍCIO</Text>
                      <TextInput
                        style={s.input}
                        value={pausaInicio}
                        onChangeText={setPausaInicio}
                        placeholder="12:00"
                        placeholderTextColor="#444"
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={s.miniLabel}>PAUSA FIM</Text>
                      <TextInput
                        style={s.input}
                        value={pausaFim}
                        onChangeText={setPausaFim}
                        placeholder="14:00"
                        placeholderTextColor="#444"
                      />
                    </View>
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={gerarGradeHorarios}
                style={[s.btnAdd, { backgroundColor: cor, marginTop: 15 }]}
              >
                <Icon name="clock-time-four-outline" size={18} color={getContraste(cor)} style={{ marginRight: 8 }} />
                <Text style={[s.btnAddText, { color: getContraste(cor) }]}>Gerar grade</Text>
              </TouchableOpacity>

              <View style={[s.manualRow, { marginTop: 15 }]}> 
                <TextInput
                  style={[s.input, { flex: 1, marginRight: 8 }]}
                  value={horarioManual}
                  onChangeText={setHorarioManual}
                  placeholder="Adicionar horário manual. Ex: 15:30"
                  placeholderTextColor="#444"
                />

                <TouchableOpacity
                  onPress={adicionarHorarioManual}
                  style={[s.manualBtn, { borderColor: cor }]}
                >
                  <Icon name="plus" size={20} color={cor} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={s.sectionTitle}>Bloqueios pontuais</Text>
            <View style={s.card}>
              <Text style={s.helperText}>
                Feche uma data específica ou bloqueie só um horário por imprevisto.
              </Text>

              <View style={s.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={s.miniLabel}>DATA</Text>
                  <TextInput
                    style={s.input}
                    value={dataBloqueio}
                    onChangeText={setDataBloqueio}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor="#444"
                    keyboardType="numeric"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>HORÁRIO</Text>
                  <TextInput
                    style={s.input}
                    value={horarioBloqueio}
                    onChangeText={setHorarioBloqueio}
                    placeholder="HH:MM"
                    placeholderTextColor="#444"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={[s.row, { gap: 10, marginTop: 12 }]}> 
                <TouchableOpacity
                  onPress={fecharDataPontual}
                  style={[s.actionBtn, { borderColor: '#FF6666' }]}
                >
                  <Icon name="calendar-remove" size={18} color="#FF6666" style={{ marginRight: 6 }} />
                  <Text style={[s.btnAddText, { color: '#FF6666' }]}>Fechar data</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={bloquearHorarioPontual}
                  style={[s.actionBtn, { borderColor: cor }]}
                >
                  <Icon name="clock-remove-outline" size={18} color={cor} style={{ marginRight: 6 }} />
                  <Text style={[s.btnAddText, { color: cor }]}>Bloquear horário</Text>
                </TouchableOpacity>
              </View>

              {diasFechados.length > 0 && (
                <>
                  <Text style={[s.miniLabel, { marginTop: 18 }]}>DATAS FECHADAS</Text>

                  <View style={s.horariosGrid}>
                    {diasFechados.map(data => (
                      <TouchableOpacity
                        key={data}
                        onPress={() => removerDataFechada(data)}
                        style={[s.timeChip, { borderColor: '#FF6666', backgroundColor: '#FF444422' }]}
                      >
                        <Text style={s.timeText}>{data}</Text>
                        <Icon name="close" size={12} color="#666" style={{ marginLeft: 6 }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {Object.keys(horariosBloqueados).length > 0 && (
                <>
                  <Text style={[s.miniLabel, { marginTop: 18 }]}>HORÁRIOS BLOQUEADOS</Text>

                  {Object.entries(horariosBloqueados).map(([data, lista]) => (
                    <View key={data} style={s.bloqueioGrupo}>
                      <Text style={s.bloqueioData}>{data}</Text>

                      <View style={s.horariosGrid}>
                        {lista.map(horario => (
                          <TouchableOpacity
                            key={`${data}-${horario}`}
                            onPress={() => removerBloqueioPontual(data, horario)}
                            style={[s.timeChip, { borderColor: cor + '66' }]}
                          >
                            <Text style={s.timeText}>{horario}</Text>
                            <Icon name="close" size={12} color="#666" style={{ marginLeft: 6 }} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>

            <View style={s.rowBetween}>
              <Text style={s.sectionTitle}>Horários disponíveis</Text>

              {horarios.length > 0 && (
                <TouchableOpacity onPress={limparHorariosLivres}>
                  <Text style={s.linkDanger}>Limpar livres</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.horariosGrid}>
              {ordenarHorarios(horarios).map(h => {
                const ocupado = agends.some(a => a.horario === h && a.status === 'confirmado');

                return (
                  <TouchableOpacity
                    key={h}
                    onPress={() => removerHorario(h, ocupado)}
                    style={[
                      s.timeChip,
                      {
                        borderColor: ocupado ? '#FF4444' : cor + '44',
                        backgroundColor: ocupado ? '#FF444422' : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[s.timeText, ocupado && { color: '#FF4444' }]}>{h}</Text>
                    {!ocupado && <Icon name="close" size={12} color="#666" style={{ marginLeft: 6 }} />}
                    {ocupado && <Icon name="lock" size={12} color="#FF4444" style={{ marginLeft: 6 }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ─── ABA AGENDA ─── */}
        {aba === 'agenda' && (
          <View>
            {agends.length === 0
              ? (
                <View style={s.emptyContainer}>
                  <Icon name="calendar-blank-outline" size={48} color="#333" />
                  <Text style={s.emptyText}>Nenhum agendamento.</Text>
                </View>
              )
              : agends.map(ag => (
                <View key={ag.id} style={s.agendCard}>
                  <View style={s.agendHeader}>
                    <Text style={s.agendClient}>{ag.clienteNome}</Text>
                    <Text style={[s.agendPrice, { color: cor }]}>R$ {ag.servicoPreco}</Text>
                  </View>
                  <Text style={s.agendServ}>{ag.servicoNome}</Text>
                  <View style={s.agendMeta}>
                    <View style={s.agendDateRow}>
                      <Icon name="calendar" size={13} color="#666" style={{ marginRight: 5 }} />
                      <Text style={s.agendDate}>{ag.data} - {ag.horario}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: ag.status === 'concluido' ? '#4CAF50' : ag.status === 'cancelado' ? '#FF4444' : '#333' }]}>
                      <Text style={s.statusTxt}>{ag.status?.toUpperCase()}</Text>
                    </View>
                  </View>
{ag.status === 'confirmado' && (
  <View style={[s.row, { gap: 10, marginTop: 15 }]}>

    <TouchableOpacity
      onPress={async () => {

        try {

          await httpsCallable(
            functionsInstance,
            'concluirAgendamento'
          )({
            agendamentoId: ag.id,
          });

          Alert.alert(
            'Sucesso',
            'Agendamento concluído.'
          );

        } catch (e: any) {

          console.log(e);

          Alert.alert(
            'Erro',
            e?.message || 'Falha ao concluir.'
          );
        }
      }}
      style={[
        s.actionBtn,
        { borderColor: '#4CAF50' }
      ]}
    >
      <Icon
        name="check-circle-outline"
        size={16}
        color="#4CAF50"
        style={{ marginRight: 6 }}
      />

      <Text
        style={{
          color: '#4CAF50',
          fontWeight: '900'
        }}
      >
        CONCLUIR
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      onPress={async () => {

        try {

          await httpsCallable(
            functionsInstance,
            'cancelarAgendamento'
          )({
            agendamentoId: ag.id,
          });

          Alert.alert(
            'Sucesso',
            'Agendamento cancelado.'
          );

        } catch (e: any) {

          console.log(e);

          Alert.alert(
            'Erro',
            e?.message || 'Falha ao cancelar.'
          );
        }
      }}
      style={[
        s.actionBtn,
        { borderColor: '#FF4444' }
      ]}
    >
      <Icon
        name="close-circle-outline"
        size={16}
        color="#FF4444"
        style={{ marginRight: 6 }}
      />

      <Text
        style={{
          color: '#FF4444',
          fontWeight: '900'
        }}
      >
        CANCELAR
      </Text>
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
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40,
    backgroundColor: '#111', borderBottomWidth: 1, borderColor: '#222'
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  headerTitleContainer: { flex: 1, marginLeft: 15 },
  headerLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  saveBtn: { paddingHorizontal: 20, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  
  statsContainer: { padding: 20 },
  statsInner: { backgroundColor: '#111', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#222' },
  statLabel: { color: '#888', fontSize: 12 },
  statValue: { fontSize: 18, fontWeight: 'bold' },
  barContainer: { height: 8, flexDirection: 'row', backgroundColor: '#222', borderRadius: 4, marginVertical: 10, overflow: 'hidden' },
  bar: { height: '100%' },
  miniLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase' },
  
  tabsWrapper: { height: 50, marginBottom: 10 },
  tabsContent: { paddingHorizontal: 20, alignItems: 'center' },
  tabItem: { paddingHorizontal: 20, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#333', marginRight: 10, justifyContent: 'center' },
  tabText: { color: '#888', fontSize: 13, fontWeight: '600' },
  
  body: { flex: 1, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFF', marginTop: 25, marginBottom: 15 },
  card: { backgroundColor: '#111', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  
  emojiContainer: { flex: 1 },
  emojiList: { marginTop: 10 },
  emojiBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  emojiTxt: { fontSize: 20 },
  colorPreview: { width: 60, height: 60, borderRadius: 30, borderWidth: 4, borderColor: '#222' },
  
  mixerContainer: { marginTop: 15 },
  mixerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  mixerLabel: { width: 20, fontWeight: 'bold', fontSize: 14 },
  mixerValue: { width: 35, color: '#FFF', textAlign: 'right', fontSize: 12 },
  
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, gap: 10 },
  colorCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: '#FFF', transform: [{ scale: 1.1 }] },
  
  photoRow: { flexDirection: 'row', marginBottom: 10 },
  photoBox: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#111', borderWidth: 1, borderColor: '#333', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  imgFill: { width: '100%', height: '100%' },
  photoRemoveBtn: { position: 'absolute', right: 4, bottom: 4, width: 30, height: 30, borderRadius: 15, backgroundColor: '#FF4444', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#111' },
  photoAddContainer: { alignItems: 'center' },
  photoAdd: { color: '#555', fontSize: 10, marginTop: 4, fontWeight: 'bold' },
  
  inputBox: { marginBottom: 15 },
  inputLabel: { color: '#666', fontSize: 10, fontWeight: 'bold', marginBottom: 8, letterSpacing: 0.5 },
  input: { backgroundColor: '#1A1A1A', borderRadius: 12, height: 50, paddingHorizontal: 15, color: '#FFF', fontSize: 15, borderWidth: 1, borderColor: '#222' },
  lockedPhoneBox: { height: 50, borderRadius: 12, paddingHorizontal: 15, backgroundColor: '#151515', borderWidth: 1, borderColor: '#252525', flexDirection: 'row', alignItems: 'center' },
  lockedPhoneText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  
  typeList: { marginBottom: 20 },
  typeChip: { paddingHorizontal: 15, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#333', marginRight: 8, justifyContent: 'center' },
  typeChipTxt: { color: '#888', fontSize: 12 },
  
  mapCard: { height: 200, borderRadius: 20, overflow: 'hidden', backgroundColor: '#111', borderWidth: 1, borderColor: '#222', marginTop: 10 },
  map: { width: '100%', height: '100%' },
  mapHint: { color: '#555', fontSize: 11, marginBottom: 5 },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapPlaceholderText: { color: '#444', fontSize: 12, marginTop: 10 },
  btnMinhaLoc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 45, borderRadius: 12, borderWidth: 1, marginTop: 15 },
  btnMinhaLocText: { fontWeight: 'bold', fontSize: 13 },
  
  nsFotoBox: { width: 80, height: 80, borderRadius: 15, backgroundColor: '#1A1A1A', borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  btnAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 45, borderRadius: 12, borderWidth: 1 },
  btnAddText: { fontWeight: 'bold', fontSize: 14 },
  
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', padding: 12, borderRadius: 16, marginTop: 10, borderWidth: 1, borderColor: '#222' },
  itemThumb: { width: 50, height: 50, borderRadius: 10 },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  itemSub: { color: '#666', fontSize: 12, marginTop: 2 },
  itemRemove: { padding: 8, marginLeft: 10 },
  
  horariosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  timeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 36, borderRadius: 10, borderWidth: 1 },
  timeText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  
  helperText: { color: '#777', fontSize: 12, lineHeight: 18, marginBottom: 15 },
  helperTextSmall: { color: '#777', fontSize: 11, marginTop: 2, lineHeight: 16 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { minWidth: 46, height: 36, borderRadius: 12, borderWidth: 1, borderColor: '#222', justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  dayChipText: { color: '#777', fontSize: 12, fontWeight: '700' },
  pauseBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 15, backgroundColor: '#0D0D0D' },
  pauseTitle: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  manualRow: { flexDirection: 'row', alignItems: 'center' },
  manualBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  linkDanger: { color: '#FF6666', fontSize: 12, fontWeight: '800', marginTop: 25 },
  bloqueioGrupo: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#222' },
  bloqueioData: { color: '#FFF', fontSize: 12, fontWeight: '900', marginBottom: 6 },
  
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: '#444', marginTop: 15, fontSize: 14 },
  agendCard: { backgroundColor: '#111', padding: 15, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  agendHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  agendClient: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  agendPrice: { fontWeight: 'bold', fontSize: 16 },
  agendServ: { color: '#888', fontSize: 14, marginBottom: 10 },
  agendMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  agendDateRow: { flexDirection: 'row', alignItems: 'center' },
  agendDate: { color: '#666', fontSize: 12 },
  statusBadge: { paddingHorizontal: 10, height: 22, borderRadius: 11, justifyContent: 'center' },
  statusTxt: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  actionBtn: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }
});
