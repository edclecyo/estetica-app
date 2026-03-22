export interface Admin {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: 'Super Admin' | 'Admin';
  ativo: boolean;
  fotoPerfil?: string;
  fcmToken?: string;
}

export interface Servico {
  id: string;
  nome: string;
  preco: number;
  duracao: number;
  ativo: boolean;
  descricao?: string;
  foto?: string;
}

export interface Estabelecimento {
  id: string;
  nome: string;
  tipo: string;
  avaliacao: number;
  totalAvaliacoes?: number;
  quantidadeAvaliacoes?: number;
  somaNotas?: number;
  avaliacoesNegativas?: number;
  img: string;
  fotoPerfil?: string;
  capa?: string;
  cor: string;
  endereco: string;
  cidade: string;
  telefone: string;
  descricao: string;
  horarioFuncionamento: string;
  servicos: Servico[];
  horarios: string[];
  adminId: string;
  ativo: boolean;
  // Localização
  lat?: number;
  lng?: number;
  coords?: { lat: number; lng: number };
  // Assinatura
  plano?: 'free' | 'trial' | 'essencial' | 'pro' | 'elite';
  assinaturaAtiva?: boolean;
  assinaturaId?: string;
  statusPagamento?: string;
  expiraEm?: Date;
  // Destaque
  destaqueAtivo?: boolean;
  destaqueExpira?: Date;
  rankingScore?: number;
  // FCM
  fcmToken?: string;
  tokenAtualizadoEm?: any;
  ultimaAtualizacao?: any;
  ultimaLimpezaReputacao?: any;
  historicoCancelamento?: number;
}

export type StatusAgendamento = 'confirmado' | 'cancelado' | 'concluido' | 'pendente';

export interface Agendamento {
  id: string;
  estabelecimentoId: string;
  estabelecimentoNome: string;
  servicoId?: string;
  servicoNome: string;
  servicoPreco: number;
  clienteNome: string;
  clienteUid?: string;
  clienteTelefone?: string;
  data: string;
  horario: string;
  status: StatusAgendamento;
  adminId?: string;
  // ✅ Campos novos de avaliação
  avaliacaoCliente?: number;
  avaliacaoTags?: string[];
  avaliado?: boolean;
  avaliadoEm?: any;
  // Controle de notificação
  notificado?: boolean;
  notifLida?: boolean;
  notifApagada?: boolean;
  visivelAdmin?: boolean;
  criadoEm: any;
}

export type RootStackParamList = {
  // Cliente
  HomeTabs: { screen?: string } | undefined;
  Home: undefined;
  Detalhe: { estabelecimentoId: string };
  Agendamentos: undefined;
  ClienteLogin: { estabelecimentoId?: string } | undefined;
  Avaliar: {
    agendamentoId: string;
    estabelecimentoNome: string;
    estabelecimentoId: string;
  };
  NotificacoesCliente: undefined;
  StoryView: {
    stories: any[];
    startIndex: number;
    onVisto?: (id: string) => void;
  };
  // Admin
  AdminLogin: undefined;
  AdminDash: undefined;
  AdminEstab: { estabelecimentoId: string };
  AdminNotif: undefined;
  PostarStory: { estabelecimentoId?: string } | undefined;
  Assinatura: undefined;
};