import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCSFd6v_uZgd98WKLwZNR-tDtEUNzMg4fU',
  authDomain: 'agenda-beleza-75106.firebaseapp.com',
  projectId: 'agenda-beleza-75106',
  storageBucket: 'agenda-beleza-75106.firebasestorage.app',
  messagingSenderId: '1043439367326',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'southamerica-east1');
const googleProvider = new GoogleAuthProvider();
const root = document.getElementById('app');

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const DIAS_PADRAO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const GOLD = '#C9A96E';
const TIPOS = ['Todos', 'Salao', 'Barbearia', 'Unhas', 'Sobrancelhas', 'Estetica', 'Massagem'];
const TIPO_ICONS = {
  Todos: '*',
  Salao: 'S',
  Barbearia: 'B',
  Unhas: 'U',
  Sobrancelhas: 'O',
  Estetica: 'E',
  Massagem: 'M',
};
const DEFAULT_HORARIOS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00',
];

const state = {
  route: 'home',
  mode: 'cliente',
  loading: true,
  user: null,
  admin: null,
  cliente: null,
  estabs: [],
  stories: [],
  selectedEstab: null,
  agendamentos: [],
  notificacoes: [],
  adminEstabs: [],
  adminAgendamentos: [],
  pagamentos: [],
  busca: '',
  filtro: 'Todos',
  authTab: 'login',
  booking: {
    servicoNome: '',
    data: null,
    horario: '',
    nome: '',
    formaPagamento: 'local',
    ocupados: [],
  },
};

function html(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function normalizarHorario(valor) {
  const [hh, mm] = String(valor || '').split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function minutosHorario(valor) {
  const h = normalizarHorario(valor);
  if (!h) return 0;
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
}

function toHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timestampMillis(value) {
  return value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : 0);
}

function planoAtivo(est) {
  if (!est) return false;
  const expira = timestampMillis(est.expiraEm);
  const trialAtivo = est.plano === 'trial' && expira > Date.now();
  return trialAtivo || est.assinaturaAtiva === true || est.statusPlano === 'ativo';
}

function estVisivelCliente(est) {
  return est?.ativo === true && planoAtivo(est);
}

function getDatas(estab) {
  const lista = [];
  const diasAbertos = Array.isArray(estab?.diasFuncionamento) ? estab.diasFuncionamento : DIAS_PADRAO;
  const diasFechados = Array.isArray(estab?.diasFechados) ? estab.diasFechados : [];
  const d = new Date();
  let tentativas = 0;
  while (lista.length < 7 && tentativas < 35) {
    const full = d.toLocaleDateString('pt-BR');
    const dia = DIAS[d.getDay()];
    if (diasAbertos.includes(dia) && !diasFechados.includes(full)) {
      lista.push({ full, dia, numero: d.getDate(), mes: d.toLocaleString('pt-BR', { month: 'short' }) });
    }
    d.setDate(d.getDate() + 1);
    tentativas += 1;
  }
  return lista;
}

function slotsDisponiveis(estab, servico, data) {
  const base = Array.from(new Set((estab?.horarios || []).map(normalizarHorario).filter(Boolean)))
    .sort((a, b) => minutosHorario(a) - minutosHorario(b));
  const bloqueados = data?.full && estab?.horariosBloqueados?.[data.full]
    ? estab.horariosBloqueados[data.full].map(normalizarHorario)
    : [];
  const duracao = Number(servico?.duracao || 30);
  const intervalo = Number(estab?.intervaloMin || 30);
  const hoje = data?.full === new Date().toLocaleDateString('pt-BR');
  const agora = new Date();

  return base.filter(h => {
    const inicio = minutosHorario(h);
    const [hora, minuto] = h.split(':').map(Number);
    if (hoje && (agora.getHours() > hora || (agora.getHours() === hora && agora.getMinutes() >= minuto))) return false;
    for (let m = inicio; m < inicio + duracao; m += intervalo) {
      const slot = toHHMM(m);
      if (bloqueados.includes(slot) || state.booking.ocupados.includes(slot)) return false;
    }
    return true;
  });
}

function imgUrl(item) {
  const raw = item?.fotoPerfil || item?.fotoCapa || item?.midiaUrl || item?.url || item?.foto || item?.img;
  return String(raw || '').startsWith('http') ? raw : '';
}

function firstName() {
  return state.user?.displayName?.split(' ')[0] || state.user?.email?.split('@')[0] || '';
}

function tipoMatch(estab, filtro) {
  if (filtro === 'Todos') return true;
  const base = `${estab?.tipo || ''} ${estab?.categoria || ''} ${estab?.nome || ''}`.toLowerCase();
  return base.includes(filtro.toLowerCase());
}

function renderStars(value = 5) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 5))));
  return Array.from({ length: 5 }, (_, i) => `<span class="star">${i < rating ? '*' : '-'}</span>`).join('');
}

async function call(name, payload = {}) {
  const fn = httpsCallable(functions, name);
  const res = await fn(payload);
  return res.data || {};
}

function isPermissionError(error) {
  return error?.code === 'permission-denied'
    || String(error?.message || '').toLowerCase().includes('missing or insufficient permissions');
}

async function loadEstabs() {
  const snap = await getDocs(query(collection(db, 'estabelecimentos'), where('ativo', '==', true), limit(120)));
  state.estabs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(estVisivelCliente);
}

async function loadStories() {
  const snap = await getDocs(query(collection(db, 'stories'), where('ativo', '==', true), limit(60)));
  const now = Date.now();
  state.stories = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => {
      const expira = timestampMillis(s.expiraEm);
      return !expira || expira > now;
    });
}

async function loadCliente() {
  if (!state.user?.uid) return;
  const [agSnap, ntSnap] = await Promise.all([
    getDocs(query(collection(db, 'agendamentos'), where('clienteUid', '==', state.user.uid), limit(80))).catch(error => {
      if (!isPermissionError(error)) throw error;
      return { docs: [] };
    }),
    getDocs(query(collection(db, 'notificacoes'), where('userId', '==', state.user.uid), where('apagada', '==', false), limit(80))).catch(error => {
      if (!isPermissionError(error)) throw error;
      return { docs: [] };
    }),
  ]);
  state.agendamentos = agSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  state.notificacoes = ntSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => timestampMillis(b.criadoEm) - timestampMillis(a.criadoEm));
}

