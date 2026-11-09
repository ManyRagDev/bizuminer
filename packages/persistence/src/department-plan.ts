import type { SourceQuery, SourceQueryOrder } from "../../capture/src/types.ts";
import type { CapturePlan, CapturePlanEntry } from "./capture-plan.ts";

export interface DepartmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly shopeeCatId: string;
  readonly aliexpressCatId: string;
  readonly defaultOrder?: SourceQueryOrder;
  readonly note?: string;
}

export const INITIAL_DEPARTMENTS: readonly DepartmentDefinition[] = [
  {
    id: "casa-jardim",
    name: "Casa e Jardim",
    category: "Casa",
    shopeeCatId: "100636", // Casa e Decoração
    aliexpressCatId: "15",
    note: "Casa e Decoração na Shopee. Pode sobrepor Ferramentas e Iluminação.",
  },
  {
    id: "eletrodomesticos",
    name: "Eletrodomésticos",
    category: "Casa",
    shopeeCatId: "100010",
    aliexpressCatId: "6",
    note: "Modelo, capacidade e voltagem podem mudar a compra.",
  },
  {
    id: "eletronicos",
    name: "Eletrônicos",
    category: "Tecnologia",
    shopeeCatId: "100535",
    aliexpressCatId: "44",
    note: "O recorte testado na Shopee é de áudio.",
  },
  {
    id: "bolsas",
    name: "Bolsas",
    category: "Moda",
    shopeeCatId: "100016",
    aliexpressCatId: "1524",
    note: "Manter tamanho e configuração quando relevantes.",
  },
  {
    id: "informatica",
    name: "Informática",
    category: "Tecnologia",
    shopeeCatId: "100644",
    aliexpressCatId: "7",
    note: "Comparar especificações de acessórios e consumíveis.",
  },
  {
    id: "ferramentas",
    name: "Ferramentas",
    category: "Ferramentas",
    shopeeCatId: "100715", // Ferramentas e Melhorias para a Casa
    aliexpressCatId: "1420",
    note: "Ferramentas e Melhorias para a Casa na Shopee.",
  },
  {
    id: "beleza",
    name: "Beleza",
    category: "Beleza",
    shopeeCatId: "100630",
    aliexpressCatId: "66",
    note: "Usar fatos demonstráveis na apresentação.",
  },
  {
    id: "esporte-lazer",
    name: "Esporte e Lazer",
    category: "Fitness",
    shopeeCatId: "100637",
    aliexpressCatId: "18",
    note: "A classificação final segue o uso principal.",
  },
  {
    id: "auto",
    name: "Auto",
    category: "Auto e moto",
    shopeeCatId: "102187",
    aliexpressCatId: "34",
    note: "Preservar compatibilidade com o veículo quando relevante.",
  },
  {
    id: "brinquedos",
    name: "Brinquedos",
    category: "Brinquedos",
    shopeeCatId: "100684",
    aliexpressCatId: "26",
    note: "Na Shopee, 100684 para Brinquedos.",
  },
  {
    id: "iluminacao",
    name: "Iluminação",
    category: "Casa",
    shopeeCatId: "100719",
    aliexpressCatId: "39",
    note: "Subcategoria de Casa na Shopee.",
  },
  {
    id: "papelaria",
    name: "Papelaria",
    category: "Papelaria",
    shopeeCatId: "100638",
    aliexpressCatId: "21",
    note: "Material escolar e escritório.",
  },
];

/**
 * Cria o plano de captura baseado em departamentos para um marketplace específico.
 */
export function buildDepartmentPlan(
  marketplace: "shopee" | "aliexpress",
  opts: {
    order?: SourceQueryOrder;
    departments?: readonly DepartmentDefinition[];
  } = {},
): CapturePlan {
  const departments = opts.departments ?? INITIAL_DEPARTMENTS;
  const order = opts.order ?? "sales";

  const entries: CapturePlanEntry[] = departments.map((dept) => {
    const categoryId = marketplace === "shopee" ? dept.shopeeCatId : dept.aliexpressCatId;
    const sourceQuery: SourceQuery = {
      kind: "department",
      categoryId,
      order,
    };

    return {
      id: `${dept.id}-${order}`,
      mode: "directed" as const,
      category: dept.category,
      sourceQuery,
    };
  });

  return {
    id: `departments-${marketplace}-v1`,
    entries,
  };
}

/**
 * Formata a prévia estática do plano para exibição no console sem rede e sem banco.
 */
export function formatDepartmentPlanPreview(
  marketplace: "shopee" | "aliexpress",
  opts: {
    order?: SourceQueryOrder;
    pages?: number;
    pageSize?: number;
  } = {},
): string {
  const order = opts.order ?? "sales";
  const pages = opts.pages ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const plan = buildDepartmentPlan(marketplace, { order });

  const lines: string[] = [
    `Plano de Descoberta por Departamentos: ${plan.id}`,
    `Marketplace: ${marketplace.toUpperCase()}`,
    `Ordem: ${order}`,
    `Páginas por departamento: ${pages} (tamanho de página: ${pageSize})`,
    `Total de departamentos: ${plan.entries.length}`,
    `Orçamento máximo de consulta: ${plan.entries.length * pages * pageSize} anúncios`,
    "",
    "Recortes planejados:",
  ];

  for (let i = 0; i < plan.entries.length; i++) {
    const entry = plan.entries[i]!;
    const dept = INITIAL_DEPARTMENTS[i]!;
    const catId = entry.sourceQuery?.kind === "department" ? entry.sourceQuery.categoryId : "-";
    lines.push(
      `- [${entry.mode}] ${dept.name} (Cat. pública: ${dept.category}) -> ID ${marketplace}: ${catId} (ordem: ${order})`,
    );
  }

  return lines.join("\n");
}
