export type PlanoId =
  | 'free'
  | 'trial'
  | 'essencial'
  | 'pro'
  | 'elite'
  | 'bronze'
  | 'silver'
  | 'gold';

export interface Admin {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: 'Super Admin' | 'Admin';
  ativo: boolean;
  fotoPerfil?: string;
  plano?: PlanoId;
  vencimentoPlano?: any;
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

export interface Profissional {
  id: string;
  nome: string;
  funcao: string;
  foto?: string;
  ativo?: boolean;
}

export interface Estabelecimento {
  id: string;
  nome: string;
  tipo: string;
  avaliacao: number;
  totalAvaliacoes: number;
  img: string;
  fotoPerfil?: string;
  fotoCapa?: string;
  cor: string;
  endereco: string;
  bairro?: string;
  numero?: string;
  cep?: string;
  cidade: string;
  telefone: string;
  descricao: string;
  horarioFuncionamento: string;
  diasFuncionamento?: string[];
  intervaloMin?: number;
  horarioPausa?: {
    ativo: boolean;
    inicio: string;
    fim: string;
  };
  diasFechados?: string[];
  horariosBloqueados?: Record<string, string[]>;
  profissionais?: Profissional[];
  servicos: Servico[];
  horarios: string[];
  adminId: string;
  ativo: boolean;
  principal?: boolean;
  verificado?: boolean;
  verificadoManual?: boolean;
  verificadoAutomatico?: boolean;
  assinaturaAtiva?: boolean;
  expiraEm?: any;
  trialUsado?: boolean;
  plano?: PlanoId;
  planoPendente?: PlanoId;
  planoAprovado?: PlanoId;
  statusPlano?: 'ativo' | 'trial' | 'inativo' | string;
  pagamentoAppAtivo?: boolean;
  pixChave?: string;
  pixTipo?: string;
  responsavelNome?: string;
  responsavelTelefone?: string;
  responsavelEmail?: string;
  responsavelCpf?: string;
  avaliacoesNegativas?: number;
  totalAtendimentos?: number;
  destaqueAtivo?: boolean;
  destaqueBasicoAtivo?: boolean;
  destaqueExpira?: any;
  destaquePacoteId?: string | null;
  destaquePacoteNome?: string | null;
  destaquePacoteDias?: number;
  destaqueAvisoVencimentoEm?: any;
  destaqueAvisoVencimentoExpiraEm?: any;
  iaSimulacaoAtiva?: boolean;
  iaSimulacaoLimiteMensal?: number;
  iaSimulacaoPacote?: string | null;
  paymentStatus?:
    | 'idle'
    | 'none'
    | 'pending'
    | 'approved'
    | 'failed'
    | 'rejected'
    | 'cancelled'
    | string;
  coords?: {
    lat: number;
    lng: number;
  };
  lat?: number;
  lng?: number;
}

export type StatusAgendamento =
  | 'confirmado'
  | 'cancelado'
  | 'concluido'
  | 'pendente'
  | 'aguardando_pagamento';

export interface Avaliacao {
  estrelas: number;
  tags: string[];
  criadoEm: Date;
}

export interface Agendamento {
  id: string;
  estabelecimentoId: string;
  estabelecimentoNome: string;
  servicoNome: string;
  servicoPreco: number;
  clienteId?: string;
  clienteUid?: string;
  clienteNome: string;
  clienteTelefone?: string;
  data: string;
  horario: string;
  status: StatusAgendamento;
  formaPagamento?: 'app' | 'local' | string;
  statusPagamento?:
    | 'aguardando_comprovante'
    | 'approved'
    | 'pending'
    | 'rejected'
    | string;
  concluidoEm?: any;
  canceladoEm?: any;
  avaliacao?: Avaliacao;
  criadoEm: any;
  notifLida?: boolean;
  notifApagada?: boolean;
}

export type RootStackParamList = {
  Home: undefined;
  Detalhe: { estabelecimentoId: string };
  RotaMapa: {
    estabelecimentoNome: string;
    endereco?: string;
    origem: { lat: number; lng: number };
    destino: { lat: number; lng: number };
  };
  Agendamentos: undefined;
  AdminLogin: undefined;
  AdminDash: undefined;
  AdminEstab: { estabelecimentoId: string };
  SimulacaoDivulgacaoScreen: {
    estabelecimentoId?: string;
    estabelecimentoNome?: string;
  };
  Avaliar: {
    agendamentoId: string;
    estabelecimentoNome: string;
    estabelecimentoId: string;
  };
  ClienteLogin: undefined;
  NotificacoesCliente: undefined;
};
