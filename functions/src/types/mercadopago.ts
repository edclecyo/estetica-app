export type MercadoPagoPreapproval = {
  id: string;
  status:
    | 'authorized'
    | 'paused'
    | 'cancelled'
    | 'pending'
    | 'in_process'
    | 'rejected'
    | 'suspended';
  last_modified?: string;
};

export interface MercadoPagoResponse {
  init_point: string;
  id: string;
}

/**
 * Interface para pagamentos via QR Code / PIX
 * O 'id' do pagamento no Mercado Pago é tipicamente um number (int64)
 */
export interface MPQrResponse {
  id: number;
  status?: string;
  status_detail?: string;
  point_of_interaction?: {
    type?: string;
    transaction_data?: {
      qr_code?: string; // Opcional por segurança
      qr_code_base64?: string;
      ticket_url?: string;
      copy_link?: string; // Útil para o botão "Copiar e Colar"
    };
  };
}

export type MPCustomerResponse = {
  id: string;
  email?: string;
  first_name?: string;
};

export type MPCardResponse = {
  id: string;
  customer_id?: string;
  last_four_digits?: string;
};

export type MPPreapprovalResponse = {
  id: string;
  status: 'authorized' | 'paused' | 'cancelled' | 'pending' | 'in_process' | 'rejected' | 'suspended';
  application_id?: number;
  reason?: string;
  external_reference?: string; // Importante para vincular ao seu estabelecimentoId
  next_payment_date?: string;   // Útil para mostrar ao usuário "Próxima cobrança em..."
  init_point?: string;         // Link caso ele precise completar alguma ação
};

export interface MPWebhookPayload {
  action: string; // ex: "payment.created" ou "payment.updated"
  api_version: string;
  data: {
    id: string; // Note: aqui o ID costuma vir como String no payload do webhook
  };
  date_created: string;
  id: number;
  live_mode: boolean;
  type: string; // ex: "payment" ou "plan"
  user_id: string;
}