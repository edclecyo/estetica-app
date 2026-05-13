export interface Admin {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: 'Super Admin' | 'Admin';
  ativo: boolean;
  // Adicionado para controle de acesso que fizemos no Dash
  plano?: 'bronze' | 'silver' | 'gold' | 'elite';
  vencimentoPlano?: any; 
}

export interface Servico {
  id: string;
  nome: string;
  preco: number;
  duracao: number;
  ativo: boolean;
  descricao?: string;
}

export interface Estabelecimento {
  id: string;
  nome: string;
  tipo: string;
  avaliacao: number;
  totalAvaliacoes: number;
  img: string;
  fotoPerfil?: string;
  cor: string;
  endereco: string;
  cidade: string;
  telefone: string;
  descricao: string;
  horarioFuncionamento: string;
  diasFuncionamento?: string[];
  servicos: Servico[];
  horarios: string[];
  adminId: string;
  ativo: boolean;
  verificado?: boolean;
  plano?: 'bronze' | 'silver' | 'gold' | 'elite';

  // 🔥 AQUI QUE ENTRA
  paymentStatus?: 'none' | 'pending' | 'approved' | 'failed';

  coords?: {
    lat: number;
    lng: number;
  };
  lat?: number;
  lng?: number;
}

export type StatusAgendamento = 'confirmado' | 'cancelado' | 'concluido' | 'pendente';

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
  clienteId: string; // Importante para o cliente ver os dele
  clienteNome: string;
  clienteTelefone?: string;
  data: string;
  horario: string;
  status: StatusAgendamento;
  avaliacao?: Avaliacao;
  criadoEm: any; // Firestore Timestamp
  notifLida?: boolean;
  notifApagada?: boolean;
}

export type RootStackParamList = {
  Home: undefined;
  Detalhe: { estabelecimentoId: string };
  Agendamentos: undefined;
  AdminLogin: undefined;
  AdminDash: undefined;
  AdminEstab: { estabelecimentoId: string };
  Avaliar: { agendamentoId: string; estabelecimentoNome: string; estabelecimentoId: string };
  ClienteLogin: undefined; // Adicionado pois você usa na navegação da Home
  NotificacoesCliente: undefined; // Adicionado
};