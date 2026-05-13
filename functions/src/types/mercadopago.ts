// ─────────────────────────────────────────────
// 📦 PREAPPROVAL (ASSINATURA)
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// 🔗 LINK DE PAGAMENTO
// ─────────────────────────────────────────────
export interface MercadoPagoResponse {
  init_point: string;
  id: string;
}

// ─────────────────────────────────────────────
// 💰 PIX / QR PAYMENT
// ─────────────────────────────────────────────
export interface MPQrResponse {
  id: number | string;
  status?: string;
  status_detail?: string;
  payment_type_id?: 'pix' | 'credit_card' | string;
  external_reference?: string;

  point_of_interaction?: {
    type?: string;

    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
      copy_link?: string;
    };
  };
}

// ─────────────────────────────────────────────
// 👤 CUSTOMER
// ─────────────────────────────────────────────
export type MPCustomerResponse = {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
};

// ─────────────────────────────────────────────
// 💳 CARD
// ─────────────────────────────────────────────
export type MPCardResponse = {
  id: string;
  customer_id?: string;
  last_four_digits?: string;
  expiration_month?: number;
  expiration_year?: number;
};

// ─────────────────────────────────────────────
// 🔁 PREAPPROVAL COMPLETO
// ─────────────────────────────────────────────
export type MPPreapprovalResponse = {
  id: string;

  status:
    | 'authorized'
    | 'paused'
    | 'cancelled'
    | 'pending'
    | 'in_process'
    | 'rejected'
    | 'suspended';

  application_id?: number;
  reason?: string;

  external_reference?: string; // 🔥 vincular com seu estabelecimentoId

  next_payment_date?: string;

  init_point?: string;

  payer_email?: string;
};

// ─────────────────────────────────────────────
// 🔔 WEBHOOK PAYLOAD
// ─────────────────────────────────────────────
export interface MPWebhookPayload {
  action:
    | 'payment.created'
    | 'payment.updated'
    | 'subscription_preapproval'
    | string; // 🔥 fallback (MP muda eventos)

  api_version: string;

  data: {
    id: string | number; // 🔥 webhook pode variar
  };

  date_created: string;

  id: number;

  live_mode: boolean;

  type:
    | 'payment'
    | 'preapproval'
    | 'subscription'
    | string;

  user_id: string | number;
}