async function loadAdmin() {
  if (!state.admin?.id) return;
  const [estSnap, pagSnap] = await Promise.all([
    getDocs(query(collection(db, 'estabelecimentos'), where('adminId', '==', state.admin.id), limit(50))),
    getDocs(query(collection(db, 'pagamentos'), where('adminId', '==', state.admin.id), limit(80))).catch(error => {
      if (!isPermissionError(error)) throw error;
      return { docs: [] };
    }),
  ]);
  state.adminEstabs = estSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  state.pagamentos = pagSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const ids = state.adminEstabs.map(e => e.id);
  const results = [];
  for (let i = 0; i < ids.length; i += 10) {
    const grupo = ids.slice(i, i + 10);
    if (!grupo.length) continue;
    const snap = await getDocs(query(collection(db, 'agendamentos'), where('estabelecimentoId', 'in', grupo), limit(100))).catch(error => {
      if (!isPermissionError(error)) throw error;
      return { docs: [] };
    });
    results.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }
  state.adminAgendamentos = results.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
}

async function selectEstab(id) {
  if (!state.user || state.admin) {
    state.mode = 'cliente';
    state.route = 'login';
    render();
    toast('Entre como cliente para agendar.');
    return;
  }

  const snap = await getDoc(doc(db, 'estabelecimentos', id));
  if (!snap.exists()) throw new Error('Estabelecimento nao encontrado.');
  const estab = { id: snap.id, ...snap.data() };
  if (!estVisivelCliente(estab)) throw new Error('Estabelecimento indisponivel.');
  state.selectedEstab = estab;
  state.booking = {
    servicoNome: '',
    data: null,
    horario: '',
    nome: state.user?.displayName || state.cliente?.nome || '',
    formaPagamento: 'local',
    ocupados: [],
  };
  state.route = 'detail';
  render();
}

async function loadOcupados() {
  if (!state.selectedEstab?.id || !state.booking.data?.full) return;
  const snap = await getDocs(query(
    collection(db, 'horariosOcupados'),
    where('estabelecimentoId', '==', state.selectedEstab.id),
    where('data', '==', state.booking.data.full),
    limit(200),
  ));
  state.booking.ocupados = snap.docs.map(d => normalizarHorario(d.data()?.horario)).filter(Boolean);
}

async function loginClienteEmail(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
  if (adminSnap.exists() && adminSnap.data()?.ativo) {
    await signOut(auth);
    throw new Error('Esta conta e profissional. Use Acesso Profissional.');
  }
}

async function criarCliente(nome, email, senha) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await updateProfile(cred.user, { displayName: nome });
  await setDoc(doc(db, 'clientes', cred.user.uid), { nome, email, criadoEm: serverTimestamp() }, { merge: true });
}

async function loginAdminEmail(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
  if (!adminSnap.exists() || !adminSnap.data()?.ativo) {
    await signOut(auth);
    throw new Error('Acesso profissional negado.');
  }
}

async function criarAdmin(nome, email, senha) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await updateProfile(cred.user, { displayName: nome });
  await setDoc(doc(db, 'admins', cred.user.uid), {
    uid: cred.user.uid,
    nome,
    email,
    telefone: '',
    cargo: 'Admin',
    ativo: true,
    criadoEm: serverTimestamp(),
  }, { merge: true });
  await signOut(auth);
  toast('Conta profissional criada. Entre para acessar.');
}

async function googleFlow(mode) {
  sessionStorage.setItem('beautyhub_google_mode', mode);
  const cred = await signInWithPopup(auth, googleProvider).catch(async error => {
    if (String(error?.code || '').includes('popup')) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  });
  if (cred) await finishGoogle(cred, mode);
}

async function finishGoogle(cred, mode) {
  if (mode === 'admin') {
    const adminRef = doc(db, 'admins', cred.user.uid);
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists() && adminSnap.data()?.ativo) return;
    if (adminSnap.exists()) {
      await signOut(auth);
      throw new Error('Conta profissional desativada.');
    }
    await setDoc(adminRef, {
      uid: cred.user.uid,
      nome: cred.user.displayName || cred.user.email?.split('@')[0] || 'Profissional',
      email: cred.user.email || '',
      telefone: '',
      cargo: 'Admin',
      ativo: true,
      criadoEm: serverTimestamp(),
    });
    await signOut(auth);
    toast('Conta profissional Google criada. Entre novamente.');
    return;
  }

  const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
  if (adminSnap.exists() && adminSnap.data()?.ativo) {
    await signOut(auth);
    throw new Error('Esta conta e profissional. Use Acesso Profissional.');
  }
  await setDoc(doc(db, 'clientes', cred.user.uid), {
    nome: cred.user.displayName || '',
    email: cred.user.email || '',
    foto: cred.user.photoURL || '',
    criadoEm: serverTimestamp(),
  }, { merge: true });
}

async function resolverGoogleRedirect() {
  const cred = await getRedirectResult(auth).catch(error => {
    console.error(error);
    toast(error.message || 'Erro ao voltar do Google.');
    return null;
  });
  if (!cred) return;
  const mode = sessionStorage.getItem('beautyhub_google_mode') || 'cliente';
  sessionStorage.removeItem('beautyhub_google_mode');
  await finishGoogle(cred, mode);
}

async function confirmarAgendamento() {
  const e = state.selectedEstab;
  const b = state.booking;
  if (!state.user || state.admin) {
    state.mode = 'cliente';
    state.route = 'login';
    render();
    toast('Entre como cliente para agendar.');
    return;
  }
  if (!e || !b.servicoNome || !b.data || !b.horario || !b.nome || !b.formaPagamento) {
    throw new Error('Preencha servico, data, horario, nome e pagamento.');
  }
  await call('criarAgendamento', {
    estabelecimentoId: e.id,
    servicoNome: b.servicoNome,
    clienteNome: b.nome,
    clienteUid: state.user.uid,
    data: b.data.full,
    horario: b.horario,
    formaPagamento: b.formaPagamento,
  });
  await loadCliente();
  state.route = 'agenda';
  toast('Agendamento criado.');
  render();
}

