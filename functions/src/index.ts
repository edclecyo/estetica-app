/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTETICA APP (BEAUTY HUB) - BACKEND CENTRAL
 * ─────────────────────────────────────────────────────────────────────────────
 */

// 1. SERVICES (Cloud Functions chamadas diretamente pelo App via onCall)
// Responsáveis por Auth, CRUD de Agendamentos, Planos e Geração de Cobranças.
export * from './services/auth.service';
export * from './services/agendamento.service';
export * from './services/assinatura.service';
export * from './services/pagamento.service';
export * from './services/conta.service';
export * from './services/selo.service';
export * from './services/avaliacao.service';
export * from './services/story.service';
export * from './services/comunicado.service';
export * from './services/relatorio.service';
export * from './services/ia.service';
export * from './services/metricas.service';

// 2. TRIGGERS (Gatilhos de Banco de Dados)
// Funções que rodam sozinhas quando algo muda no Firestore (onDocumentCreated, etc).
export * from './triggers/notificacao.trigger';
export * from './triggers/agendamento.trigger';
export * from './triggers/superAdminEstabelecimento.trigger';

// 3. SCHEDULES (Tarefas Agendadas)
// Funções que rodam em horários específicos (CRON) para enviar lembretes e limpar dados.
export * from './schedules/lembretes.schedule';
export * from './schedules/manutencao.schedule';
export * from './schedules/autoConcluirAgendamentos';
export * from './schedules/destaqueVencimento.schedule';


// 4. API (Webhooks Externos)
// Porta de entrada para o Mercado Pago avisar quando um pagamento foi aprovado.
export * from './api/webhook.mercadopago';

/**
 * NOTA DE DEPLOY:
 * Para subir todas as funções de uma vez:
 * > firebase deploy --only functions
 * * Para subir apenas um serviço específico (ex: pagamentos):
 * > firebase deploy --only functions:criarPagamentoCliente
 */
