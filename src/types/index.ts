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
  img: string; // Emoji ou ID da imagem
  fotoPerfil?: string; // URL do Firebase Storage (usado na sua Home)
  cor: string;
  endereco: string;
  cidade: string;
  telefone: string;
  descricao: string;
  horarioFuncionamento: string;
  diasFuncionamento?: string[]; // Necessário para a função 'estaAberto'
  servicos: Servico[];
  horarios: string[];
  adminId: string;
  ativo: boolean;
  verificado?: boolean; // Usado na Seção de Verificados
  plano?: 'bronze' | 'silver' | 'gold' | 'elite'; // Para o selo 'Elite'
  // Suporte a Coordenadas (GPS)
  coords?: {
    lat: number;
    lng: number;
  };
  lat?: number; // Fallback caso não use o objeto coords
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