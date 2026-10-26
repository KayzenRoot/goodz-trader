const FRIENDLY_MESSAGES: Record<number, string> = {
  401: 'API key inválida ou expirada.',
  402: 'API key expirada.',
  406: 'IP não autorizado na whitelist da MEXC.',
  500: 'Erro interno da MEXC. Tente novamente.',
  501: 'MEXC ocupada. Tente novamente em instantes.',
  506: 'Origem da requisição não reconhecida.',
  510: 'Rate limit da MEXC atingido. Reduza a frequência.',
  511: 'Endpoint temporariamente indisponível.',
  513: 'Relógio do servidor fora da janela permitida.',
  600: 'Parâmetro inválido enviado à MEXC.',
  601: 'Falha ao decodificar a resposta da MEXC.',
  602: 'Assinatura inválida. Verifique a API secret.',
  603: 'Requisição duplicada.',
  701: 'A API key precisa de permissão de leitura de conta.',
  702: 'A API key precisa de permissão de modificação de conta.',
  703: 'A API key precisa de permissão de leitura de trades.',
  704: 'A API key precisa de permissão de negociação.',
  1000: 'Conta não encontrada.',
  1001: 'Contrato não encontrado.',
  1004: 'Valor inválido.',
  2005: 'Saldo insuficiente na MEXC.',
  2006: 'Alavancagem inválida para o contrato.',
  2007: 'Preço da ordem inválido.',
  2015: 'Precisão de preço ou quantidade inválida.',
  2019: 'Já existe uma posição ativa.',
  2021: 'A alavancagem não é consistente com a posição existente.',
  2031: 'Limite de risco excedido.',
  2037: 'Muitas requisições. Aguarde antes de tentar novamente.',
  5001: 'Take profit e stop loss inválidos.',
  6001: 'Negociação bloqueada para esta conta.',
  6002: 'Abertura de posições bloqueada.',
  6005: 'Par de negociação indisponível.',
};

const RETRYABLE = new Set([500, 501, 510, 2037]);

export class MexcApiError extends Error {
  public readonly retryable: boolean;
  public readonly friendly: string;

  constructor(
    message: string,
    public readonly code: number | string,
    public readonly endpoint: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'MexcApiError';
    this.retryable = typeof code === 'number' ? RETRYABLE.has(code) : false;
    this.friendly =
      typeof code === 'number'
        ? (FRIENDLY_MESSAGES[code] ?? message)
        : message || 'Falha ao comunicar com a MEXC.';
  }
}

export function isMexcApiError(error: unknown): error is MexcApiError {
  return error instanceof MexcApiError;
}