async function salvarEstabelecimento() {
  if (!state.admin) throw new Error('Entre como profissional.');
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const servicos = [];
  const nomeServico = get('servicoNome');
  const precoServico = Number(get('servicoPreco').replace(',', '.'));
  if (nomeServico && precoServico) {
    servicos.push({ id: String(Date.now()), nome: nomeServico, preco: precoServico, duracao: Number(get('servicoDuracao') || 30), ativo: true });
  }
  const payload = {
    estabelecimentoId: get('estabelecimentoId') || undefined,
    nome: get('estabNome'),
    tipo: get('estabTipo') || 'Salao de beleza',
    endereco: get('estabEndereco'),
    bairro: get('estabBairro'),
    cidade: get('estabCidade'),
    telefone: get('estabTelefone'),
    descricao: get('estabDescricao'),
    horarioFuncionamento: '08:00 as 18:00',
    diasFuncionamento: DIAS_PADRAO,
    intervaloMin: 30,
    horarios: DEFAULT_HORARIOS,
    servicos,
    ativo: true,
    principal: state.adminEstabs.length === 0,
    cor: '#C9A96E',
    img: 'BH',
  };
  if (!payload.nome) throw new Error('Informe o nome do estabelecimento.');
  await call('salvarEstabelecimento', payload);
  await loadAdmin();
  toast('Estabelecimento salvo.');
  state.route = 'admin';
  render();
}

function shell(content, active = state.route) {
  const subtitle = state.admin ? 'Painel profissional' : state.user ? 'Area do cliente' : 'Agendamentos de beleza';
  const unread = state.notificacoes.filter(n => !n.lida).length;
  return `
    <div class="app">
      <header class="topbar">
        <div class="toprow">
          <button class="icon-btn" data-action="back" aria-label="Voltar">&lt;</button>
          <button class="brand" data-route="${state.admin ? 'admin' : 'home'}" style="background:transparent;border:0;color:inherit;text-align:left">
            <img src="./assets/logo.png" alt="BeautyHub" />
            <span><strong>BeautyHub</strong><span>${subtitle}</span></span>
          </button>
          ${state.user ? `<button class="small-btn" data-action="logout">Sair</button>` : `<button class="small-btn" data-route="login">Entrar</button>`}
        </div>
      </header>
      <main class="page">${content}</main>
      <nav class="bottom-nav">
        <button class="nav-item ${active === 'home' ? 'active' : ''}" data-route="home"><span>IN</span>Inicio</button>
        <button class="nav-item ${active === 'stories' ? 'active' : ''}" data-route="stories"><span>ST</span>Stories</button>
        <button class="nav-item ${active === 'agenda' ? 'active' : ''}" data-route="agenda"><span>AG</span>Horarios</button>
        <button class="nav-item ${active === 'notificacoes' ? 'active' : ''}" data-route="notificacoes"><span>AV</span>Avisos${unread ? ` ${unread}` : ''}</button>
        <button class="nav-item ${active === 'admin' ? 'active' : ''}" data-route="admin"><span>PA</span>Painel</button>
      </nav>
    </div>
  `;
}

function renderHome() {
  const chips = TIPOS.map(t => `
    <button class="filter-chip ${state.filtro === t ? 'active' : ''}" data-filter="${t}">
      <span>${TIPO_ICONS[t] || '*'}</span>${t}
    </button>
  `).join('');
  const stories = state.stories.slice(0, 10).map(s => `
    <button class="story-chip" data-route="stories">
      ${imgUrl(s) ? `<img class="story-avatar" src="${html(imgUrl(s))}" alt="" />` : '<span class="story-avatar">BH</span>'}
      <small>${html(s.nome || s.nomeAdmin || 'Story')}</small>
    </button>
  `).join('');
  const termo = state.busca.toLowerCase();
  const estabs = state.estabs
    .filter(e => !termo || `${e.nome} ${e.tipo} ${e.bairro} ${e.cidade}`.toLowerCase().includes(termo))
    .filter(e => tipoMatch(e, state.filtro))
    .map(e => `
      <article class="estab-card">
        <div class="estab-photo-wrap">
          ${imgUrl(e) ? `<img class="estab-photo" src="${html(imgUrl(e))}" alt="${html(e.nome)}" />` : '<div class="estab-photo fallback">BH</div>'}
        </div>
        <div class="estab-body">
          <div class="estab-title-row">
            <h2>${html(e.nome)}</h2>
            ${e.verificado || e.verificadoManual || e.verificadoAutomatico ? '<span class="verified">OK</span>' : ''}
          </div>
          <div class="estab-type" style="color:${html(e.cor || GOLD)}">${html(e.tipo || 'Beleza')}</div>
          <div class="status-line"><span class="status-dot"></span><strong>Aberto para agendamentos</strong></div>
          <div class="muted-line">${html(e.horarioFuncionamento || 'Veja os horarios disponiveis')}</div>
          <div class="rating-line">${renderStars(e.avaliacao || 5)} <b>(${e.avaliacao ? Number(e.avaliacao).toFixed(1) : '5.0'})</b></div>
          <button class="schedule-btn" data-estab="${e.id}">Ver horarios -&gt;</button>
        </div>
      </article>
    `).join('');
  return shell(`
    <section class="home-header">
      <div>
        <p>${state.user ? `Ola, ${html(firstName())}` : 'Bem-vindo'}</p>
        <h1>Encontre seu espaco</h1>
      </div>
      ${state.user ? `<button class="header-pill" data-action="logout">Sair</button>` : `<button class="header-pill gold" data-route="login">Entrar</button>`}
    </section>
    <label class="search android"><span>BUSCAR</span><input id="busca" value="${html(state.busca)}" placeholder="Buscar salao, servico..." /></label>
    <div class="filter-row">${chips}</div>
    ${stories ? `<div class="stories-row">${stories}</div>` : ''}
    <div class="estab-list">${state.loading ? '<div class="loading">Carregando...</div>' : estabs || '<div class="empty">Nenhum estabelecimento disponivel.</div>'}</div>
  `, 'home');
}

