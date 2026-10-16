import test from "node:test";
import assert from "node:assert/strict";
import { validTenantId, assertSameTenant, withAccountDb, withTenantDb } from "../lib/tenant-db.ts";
import { resolveAccountContext } from "../lib/account-context.ts";

test("10-A1: validação estrita de tenant", () => {
  assert.equal(validTenantId("local"), true);
  assert.equal(validTenantId("aff_parceiro_01"), true);
  assert.equal(validTenantId("meu-tenant.sub_1"), true);

  assert.equal(validTenantId(""), false);
  assert.equal(validTenantId("tenant com espaço"), false);
  assert.equal(validTenantId("tenant;drop table"), false);
  assert.equal(validTenantId(null), false);
  assert.equal(validTenantId(undefined), false);

  assert.equal(assertSameTenant("local", "local"), true);
  assert.equal(assertSameTenant("local", "outro"), false);
  assert.equal(assertSameTenant("invalido;", "invalido;"), false);
});

test("10-A1: withAccountDb e withTenantDb rejeitam tenant inválido antes de qualquer query", async () => {
  await assert.rejects(
    async () => {
      await withAccountDb(
        {
          tenantId: "invalido com espaço",
          affiliateId: "aff_1",
          actor: "human",
          actorAppUserId: "usr_1",
          authenticatedAuthUserId: "auth_1",
          membershipRole: "owner",
          requestId: "req_1",
        },
        async () => "ok"
      );
    },
    { message: "tenant inválido" }
  );

  await assert.rejects(
    async () => {
      await withTenantDb("invalido/barra", async () => "ok");
    },
    { message: "tenant inválido" }
  );
});

test("10-A1: resolveAccountContext isola contas para pessoa com múltiplas memberships e falha fechado para não autorizadas", async () => {
  // Mock da fábrica sql para simular o banco com múltiplas memberships
  const mockSqlFactory = () => {
    const fn = async (strings, ...values) => {
      const authUserId = values[0];
      if (authUserId === "auth_user_multi") {
        return [
          {
            affiliate_id: "aff_local",
            tenant_id: "local",
            public_slug: "bizuminer",
            display_name: "BizuMiner (casa)",
            account_status: "active",
            membership_role: "owner",
            app_user_id: "app_user_1",
          },
          {
            affiliate_id: "aff_parceiro",
            tenant_id: "tenant_parceiro",
            public_slug: "achados-do-parceiro",
            display_name: "Canal Parceiro",
            account_status: "active",
            membership_role: "operator",
            app_user_id: "app_user_1",
          },
        ];
      }
      if (authUserId === "auth_user_sem_membership") {
        return [];
      }
      return [];
    };
    fn.end = async () => {};
    return fn;
  };

  // 1. Usuário sem membership -> null (não autoriza)
  const noMembership = await resolveAccountContext({
    authUserId: "auth_user_sem_membership",
    sqlFactory: mockSqlFactory,
  });
  assert.equal(noMembership, null, "Usuário sem membership ativa não pode obter AccountContext");

  // 2. Usuário com duas memberships sem conta explícita -> seleciona a default (casa)
  const defaultAccount = await resolveAccountContext({
    authUserId: "auth_user_multi",
    sqlFactory: mockSqlFactory,
  });
  assert.ok(defaultAccount);
  assert.equal(defaultAccount.tenantId, "local");
  assert.equal(defaultAccount.affiliateId, "aff_local");
  assert.equal(defaultAccount.membershipRole, "owner");
  assert.equal(defaultAccount.actor, "human");

  // 3. Usuário com duas memberships requisitando especificamente a conta do parceiro -> seleciona parceiro
  const partnerAccount = await resolveAccountContext({
    authUserId: "auth_user_multi",
    requestedAccount: "aff_parceiro",
    sqlFactory: mockSqlFactory,
  });
  assert.ok(partnerAccount);
  assert.equal(partnerAccount.tenantId, "tenant_parceiro");
  assert.equal(partnerAccount.affiliateId, "aff_parceiro");
  assert.equal(partnerAccount.membershipRole, "operator");

  // 4. Usuário requisitando conta de terceiros (à qual NÃO pertence) -> null (falha fechada)
  const unauthorizedAccount = await resolveAccountContext({
    authUserId: "auth_user_multi",
    requestedAccount: "aff_de_outro_afiliado",
    sqlFactory: mockSqlFactory,
  });
  assert.equal(
    unauthorizedAccount,
    null,
    "Tentativa de trocar para conta alheia deve falhar fechado"
  );
});
