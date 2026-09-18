/**
 * Utilitário de cópia para a área de transferência universal e resiliente.
 * Suporta contextos seguros (HTTPS, localhost) com `navigator.clipboard`
 * e contextos não seguros (HTTP em IP de rede local, como 192.168.x.x no celular)
 * usando fallback clássico de textarea e `document.execCommand("copy")`.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 1. Tenta API moderna do Clipboard se disponível (HTTPS / localhost)
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Falhou ou bloqueou permissão, tenta fallback abaixo
    }
  }

  // 2. Fallback para HTTP / IP local (ex: http://192.168.5.110:3100 no celular)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    textArea.setAttribute("readonly", "");

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
