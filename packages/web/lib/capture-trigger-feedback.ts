export interface CaptureTriggerErrorPayload {
  error?: string;
  message?: string;
}

const KNOWN_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  no_session: "Sessão expirada. Entre novamente no painel antes de iniciar uma rodagem.",
  invalid_origin:
    "Origem da requisição rejeitada (403). Confira se NEXT_PUBLIC_SITE_URL não aponta para outro domínio neste servidor.",
  capture_trial_not_authorized: "O ensaio de captura não está autorizado para esta conta.",
  forbidden: "Permissão insuficiente para disparar captura nesta conta (403).",
  batch_in_progress: "Já há uma captura em andamento.",
  capture_batch_not_resumable: "Esta rodagem não permite retomada segura. Confira os detalhes; resultados incertos exigem reconciliação e rodadas com mais de 48 horas exigem uma nova captura.",
  no_enabled_marketplace: "A captura da Shopee está desligada ou a credencial da conta está indisponível. Confira as configurações antes de tentar novamente.",
  github_token_not_configured:
    "O executor de captura precisa ser configurado no servidor. Nenhum lote foi iniciado.",
  durable_capture_executor_not_configured:
    "O executor de captura precisa ser configurado no servidor. Nenhum lote foi iniciado.",
  dispatch_failed:
    "O executor não confirmou o início. O lote foi encerrado; confira a configuração antes de tentar novamente.",
  no_marketplace_selected: "Selecione pelo menos uma loja.",
  manual_capture_only:
    "A captura do Mercado Livre é exclusivamente manual. Utilize a extensão ou o bookmarklet no navegador.",
};

/** Maps HTTP status and API error codes from capture dispatch routes to operator messages. */
export function captureTriggerFailureMessage(
  status: number,
  payload: CaptureTriggerErrorPayload,
): string | null {
  if (payload.error && payload.error in KNOWN_ERROR_MESSAGES) {
    return payload.error === "capture_trial_not_authorized" && payload.message
      ? payload.message
      : KNOWN_ERROR_MESSAGES[payload.error]!;
  }
  if (payload.message) return payload.message;
  if (status === 401) return KNOWN_ERROR_MESSAGES.no_session!;
  if (status === 403) return KNOWN_ERROR_MESSAGES.forbidden!;
  return null;
}
