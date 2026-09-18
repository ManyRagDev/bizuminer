import { randomInt } from "node:crypto";

/**
 * Código curto do link de compartilhamento (`bizuminer.com.br/p/x7k2`).
 *
 * POR QUE EXISTE
 *
 * Status de WhatsApp exibe o texto que você colou, e a URL longa
 * (`.../bizu/ml-MLB54964804`, 48 caracteres) ocupava DUAS linhas gigantes
 * embaixo do card de preview — medido em campo, print de 29/08/2026. Não dá
 * para apagar o texto: remover a URL derruba o preview junto. A única saída é
 * encurtar a própria URL. Com 4 caracteres a linha fica única.
 *
 * O ganho seguinte (telemetria por link) é real mas secundário; o motivo de
 * existir é o defeito visual.
 */

/**
 * ALFABETO SEM AMBIGUIDADE
 *
 * Ninguém copia texto de uma imagem nem de um status: o código precisa ser
 * DIGITÁVEL por quem está olhando a tela. Por isso ficam de fora os pares que
 * se confundem em qualquer fonte — `0/o`, `1/l/i`, `5/s`. Tudo minúsculo, para
 * não obrigar ninguém a caçar o shift.
 *
 * Sobram 29 símbolos. Vogais permanecem (exceto `i` e `o`), então palavra
 * ofensiva acidental é possível; se um dia isso aparecer em campo, a correção
 * é uma lista de bloqueio aqui, não uma troca de alfabeto.
 */
export const SHORT_CODE_ALPHABET = "abcdefghjkmnpqrtuvwxyz2346789";

export const SHORT_CODE_LENGTH = 4;

/** 29⁴ = 707.281 combinações. */
export const SHORT_CODE_SPACE = SHORT_CODE_ALPHABET.length ** SHORT_CODE_LENGTH;

const CODE_PATTERN = new RegExp(`^[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`);

/**
 * Sorteia um código.
 *
 * `randomInt` do `node:crypto` e não `Math.random()`: além de ser gerador
 * fraco, `Math.random()` com `Math.floor(x * 29)` introduz viés de módulo —
 * alguns símbolos sairiam com frequência maior. Aqui não é questão de
 * criptografia e sim de não estreitar o espaço na prática.
 *
 * SORTEIO, NÃO DERIVAÇÃO
 *
 * A alternativa natural seria derivar o código do produto (hash do id, ou o
 * timestamp de captura). As duas falham, e não por implementação:
 *
 * - Qualquer função que leve um conjunto grande para 707.281 casas COLIDE
 *   (casa dos pombos). Derivar não evita a colisão — só a torna permanente,
 *   sem chance de nova tentativa. É estritamente pior que sortear.
 * - Timestamp em milissegundos dá volta a cada 11,8 minutos; em segundos, a
 *   cada 8,2 dias. Como a captura insere em lote, produtos da mesma rodagem
 *   nasceriam com o mesmo código.
 *
 * Colisão de sorteio existe (aniversário: a primeira aparece por volta de
 * 1.054 códigos, não de 707.281), e é por isso que a coluna é `unique` e a
 * inserção tenta de novo. Ver `short-link-db.ts`.
 */
export function generateShortCode(): string {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i += 1) {
    code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Valida o formato antes de qualquer ida ao banco — o `/p/[code]` recebe o que
 * o mundo mandar, e string arbitrária não deve virar consulta.
 */
export function isValidShortCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