function renderLogin() {
  const admin = state.mode === 'admin';
  const cadastro = state.authTab === 'cadastro';
  const titulo = admin
    ? (cadastro ? 'Seja um Parceiro' : 'Painel do Profissional')
    : (cadastro ? 'Crie sua conta' : 'Bem-vindo');
  const subtitulo = admin
    ? (cadastro ? 'Crie seu perfil profissional agora' : 'Gerencie sua agenda e clientes')
    : (cadastro ? 'Cadastre-se para agendar com facilidade' : 'Acesse para gerenciar seus agendamentos');
  return shell(`
    <section class="login-top">
      <button class="login-back" data-action="back">&lt;</button>
      <img src="./assets/logo.png" alt="BeautyHub" />
      <h1>${titulo}</h1>
      <p>${subtitulo}</p>
    </section>

    <section class="login-body">
      <div class="tabs android-tabs">
        <button class="tab ${!cadastro ? 'active' : ''}" data-auth-tab="login">Entrar</button>
        <button class="tab ${cadastro ? 'active' : ''}" data-auth-tab="cadastro">Cadastro</button>
      </div>

      <div class="form-panel">
        ${cadastro ? `
          <div class="field"><label>${admin ? 'Nome do estabelecimento / profissional' : 'Nome completo'}</label><input id="authNome" placeholder="${admin ? 'Ex: Studio BeautyHub' : 'Como quer ser chamado?'}" /></div>
        ` : ''}
        <div class="field"><label>${admin ? 'Email profissional' : 'E-mail'}</label><input id="authEmail" type="email" autocomplete="email" placeholder="${admin ? 'admin@salao.com' : 'exemplo@email.com'}" /></div>
        <div class="field"><label>Senha</label><input id="authSenha" type="password" autocomplete="current-password" placeholder="********" /></div>
        <button class="primary android-primary" data-action="${cadastro ? 'signup-email' : 'login-email'}">${cadastro ? (admin ? 'Criar Painel Profissional' : 'Criar Conta') : (admin ? 'Acessar Painel' : 'Entrar')}</button>
        <button class="google-btn" data-action="login-google">${cadastro ? (admin ? 'Criar com Google' : 'Conta do Google') : 'Conta do Google'}</button>
      </div>

      <div class="mode-links">
        ${admin
          ? `<button data-mode="cliente">Entrar como cliente</button>`
          : `<button data-mode="admin">Acesso Profissional</button>`}
      </div>
    </section>
  `, 'login');
}

function renderDetail() {
  const e = state.selectedEstab;
  if (!e) return renderHome();
  if (!state.user || state.admin) {
    state.mode = 'cliente';
    state.route = 'login';
    return renderLogin();
  }

  const servicos = Array.isArray(e.servicos) ? e.servicos.filter(s => s.ativo !== false) : [];
  const servico = servicos.find(s => s.nome === state.booking.servicoNome);
  const datas = getDatas(e);
  const horarios = state.booking.data ? slotsDisponiveis(e, servico, state.booking.data) : [];
  const podePagarApp = (e.plano === 'pro' || e.plano === 'elite') && e.pagamentoAppAtivo && e.pixChave;
  return shell(`
    <section class="detail-cover">
      ${imgUrl(e) ? `<img src="${html(imgUrl(e))}" alt="${html(e.nome)}" />` : '<div class="detail-logo">BH</div>'}
      <h1>${html(e.nome)}</h1>
      <p>${html(e.descricao || e.tipo || 'Escolha um horario.')}</p>
      <div class="detail-meta">${html(e.endereco || '')} ${html(e.bairro || '')}</div>
      <div class="rating-line center">${renderStars(e.avaliacao || 5)} <b>(${e.avaliacao ? Number(e.avaliacao).toFixed(1) : '5.0'})</b></div>
    </section>

    <section class="booking-stack">
      <div class="booking-card"><h2>Servico</h2>
        <div class="list">${servicos.map(s => `<button class="list-item row ${state.booking.servicoNome === s.nome ? 'selected' : ''}" data-service="${html(s.nome)}"><span>${html(s.nome)}<br><small class="meta">${Number(s.duracao || 30)} min</small></span><strong>${money(s.preco)}</strong></button>`).join('') || '<div class="empty">Sem servicos.</div>'}</div>
      </div>
      <div class="booking-card"><h2>Data</h2>
        <div class="choice-grid">${datas.map(d => `<button class="choice ${state.booking.data?.full === d.full ? 'active' : ''}" data-date="${d.full}">${d.dia}<br>${d.numero} ${d.mes}</button>`).join('')}</div>
      </div>
      <div class="booking-card"><h2>Horario</h2>
        <div class="choice-grid">${horarios.map(h => `<button class="choice ${state.booking.horario === h ? 'active' : ''}" data-time="${h}">${h}</button>`).join('') || '<div class="empty">Selecione servico e data.</div>'}</div>
      </div>
      <div class="booking-card"><h2>Confirmar</h2>
        <div class="field"><label>Seu nome</label><input id="nomeCliente" value="${html(state.booking.nome)}" /></div>
        <div class="field"><label>Pagamento</label><select id="formaPagamento"><option value="local">Pagar no local</option>${podePagarApp ? '<option value="app">Pagar pelo app</option>' : ''}</select></div>
        <button class="primary android-primary" data-action="confirm-booking">Confirmar agendamento</button>
        ${e.telefone ? `<a class="secondary" target="_blank" href="https://wa.me/${String(e.telefone).replace(/\D/g, '').startsWith('55') ? String(e.telefone).replace(/\D/g, '') : `55${String(e.telefone).replace(/\D/g, '')}`}">WhatsApp</a>` : ''}
      </div>
    </section>
  `, 'home');
}

function renderStories() {
  const cards = state.stories.map(s => `
    <article class="card">
      ${imgUrl(s) ? `<img class="story-media" src="${html(imgUrl(s))}" alt="${html(s.nome || 'Story')}" />` : '<div class="cover">BH</div>'}
      <div class="card-body stack">
        <h2 class="title">${html(s.nome || s.nomeAdmin || 'Story')}</h2>
        <div class="meta">${html(s.texto || s.descricao || 'Novidade do estabelecimento')}</div>
        ${s.estabelecimentoId ? `<button class="primary" data-estab="${s.estabelecimentoId}">Agendar agora</button>` : ''}
      </div>
    </article>
  `).join('');
  return shell(`<section class="hero"><h1>Stories</h1><p>Divulgacoes dos profissionais.</p></section><div class="grid">${cards || '<div class="empty">Nenhum story ativo.</div>'}</div>`, 'stories');
}

function renderAgenda() {
  if (!state.user) return shell(`<section class="hero"><h1>Meus horarios</h1><p>Entre para ver seus agendamentos.</p></section><button class="primary" data-route="login">Entrar</button>`, 'agenda');
  const rows = state.agendamentos.map(a => `
    <div class="list-item">
      <div class="row"><strong>${html(a.estabelecimentoNome || 'BeautyHub')}</strong><span class="badge">${html(a.status || 'confirmado')}</span></div>
      <div class="meta">${html(a.servicoNome)} • ${html(a.data)} as ${html(a.horario)}</div>
    </div>
  `).join('');
  return shell(`<section class="hero"><h1>Meus horarios</h1><p>Acompanhe seus agendamentos.</p></section><div class="list">${rows || '<div class="empty">Nenhum agendamento.</div>'}</div>`, 'agenda');
}

