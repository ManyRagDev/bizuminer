/** Translate known machine failures without exposing provider bodies or arbitrary errors. */
export function automatedTriageFailureMessage(code: unknown): string {
  switch (code) {
    case "automatic_curation_active":
      return "A curadoria automática está ativa. A avaliação, comparação e seleção são executadas em segundo plano; acompanhe o andamento sem repetir a análise anterior.";
    case "ai_curation_call_limit_reached":
      return "O limite total de 20 chamadas de IA do BizuMiner foi atingido. Novas análises estão bloqueadas até uma nova autorização. As capturas continuam salvas.";
    case "ai_curation_call_budget_not_configured":
    case "ai_curation_call_budget_unavailable":
      return "Não foi possível confirmar o limite de chamadas da IA. Nenhuma nova requisição será enviada sem essa proteção. Confira a configuração do servidor.";
    case "openrouter_authentication_failed":
    case "openrouter_key_missing_or_invalid":
    case "gemini_key_missing":
      return "A credencial do serviço de IA foi recusada, está ausente ou expirou. Atualize a configuração da IA neste ambiente antes de tentar novamente. As capturas continuam salvas.";
    case "openrouter_budget_exhausted":
      return "O orçamento do serviço de IA se esgotou. Confira o limite e o saldo configurados antes de continuar. As capturas continuam salvas.";
    case "openrouter_rate_limited":
      return "O serviço de IA atingiu o limite temporário de requisições. Aguarde antes de iniciar outra análise.";
    case "triage_in_progress":
      return "Já existe uma triagem em andamento.";
    case "forbidden":
      return "Sua sessão não permite iniciar a análise nesta conta. Entre novamente e confira a conta selecionada.";
    case "openrouter_response_invalid":
      return "O serviço de IA devolveu uma resposta fora do formato esperado. Confira o histórico e as decisões já salvas antes de repetir a análise.";
    case "openrouter_request_blocked":
      return "O serviço de IA bloqueou esta requisição. Confira as permissões da chave e do modelo configurado antes de continuar.";
    case "triage_incomplete":
      return "A análise terminou parcialmente. Confira o histórico e as decisões já salvas antes de continuar.";
    case "openrouter_timeout":
    case "openrouter_unavailable":
    case "openrouter_transport_failed":
    case "openrouter_attributes_unconfirmed":
      return "O serviço de IA não confirmou a conclusão da análise. Confira o histórico antes de tentar novamente.";
    default:
      return "A análise não terminou. Consulte o histórico para verificar o erro e as decisões já salvas antes de tentar novamente.";
  }
}
