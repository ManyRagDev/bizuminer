/**
 * Espelho web de packages/capture/src/automated-capture.ts (OS-032).
 * Flags legadas permanecem no tipo por compatibilidade, mas nunca concedem
 * acesso automatizado. Parser e fixtures offline não dependem deste gate.
 */
export interface AutomatedCaptureEnv {
  readonly ML_AUTOMATED_CAPTURE_ENABLED?: string;
  readonly ML_AUTOMATED_CAPTURE_PRODUCTION?: string;
  readonly NODE_ENV?: string;
}

export function mlAutomatedCaptureEnabled(_env: AutomatedCaptureEnv = process.env): boolean {
  return false;
}

/** Consentimento também não autoriza coleta automatizada de ML. */
export function mlCaptureAllowedWithConsent(_consent: boolean, _env: AutomatedCaptureEnv = process.env): boolean {
  return false;
}