function renderNotificacoes() {
  if (!state.user) return shell(`<section class="hero"><h1>Notificacoes</h1><p>Entre para ver avisos.</p></section><button class="primary" data-route="login">Entrar</button>`, 'notificacoes');
  const rows = state.notificacoes.map(n => `
    <div class="list-item">
      <div class="row"><strong>${html(n.titulo || 'BeautyHub')}</strong>${n.lida ? '' : '<span class="badge">Novo</span>'}</div>
      <div class="meta">${html(n.mensagem || n.body || '')}</div>
      ${n.lida ? '' : `<button class="secondary mini" data-action="read-notification" data-id="${n.id}">Marcar como lida</button>`}
    </div>
  `).join('');
  return shell(`<section class="hero"><h1>Notificacoes</h1><p>Avisos importantes.</p></section><div class="list">${rows || '<div class="empty">Nenhum aviso.</div>'}</div>`, 'notificacoes');
}

function renderAdmin() {
  if (!state.admin) {
    state.mode = 'admin';
    return renderLogin();
  }
  const hoje = new Date().toLocaleDateString('pt-BR');
  const hojeCount = state.adminAgendamentos.filter(a => a.data === hoje).length;
  const pendentes = state.adminAgendamentos.filter(a => ['pendente', 'confirmado'].includes(a.status)).length;
  const estabs = state.adminEstabs.map(e => `
    <div class="admin-list-card">
      <div class="row"><strong>${html(e.nome)}</strong><span class="badge ${e.ativo === false ? 'danger' : 'ok'}">${e.ativo === false ? 'Inativo' : 'Ativo'}</span></div>
      <div class="meta">${html(e.tipo || '')} - Plano ${html(e.plano || 'free')} - Selo ${e.verificado ? 'ativo' : 'nao ativo'}</div>
      <div class="inline-actions">
        <button class="secondary mini" data-route="admin-estab" data-edit-estab="${e.id}">Editar</button>
        <button class="secondary mini" data-action="start-trial" data-estab-admin="${e.id}">Trial</button>
        <button class="secondary mini" data-action="request-seal" data-estab-admin="${e.id}">Selo</button>
        <button class="secondary mini" data-action="boost-estab" data-estab-admin="${e.id}" data-package="destaque_1d">Impulsionar</button>
      </div>
    </div>
  `).join('');
  const ags = state.adminAgendamentos.map(a => `
    <div class="admin-list-card">
      <div class="row"><strong>${html(a.clienteNome || 'Cliente')}</strong><span class="badge">${html(a.status || '')}</span></div>
      <div class="meta">${html(a.estabelecimentoNome || '')} - ${html(a.servicoNome || '')} - ${html(a.data)} as ${html(a.horario)}</div>
      ${['pendente', 'confirmado'].includes(a.status) ? `<div class="inline-actions"><button class="secondary mini" data-action="finish-booking" data-id="${a.id}">Concluir</button><button class="danger-btn mini" data-action="cancel-booking" data-id="${a.id}">Cancelar</button></div>` : ''}
    </div>
  `).join('');
  return shell(`
    <section class="admin-hero">
      <p>Painel do Profissional</p>
      <h1>${html(state.admin.nome || 'Profissional')}</h1>
    </section>
    <section class="admin-stats">
      <div><span>Hoje</span><strong>${hojeCount}</strong></div>
      <div><span>Total</span><strong>${state.adminAgendamentos.length}</strong></div>
      <div><span>Ativos</span><strong>${pendentes}</strong></div>
    </section>
    <div class="admin-actions">
      <button class="primary mini" data-route="admin-estab">Novo estabelecimento</button>
      <button class="secondary mini" data-route="admin-planos">Planos</button>
      <button class="secondary mini" data-route="admin-financeiro">Financeiro</button>
      <button class="secondary mini" data-route="admin-notif">Notificacoes</button>
      <button class="secondary mini" data-route="postar-story">Postar story</button>
      <button class="secondary mini" data-route="conta-bancaria">Conta bancaria</button>
      <button class="secondary mini" data-route="relatorio-financeiro">Relatorio</button>
      <button class="secondary mini" data-route="simulacao-divulgacao">Simulacao</button>
    </div>
    <h2 class="section-title">Estabelecimentos</h2><div class="list">${estabs || '<div class="empty">Nenhum estabelecimento.</div>'}</div>
    <h2 class="section-title spaced">Agendamentos</h2><div class="list">${ags || '<div class="empty">Nenhum agendamento.</div>'}</div>
  `, 'admin');
}

function renderAdminEstab() {
  if (!state.admin) return renderLogin();
  const id = sessionStorage.getItem('beautyhub_edit_estab') || '';
  const e = state.adminEstabs.find(x => x.id === id) || {};
  const firstServico = Array.isArray(e.servicos) ? e.servicos[0] || {} : {};
  return shell(`
    <section class="hero"><h1>${id ? 'Editar estabelecimento' : 'Novo estabelecimento'}</h1><p>Cadastro web usando a mesma Function salvarEstabelecimento.</p></section>
    <div class="card"><div class="card-body stack">
      <input id="estabelecimentoId" type="hidden" value="${html(id)}" />
      <div class="field"><label>Nome</label><input id="estabNome" value="${html(e.nome || '')}" /></div>
      <div class="field"><label>Tipo</label><input id="estabTipo" value="${html(e.tipo || '')}" /></div>
      <div class="field"><label>Endereco</label><input id="estabEndereco" value="${html(e.endereco || '')}" /></div>
      <div class="field"><label>Bairro</label><input id="estabBairro" value="${html(e.bairro || '')}" /></div>
      <div class="field"><label>Cidade</label><input id="estabCidade" value="${html(e.cidade || '')}" /></div>
      <div class="field"><label>WhatsApp</label><input id="estabTelefone" value="${html(e.telefone || '')}" /></div>
      <div class="field"><label>Descricao</label><textarea id="estabDescricao">${html(e.descricao || '')}</textarea></div>
      <div class="field"><label>Servico principal</label><input id="servicoNome" value="${html(firstServico.nome || '')}" /></div>
      <div class="field"><label>Preco</label><input id="servicoPreco" inputmode="decimal" value="${html(firstServico.preco || '')}" /></div>
      <div class="field"><label>Duracao</label><input id="servicoDuracao" inputmode="numeric" value="${html(firstServico.duracao || 30)}" /></div>
      <button class="primary" data-action="save-estab">Salvar</button>
    </div></div>
  `, 'admin');
}

