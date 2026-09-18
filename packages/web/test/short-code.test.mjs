import assert from "node:assert/strict";
import test from "node:test";
import {
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  SHORT_CODE_SPACE,
  generateShortCode,
  isValidShortCode,
} from "../lib/short-code.ts";

test("o alfabeto não contém nenhum caractere ambíguo", () => {
  // A razão de existir do alfabeto: o código é DIGITADO por quem só está vendo
  // a tela do celular. Se algum destes voltar, some a garantia inteira.
  for (const ambiguous of ["0", "o", "1", "l", "i", "5", "s"]) {
    assert.ok(
      !SHORT_CODE_ALPHABET.includes(ambiguous),
      `alfabeto não pode conter "${ambiguous}"`,
    );
  }
});

test("o alfabeto não tem repetição e é todo minúsculo", () => {
  assert.equal(new Set(SHORT_CODE_ALPHABET).size, SHORT_CODE_ALPHABET.length);
  assert.equal(SHORT_CODE_ALPHABET, SHORT_CODE_ALPHABET.toLowerCase());
});

test("o espaço combinatório é 29^4 = 707.281", () => {
  // Número citado na decisão de projeto (colisão esperada por volta de 1.054
  // códigos, não de 707.281 — daí o unique + retry em short-link-db).
  assert.equal(SHORT_CODE_ALPHABET.length, 29);
  assert.equal(SHORT_CODE_SPACE, 707_281);
});

test("generateShortCode produz código válido, do tamanho certo e só com o alfabeto", () => {
  for (let i = 0; i < 500; i += 1) {
    const code = generateShortCode();
    assert.equal(code.length, SHORT_CODE_LENGTH);
    assert.ok(isValidShortCode(code), `código inválido gerado: ${code}`);
    for (const char of code) {
      assert.ok(SHORT_CODE_ALPHABET.includes(char), `caractere fora do alfabeto: ${char}`);
    }
  }
});

test("generateShortCode usa o alfabeto inteiro, sem símbolo morto", () => {
  // Erro de índice (off-by-one no randomInt) estreitaria o espaço em silêncio:
  // os códigos continuariam válidos, só que menos numerosos. Com 20 mil
  // sorteios, cada um dos 29 símbolos deve aparecer com folga.
  const seen = new Set();
  for (let i = 0; i < 20_000; i += 1) {
    for (const char of generateShortCode()) seen.add(char);
  }
  assert.equal(seen.size, SHORT_CODE_ALPHABET.length);
});

test("isValidShortCode rejeita o que não deve virar consulta ao banco", () => {
  assert.equal(isValidShortCode("abcd"), true);
  assert.equal(isValidShortCode("2346"), true);

  assert.equal(isValidShortCode("abc"), false, "curto demais");
  assert.equal(isValidShortCode("abcde"), false, "longo demais");
  assert.equal(isValidShortCode(""), false);
  assert.equal(isValidShortCode("ABCD"), false, "maiúscula não pertence ao alfabeto");
  assert.equal(isValidShortCode("ab0d"), false, "dígito ambíguo excluído");
  assert.equal(isValidShortCode("ab-d"), false);
  assert.equal(isValidShortCode("ab d"), false);
  assert.equal(isValidShortCode("../.."), false);
  assert.equal(isValidShortCode("a'b;"), false);
});

test("isValidShortCode não aceita quebra de linha contornando a âncora do regex", () => {
  // `^...$` sem a flag `m` ainda casa antes de um \n final em JS. Se a
  // validação usasse `$` sozinho, "abcd\n' or 1=1" passaria.
  assert.equal(isValidShortCode("abcd\n"), false);
  assert.equal(isValidShortCode("abcd\nxx"), false);
});
