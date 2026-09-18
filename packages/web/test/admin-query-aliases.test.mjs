import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalAdminQuery, canonicalAdminUrl } from "../lib/admin-query-aliases.ts";

test("aba canônica permanece", () => {
  assert.deepEqual(canonicalAdminQuery({ aba: "selecao" }), { aba: "selecao", sub: "", redirectNeeded: false });
  assert.deepEqual(canonicalAdminQuery({ aba: "excecoes", sub: "singulars" }), { aba: "excecoes", sub: "singulars", redirectNeeded: false });
  assert.deepEqual(canonicalAdminQuery({ aba: "auditoria", sub: "espera" }), { aba: "auditoria", sub: "espera", redirectNeeded: false });
  assert.deepEqual(canonicalAdminQuery({ aba: "bussola" }), { aba: "bussola", sub: "", redirectNeeded: false });
  assert.deepEqual(canonicalAdminQuery({ aba: "pipeline" }), { aba: "pipeline", sub: "", redirectNeeded: false });
});

test("aba padrão sem aba → selecao", () => {
  assert.deepEqual(canonicalAdminQuery({}), { aba: "selecao", sub: "", redirectNeeded: false });
});

test("aliases de aba migram para canônico", () => {
  assert.deepEqual(canonicalAdminQuery({ aba: "hoje" }), { aba: "excecoes", sub: "singulars", redirectNeeded: true });
  assert.deepEqual(canonicalAdminQuery({ aba: "grupos" }), { aba: "excecoes", sub: "grupos", redirectNeeded: true });
  assert.deepEqual(canonicalAdminQuery({ aba: "espera" }), { aba: "auditoria", sub: "espera", redirectNeeded: true });
  assert.deepEqual(canonicalAdminQuery({ aba: "aprendizados" }), { aba: "bussola", sub: "", redirectNeeded: true });
  assert.deepEqual(canonicalAdminQuery({ aba: "lotes" }), { aba: "pipeline", sub: "", redirectNeeded: true });
});

test("fila=held → auditoria/espera", () => {
  assert.deepEqual(canonicalAdminQuery({ fila: "held" }), { aba: "auditoria", sub: "espera", redirectNeeded: true });
});

test("modo e subaba são aliases de sub", () => {
  assert.deepEqual(canonicalAdminQuery({ aba: "excecoes", modo: "grupos" }), { aba: "excecoes", sub: "grupos", redirectNeeded: true });
  assert.deepEqual(canonicalAdminQuery({ aba: "excecoes", modo: "hoje" }), { aba: "excecoes", sub: "singulars", redirectNeeded: true });
  assert.deepEqual(canonicalAdminQuery({ aba: "auditoria", subaba: "espera" }), { aba: "auditoria", sub: "espera", redirectNeeded: true });
  assert.deepEqual(canonicalAdminQuery({ aba: "auditoria", subaba: "spotcheck" }), { aba: "auditoria", sub: "spotcheck", redirectNeeded: true });
});

test("sub canônico vence sobre alias conflitante", () => {
  assert.deepEqual(canonicalAdminQuery({ aba: "excecoes", sub: "grupos", modo: "hoje" }), { aba: "excecoes", sub: "grupos", redirectNeeded: true });
});

test("default sub por aba (sem sub)", () => {
  assert.deepEqual(canonicalAdminQuery({ aba: "excecoes" }), { aba: "excecoes", sub: "singulars", redirectNeeded: false });
  assert.deepEqual(canonicalAdminQuery({ aba: "auditoria" }), { aba: "auditoria", sub: "spotcheck", redirectNeeded: false });
});

test("canonicalAdminUrl preserva params desconhecidos e gera URL", () => {
  assert.equal(
    canonicalAdminUrl("/admin/curadoria", { aba: "hoje", grupo: "g-123" }),
    "/admin/curadoria?grupo=g-123&aba=excecoes&sub=singulars"
  );
  assert.equal(canonicalAdminUrl("/admin/curadoria", { aba: "selecao" }), "/admin/curadoria?aba=selecao");
  assert.equal(canonicalAdminUrl("/admin/curadoria", { fila: "held", grupo: "x" }), "/admin/curadoria?grupo=x&aba=auditoria&sub=espera");
});