import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, isAbsolute, relative, resolve, sep } from "node:path";
import { constants as fsFlags } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
import {
  validateWorkspace,
  type MarketingSnapshot,
  type MarketingWorkspace,
} from "./marketing-contract.ts";
import { initialMarketingWorkspace } from "./marketing-seed.ts";

export class MarketingConflict extends Error {
  constructor() {
    super(
      "Este espaço foi atualizado em outra aba. Exporte suas alterações antes de recarregar e reconciliar os textos.",
    );
  }
}
export interface MarketingStorage {
  exclusive<T>(owner: string, task: () => Promise<T>): Promise<T>;
  read(owner: string): Promise<unknown | null>;
  write(owner: string, snapshot: MarketingSnapshot): Promise<void>;
}
export function parseSnapshot(value: unknown): MarketingSnapshot {
  const snapshot = value as MarketingSnapshot;
  if (
    !snapshot ||
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision < 1 ||
    typeof snapshot.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.updatedAt))
  )
    throw new Error("Não foi possível ler o espaço salvo.");
  return {
    revision: snapshot.revision,
    updatedAt: snapshot.updatedAt,
    workspace: validateWorkspace(snapshot.workspace),
  };
}
export async function loadMarketing(
  storage: MarketingStorage,
  owner: string,
): Promise<MarketingSnapshot> {
  return storage.exclusive(owner, async () => {
    const saved = await storage.read(owner);
    if (saved !== null) return parseSnapshot(saved);
    const initial = {
      revision: 1,
      updatedAt: new Date().toISOString(),
      workspace: validateWorkspace(initialMarketingWorkspace()),
    };
    await storage.write(owner, initial);
    return initial;
  });
}
export async function saveMarketing(
  storage: MarketingStorage,
  owner: string,
  revision: number,
  workspace: MarketingWorkspace,
): Promise<MarketingSnapshot> {
  const validated = validateWorkspace(workspace);
  return storage.exclusive(owner, async () => {
    const saved = await storage.read(owner);
    if (!saved || parseSnapshot(saved).revision !== revision)
      throw new MarketingConflict();
    const next = {
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
      workspace: validated,
    };
    await storage.write(owner, next);
    return next;
  });
}

/**
 * Detecta formato e MIME de imagem com base exclusivamente nos magic numbers (bytes iniciais).
 */
export function detectImageMimeTypeFromMagicNumbers(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP: RIFF (4 bytes) + file length (4 bytes) + WEBP (4 bytes)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Validação segura de upload de artefatos:
 * - Rejeita arquivos vazios ou > 10 MiB
 * - Bloqueia binários executáveis (ELF, PE/EXE, scripts)
 * - Identifica MIME seguro via magic numbers (PNG, JPEG, WebP, PDF)
 * - Calcula hash SHA256
 */
export function validateArtifactUploadBytes(
  bytes: Uint8Array,
  maxBytes = 10 * 1024 * 1024,
): { ok: true; mime: string; sha256: string } | { ok: false; error: string } {
  if (bytes.length === 0) {
    return { ok: false, error: "empty_file" };
  }
  if (bytes.length > maxBytes) {
    return { ok: false, error: "file_too_large" };
  }

  // Bloqueio de executáveis
  if (
    (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) || // ELF
    (bytes[0] === 0x4d && bytes[1] === 0x5a) || // PE / Windows EXE
    (bytes[0] === 0x23 && bytes[1] === 0x21) // Shebang #!
  ) {
    return { ok: false, error: "executable_upload_forbidden" };
  }

  const imageMime = detectImageMimeTypeFromMagicNumbers(bytes);
  if (imageMime) {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return { ok: true, mime: imageMime, sha256 };
  }

  // Validação de PDF (%PDF-)
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return { ok: true, mime: "application/pdf", sha256 };
  }

  return { ok: false, error: "unsupported_media_type" };
}

export interface ArtifactStorageDriver {
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
}

/**
 * Driver local para testes e desenvolvimento offline, com prevenção a path traversal.
 */
export function createLocalFilesystemStorageDriver(
  baseDir = join(tmpdir(), "garimpa-storage", "bizuminer-private"),
): ArtifactStorageDriver {
  const rootDir = resolve(baseDir);

  const safePath = async (objectPath: string, writing = false) => {
    if (!objectPath || isAbsolute(objectPath) || objectPath.split(/[\\/]/).includes("..")) throw new Error("path_traversal_forbidden");
    const target = resolve(rootDir, objectPath), inside = relative(rootDir,target);
    if (!inside || inside.startsWith(".."+sep) || isAbsolute(inside)) throw new Error("path_traversal_forbidden");
    await fs.mkdir(rootDir,{recursive:true,mode:0o700});
    if ((await fs.lstat(rootDir)).isSymbolicLink()) throw new Error("path_traversal_forbidden");
    const parts = inside.split(sep);
    let cursor=rootDir;
    for(let i=0;i<parts.length;i++) {
      cursor=join(cursor,parts[i]!);
      try {if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error("path_traversal_forbidden");}
      catch(error:any) {
        if(error.code!=="ENOENT") throw error;
        if(writing && i<parts.length-1) {
          try {await fs.mkdir(cursor,{mode:0o700});} catch(e:any){if(e.code!=="EEXIST")throw e;}
          if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error("path_traversal_forbidden");
        }
      }
    }
    return target;
  };
  return {
    async put(path:string,bytes:Uint8Array,_mime:string) {
      const target=await safePath(path,true);
      const handle=await fs.open(target,fsFlags.O_WRONLY|fsFlags.O_CREAT|fsFlags.O_TRUNC|fsFlags.O_NOFOLLOW,0o600);
      try {await handle.writeFile(bytes);}finally{await handle.close();}
    },
    async get(path:string):Promise<Uint8Array> {
      const target=await safePath(path);
      try {const handle=await fs.open(target,fsFlags.O_RDONLY|fsFlags.O_NOFOLLOW);try {return new Uint8Array(await handle.readFile());} finally{await handle.close();}}
      catch(error:any){if(error.code==="ENOENT")throw new Error("private_download_failed");throw error;}
    },
    async exists(path:string) {
      const target=await safePath(path);
      try {await fs.access(target);return true;}catch{return false;}
    },
  };
}

/**
 * Resolve o driver apropriado: Supabase Storage se configurado em produção,
 * ou driver local no filesystem para dev/testes.
 */
export function createDefaultArtifactStorageDriver(fallbackDir?: string): ArtifactStorageDriver {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    try {
      const { privateObjectStore } = nodeRequire("./private-artifact-db.ts");
      const store = privateObjectStore();
      return {
        put: (p: string, b: Uint8Array, m: string) => store.put(p, b, m),
        get: (p: string) => store.get(p),
        exists: async (p: string) => {
          try {
            await store.get(p);
            return true;
          } catch {
            return false;
          }
        },
      };
    } catch {
      // Supabase storage unavailable/failed initialization -> fallback to filesystem
    }
  }
  return createLocalFilesystemStorageDriver(fallbackDir);
}