function renderAdminPlanos() {
  if (!state.admin) return renderLogin();
  const principal = state.adminEstabs[0];
  const planos = [
    { id: 'essencial', nome: 'Comecar profissional', valor: 29.9 },
    { id: 'pro', nome: 'Crescer agenda', valor: 59.9 },
    { id: 'elite', nome: 'Maximo destaque', valor: 99.9 },
  ];
  return shell(`
    <section class="admin-hero"><p>Assinatura</p><h1>Planos BeautyHub</h1></section>
    <div class="grid">
      ${planos.map(p => `<article class="card stack"><span class="badge">${p.id.toUpperCase()}</span><h2 class="title">${p.nome}</h2><strong>${money(p.valor)}</strong><p class="meta">Contratacao por Pix usando o mesmo backend do Android.</p>${principal ? `<button class="primary mini" data-action="create-sub-pix" data-estab-admin="${principal.id}" data-plan="${p.id}" data-value="${p.valor}">Pagar Pix</button>` : ''}</article>`).join('')}
    </div>
    ${principal ? `<button style="margin-top:14px" class="primary" data-action="start-trial" data-estab-admin="${principal.id}">Ativar trial no principal</button>` : ''}
  `, 'admin');
}

function renderAdminFinanceiro() {
  if (!state.admin) return renderLogin();
  const rows = state.pagamentos.map(p => `<div class="list-item"><div class="row"><strong>${html(p.tipo || p.plano || 'Pagamento')}</strong><span class="badge">${html(p.status || '')}</span></div><div class="meta">${money(p.valor || p.transaction_amount)} • ${html(p.estabelecimentoNome || '')}</div></div>`).join('');
  return shell(`<section class="hero"><h1>Financeiro</h1><p>Pagamentos e status carregados do Firebase.</p></section><div class="list">${rows || '<div class="empty">Nenhum pagamento carregado.</div>'}</div>`, 'admin');
}

function adminPrincipal() {
  return state.adminEstabs[0] || null;
}

function renderAdminNotif() {
  if (!state.admin) return renderLogin();
  const rows = state.notificacoes.map(n => `
    <div class="admin-list-card">
      <div class="row"><strong>${html(n.titulo || 'BeautyHub')}</strong><span class="badge">${n.lida ? 'Lida' : 'Nova'}</span></div>
      <div class="meta">${html(n.mensagem || n.body || '')}</div>
    </div>
  `).join('');
  return shell(`
    <section class="admin-hero"><p>Central</p><h1>Notificacoes</h1></section>
    <div class="list">${rows || '<div class="empty">Nenhuma notificacao.</div>'}</div>
  `, 'admin');
}

function renderPostarStory() {
  if (!state.admin) return renderLogin();
  const estabs = state.adminEstabs.map(e => `<option value="${e.id}">${html(e.nome)}</option>`).join('');
  return shell(`
    <section class="admin-hero"><p>Stories</p><h1>Postar Story</h1></section>
    <div class="booking-card">
      <div class="field"><label>Estabelecimento</label><select id="storyEstab">${estabs}</select></div>
      <div class="field"><label>Texto</label><textarea id="storyTexto" placeholder="Novidade, promocao ou recado"></textarea></div>
      <div class="field"><label>URL da midia</label><input id="storyMidia" placeholder="https://..." /></div>
      <button class="primary android-primary" data-action="post-story">Publicar story</button>
    </div>
  `, 'admin');
}

function renderContaBancaria() {
  if (!state.admin) return renderLogin();
  const e = adminPrincipal();
  return shell(`
    <section class="admin-hero"><p>Pagamentos</p><h1>Conta bancaria</h1></section>
    <div class="booking-card">
      <div class="field"><label>Estabelecimento</label><input id="contaEstab" value="${html(e?.id || '')}" readonly /></div>
      <div class="field"><label>Responsavel</label><input id="contaNome" value="${html(e?.responsavelNome || state.admin.nome || '')}" /></div>
      <div class="field"><label>CPF</label><input id="contaCpf" inputmode="numeric" value="${html(e?.responsavelCpf || '')}" /></div>
      <div class="field"><label>Telefone</label><input id="contaTelefone" value="${html(e?.responsavelTelefone || '')}" /></div>
      <div class="field"><label>Email</label><input id="contaEmail" type="email" value="${html(e?.responsavelEmail || state.admin.email || '')}" /></div>
      <div class="field"><label>Chave Pix</label><input id="contaPix" value="${html(e?.pixChave || '')}" /></div>
      <div class="field"><label>Tipo Pix</label><select id="contaPixTipo"><option value="email">Email</option><option value="cpf">CPF</option><option value="telefone">Telefone</option><option value="aleatoria">Aleatoria</option></select></div>
      <button class="primary android-primary" data-action="save-bank">Salvar dados</button>
    </div>
  `, 'admin');
}

function renderRelatorioFinanceiro() {
  if (!state.admin) return renderLogin();
  const e = adminPrincipal();
  return shell(`
    <section class="admin-hero"><p>Relatorio</p><h1>Financeiro</h1></section>
    <div class="booking-card">
      <div class="field"><label>Estabelecimento</label><input id="relEstab" value="${html(e?.id || '')}" readonly /></div>
      <div class="field"><label>Data inicial</label><input id="relInicio" placeholder="01/05/2026" /></div>
      <div class="field"><label>Data final</label><input id="relFim" placeholder="31/05/2026" /></div>
      <button class="primary android-primary" data-action="generate-report">Gerar relatorio</button>
      <div id="reportResult" class="meta"></div>
    </div>
  `, 'admin');
}

