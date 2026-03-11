// ─── Admin ─────────────────────────────────────────────────────────────────
export interface Admin {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  avatar: string;
  cargo: 'Super Admin' | 'Admin' | 'Gerente';
  estabelecimentoId?: string;
  criadoEm: Date;
  ativo: boolean;
}

// ─── Serviço ────────────────────────────────────────────────────────────────
export interface Servico {
  id: string;
  nome: string;
  preco: number;
  duracao: number;
  ativo: boolean;
  descricao?: string;
}

// ─── Estabelecimento ────────────────────────────────────────────────────────
export interface Estabelecimento {
  id: string;
  nome: string;
  tipo: string;
  avaliacao: number;
  img: string;
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
  criadoEm: Date;
}

// ─── Agendamento ────────────────────────────────────────────────────────────
export type StatusAgendamento = 'confirmado' | 'cancelado' | 'concluido' | 'pendente';

export interface Agendamento {
  id: string;
  estabelecimentoId: string;
  estabelecimentoNome: string;
  servicoNome: string;
  servicoPreco: number;
  clienteNome: string;
  clienteTelefone?: string;
  data: string;
  horario: string;
  status: StatusAgendamento;
  criadoEm: Date;
}

// ─── Navegação ──────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Home: undefined;
  Detalhe: { estabelecimentoId: string };
  Agendamentos: undefined;
  AdminLogin: undefined;
  AdminDash: undefined;
  AdminEstab: { estabelecimentoId: string };
};