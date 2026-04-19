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
  id: number; // Alterado para number para evitar casting repetitivo
  status?: string;
  status_detail?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code: string;
      qr_code_base64: string;
      ticket_url?: string;
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
};