function renderSimulacaoDivulgacao() {
  if (!state.admin) return renderLogin();
  return shell(`
    <section class="detail-cover">
      <div class="detail-logo">BH</div>
      <h1>Simulacao de divulgacao</h1>
      <p>Acompanhe o caminho do cliente: ele encontra o estabelecimento, escolhe servico, data, horario e confirma o agendamento.</p>
    </section>
    <section class="booking-stack">
      <div class="booking-card"><h2>1. Aparecer na Home</h2><p class="meta">Seu card aparece com foto, selo, avaliacao e botao de horarios.</p></div>
      <div class="booking-card"><h2>2. Cliente escolhe</h2><p class="meta">Servico, data e horario seguem os dados do estabelecimento.</p></div>
      <div class="booking-card"><h2>3. Agenda recebe</h2><p class="meta">O agendamento entra no painel do profissional e gera notificacoes pelo backend.</p></div>
    </section>
  `, 'admin');
}

function renderIADemo() {
  if (!state.user) return renderLogin();
  const e = state.selectedEstab || state.estabs[0];
  return shell(`
    <section class="detail-cover"><div class="detail-logo">IA</div><h1>Simulacao IA</h1><p>Previa visual usando a mesma Function gerarSimulacaoIA.</p></section>
    <div class="booking-card">
      <div class="field"><label>Categoria</label><select id="iaCategoria"><option value="cabelo">Cabelo</option><option value="maquiagem">Maquiagem</option><option value="sobrancelha">Sobrancelha</option></select></div>
      <div class="field"><label>URL da imagem Firebase Storage</label><input id="iaImagem" placeholder="https://firebasestorage.googleapis.com/..." /></div>
      <input id="iaEstab" type="hidden" value="${html(e?.id || '')}" />
      <button class="primary android-primary" data-action="generate-ai">Gerar simulacao</button>
      <div id="iaResult" class="meta"></div>
    </div>
  `, 'home');
}

function renderSuperAdmin() {
  if (state.admin?.cargo !== 'Super Admin') return renderAdmin();
  return shell(`
    <section class="admin-hero"><p>BeautyHub</p><h1>Super Admin</h1></section>
    <section class="admin-stats">
      <div><span>Estabelecimentos</span><strong>${state.estabs.length}</strong></div>
      <div><span>Admins</span><strong>${state.adminEstabs.length}</strong></div>
      <div><span>Pagamentos</span><strong>${state.pagamentos.length}</strong></div>
    </section>
    <div class="admin-actions">
      <button class="secondary mini" data-route="admin-notif">Comunicados</button>
      <button class="secondary mini" data-route="admin-financeiro">Financeiro</button>
    </div>
  `, 'admin');
}

function render() {
  if (state.route === 'login') root.innerHTML = renderLogin();
  else if (state.route === 'detail') root.innerHTML = renderDetail();
  else if (state.route === 'stories') root.innerHTML = renderStories();
  else if (state.route === 'agenda') root.innerHTML = renderAgenda();
  else if (state.route === 'notificacoes') root.innerHTML = renderNotificacoes();
  else if (state.route === 'admin') root.innerHTML = renderAdmin();
  else if (state.route === 'super-admin') root.innerHTML = renderSuperAdmin();
  else if (state.route === 'admin-notif') root.innerHTML = renderAdminNotif();
  else if (state.route === 'postar-story') root.innerHTML = renderPostarStory();
  else if (state.route === 'conta-bancaria') root.innerHTML = renderContaBancaria();
  else if (state.route === 'relatorio-financeiro') root.innerHTML = renderRelatorioFinanceiro();
  else if (state.route === 'simulacao-divulgacao') root.innerHTML = renderSimulacaoDivulgacao();
  else if (state.route === 'ia-demo') root.innerHTML = renderIADemo();
  else if (state.route === 'admin-estab') root.innerHTML = renderAdminEstab();
  else if (state.route === 'admin-planos') root.innerHTML = renderAdminPlanos();
  else if (state.route === 'admin-financeiro') root.innerHTML = renderAdminFinanceiro();
  else root.innerHTML = renderHome();
}

async function refreshRoute() {
  try {
    if (!state.estabs.length) await loadEstabs();
    if (!state.stories.length) await loadStories();
    if (state.user && !state.admin) await loadCliente();
    if (state.admin) await loadAdmin();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao carregar dados.');
  } finally {
    state.loading = false;
    render();
  }
}

root.addEventListener('click', async event => {
  const target = event.target.closest('[data-route], [data-action], [data-estab], [data-service], [data-date], [data-time], [data-mode], [data-filter], [data-auth-tab]');
  if (!target) return;
  try {
    if (target.dataset.route) {
      if (target.dataset.editEstab) sessionStorage.setItem('beautyhub_edit_estab', target.dataset.editEstab);
      else if (target.dataset.route === 'admin-estab') sessionStorage.removeItem('beautyhub_edit_estab');
      state.route = target.dataset.route;
      render();
      await refreshRoute();
      return;
    }
    if (target.dataset.mode) {
      state.mode = target.dataset.mode;
      state.authTab = 'login';
      render();
      return;
    }
    if (target.dataset.authTab) {
      state.authTab = target.dataset.authTab;
      render();
      return;
    }
    if (target.dataset.filter) {
      state.filtro = target.dataset.filter;
      render();
      return;
    }
    if (target.dataset.estab) {
      await selectEstab(target.dataset.estab);
      return;
    }
    if (target.dataset.service) {
      if (!state.user || state.admin) {
        state.mode = 'cliente';
        state.route = 'login';
        render();
        toast('Entre como cliente para agendar.');
        return;
      }
      state.booking.servicoNome = target.dataset.service;
      state.booking.horario = '';
      render();
      return;
    }
    if (target.dataset.date) {
      if (!state.user || state.admin) {
        state.mode = 'cliente';
        state.route = 'login';
        render();
        toast('Entre como cliente para agendar.');
        return;
      }
      state.booking.data = getDatas(state.selectedEstab).find(d => d.full === target.dataset.date);
      state.booking.horario = '';
      await loadOcupados();
      render();
      return;
    }
    if (target.dataset.time) {
      if (!state.user || state.admin) {
        state.mode = 'cliente';
        state.route = 'login';
        render();
        toast('Entre como cliente para agendar.');
        return;
      }
      state.booking.horario = target.dataset.time;
      render();
      return;
    }

    const action = target.dataset.action;
    if (action === 'back') {
      state.route = state.admin ? 'admin' : 'home';
      render();
    } else if (action === 'logout') {
      await signOut(auth);
      state.admin = null;
      state.cliente = null;
      state.route = 'home';
      await refreshRoute();
    } else if (action === 'login-email' || action === 'signup-email') {
      const nome = document.getElementById('authNome')?.value?.trim() || '';
      const email = document.getElementById('authEmail')?.value?.trim() || '';
      const senha = document.getElementById('authSenha')?.value || '';
      if (!email || !senha) throw new Error('Informe email e senha.');
      if (action === 'signup-email' && !nome) throw new Error('Informe o nome.');
      if (state.mode === 'admin') {
        if (action === 'signup-email') await criarAdmin(nome, email, senha);
        else await loginAdminEmail(email, senha);
      } else {
        if (action === 'signup-email') await criarCliente(nome, email, senha);
        else await loginClienteEmail(email, senha);
      }
    } else if (action === 'login-google') {
      await googleFlow(state.mode);
    } else if (action === 'confirm-booking') {
      state.booking.nome = document.getElementById('nomeCliente')?.value || '';
      state.booking.formaPagamento = document.getElementById('formaPagamento')?.value || 'local';
      await confirmarAgendamento();
    } else if (action === 'read-notification') {
      await updateDoc(doc(db, 'notificacoes', target.dataset.id), { lida: true });
      await loadCliente();
      render();
    } else if (action === 'save-estab') {
      await salvarEstabelecimento();
    } else if (action === 'finish-booking') {
      await call('concluirAgendamento', { agendamentoId: target.dataset.id });
      await loadAdmin();
      render();
    } else if (action === 'cancel-booking') {
      await call('cancelarAgendamento', { agendamentoId: target.dataset.id });
      await loadAdmin();
      render();
    } else if (action === 'start-trial') {
      await call('iniciarTrial', { estabelecimentoId: target.dataset.estabAdmin });
      await loadAdmin();
      render();
    } else if (action === 'request-seal') {
      await call('solicitarSelo', { estabelecimentoId: target.dataset.estabAdmin });
      await loadAdmin();
      render();
    } else if (action === 'boost-estab') {
      await call('criarPagamentoPixImpulsionamento', { estabelecimentoId: target.dataset.estabAdmin, pacoteId: target.dataset.package });
      toast('Pagamento de impulsionamento gerado.');
    } else if (action === 'create-sub-pix') {
      const data = await call('criarPagamentoPixAssinatura', {
        estabelecimentoId: target.dataset.estabAdmin,
        plano: target.dataset.plan,
        valor: Number(target.dataset.value || 0),
      });
      if (data.qrCode || data.qr_code || data.ticketUrl || data.link) {
        const link = data.ticketUrl || data.link || data.initPoint || '';
        toast(link ? 'Pagamento Pix gerado.' : 'Pix gerado. Copie o codigo no painel financeiro.');
        if (link) window.open(link, '_blank');
      } else {
        toast('Pagamento Pix gerado.');
      }
    } else if (action === 'post-story') {
      const estabelecimentoId = document.getElementById('storyEstab')?.value || '';
      const texto = document.getElementById('storyTexto')?.value?.trim() || '';
      const midiaUrl = document.getElementById('storyMidia')?.value?.trim() || '';
      if (!estabelecimentoId || !texto) throw new Error('Informe estabelecimento e texto.');
      await setDoc(doc(collection(db, 'stories')), {
        estabelecimentoId,
        adminId: state.admin.id,
        nomeAdmin: state.admin.nome || 'BeautyHub',
        texto,
        midiaUrl,
        ativo: true,
        criadoEm: serverTimestamp(),
      });
      toast('Story publicado.');
      state.route = 'admin';
      await refreshRoute();
    } else if (action === 'save-bank') {
      await call('salvarDadosConta', {
        estabelecimentoId: document.getElementById('contaEstab')?.value || '',
        responsavelNome: document.getElementById('contaNome')?.value?.trim() || '',
        responsavelCpf: document.getElementById('contaCpf')?.value?.trim() || '',
        responsavelTelefone: document.getElementById('contaTelefone')?.value?.trim() || '',
        responsavelEmail: document.getElementById('contaEmail')?.value?.trim() || '',
        pixChave: document.getElementById('contaPix')?.value?.trim() || '',
        pixTipo: document.getElementById('contaPixTipo')?.value || 'email',
      });
      await loadAdmin();
      toast('Conta bancaria salva.');
    } else if (action === 'generate-report') {
      const data = await call('gerarRelatorioFinanceiro', {
        estabelecimentoId: document.getElementById('relEstab')?.value || '',
        dataInicio: document.getElementById('relInicio')?.value?.trim() || '',
        dataFim: document.getElementById('relFim')?.value?.trim() || '',
      });
      const el = document.getElementById('reportResult');
      if (el) el.innerHTML = data.url ? `<a class="secondary" href="${html(data.url)}" target="_blank">Abrir relatorio</a>` : 'Relatorio gerado.';
      toast('Relatorio gerado.');
    } else if (action === 'generate-ai') {
      const data = await call('gerarSimulacaoIA', {
        estabelecimentoId: document.getElementById('iaEstab')?.value || '',
        categoria: document.getElementById('iaCategoria')?.value || 'cabelo',
        imagemUrl: document.getElementById('iaImagem')?.value?.trim() || '',
      });
      const el = document.getElementById('iaResult');
      if (el) el.innerHTML = data.imagemUrl ? `<img class="cover" src="${html(data.imagemUrl)}" alt="Simulacao IA" />` : 'Simulacao gerada.';
      toast('Simulacao gerada.');
    }
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao executar acao.');
  }
});

root.addEventListener('input', event => {
  if (event.target?.id === 'busca') {
    state.busca = event.target.value;
    render();
  }
});

onAuthStateChanged(auth, async user => {
  state.user = user;
  state.admin = null;
  state.cliente = null;
  if (user) {
    const [adminSnap, clienteSnap] = await Promise.all([
      getDoc(doc(db, 'admins', user.uid)),
      getDoc(doc(db, 'clientes', user.uid)),
    ]);
    if (adminSnap.exists() && adminSnap.data()?.ativo) state.admin = { id: user.uid, ...adminSnap.data() };
    else if (clienteSnap.exists()) state.cliente = { id: user.uid, ...clienteSnap.data() };
  }
  if (state.route === 'login') state.route = state.admin?.cargo === 'Super Admin' ? 'super-admin' : state.admin ? 'admin' : 'home';
  await refreshRoute();
});

resolverGoogleRedirect()
  .then(refreshRoute)
  .catch(error => {
    console.error(error);
    state.loading = false;
    render();
    toast(error.message || 'Erro ao iniciar.');
  });
