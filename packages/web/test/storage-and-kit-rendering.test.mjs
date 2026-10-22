import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectImageMimeTypeFromMagicNumbers,
  validateArtifactUploadBytes,
  createLocalFilesystemStorageDriver,
} from "../lib/marketing-storage-core.ts";
import { validateKitArtifacts } from "../lib/kit-validator.ts";
import { renderKitPng } from "../lib/kit-renderer.ts";

test("AC-17.1: detectImageMimeTypeFromMagicNumbers accurately identifies image formats", () => {
  // 1. PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert.equal(detectImageMimeTypeFromMagicNumbers(pngBytes), "image/png");

  // 2. JPEG magic bytes: FF D8 FF
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.equal(detectImageMimeTypeFromMagicNumbers(jpegBytes), "image/jpeg");

  // 3. WebP magic bytes: RIFF (4) + len (4) + WEBP (4)
  const webpBytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // 'RIFF'
    0x24, 0x00, 0x00, 0x00, // file length
    0x57, 0x45, 0x42, 0x50, // 'WEBP'
  ]);
  assert.equal(detectImageMimeTypeFromMagicNumbers(webpBytes), "image/webp");

  // 4. Executable / binary / corrupted
  const exeBytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(detectImageMimeTypeFromMagicNumbers(exeBytes), null);
});

test("AC-17.1: validateArtifactUploadBytes enforces size limits and rejects forbidden executables", () => {
  // 1. Empty file
  const emptyRes = validateArtifactUploadBytes(new Uint8Array(0));
  assert.equal(emptyRes.ok, false);
  assert.equal(emptyRes.error, "empty_file");

  // 2. File too large (> 10 MiB)
  const oversizedRes = validateArtifactUploadBytes(new Uint8Array(10 * 1024 * 1024 + 1));
  assert.equal(oversizedRes.ok, false);
  assert.equal(oversizedRes.error, "file_too_large");

  // 3. Executable binary (ELF)
  const elfBytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const elfRes = validateArtifactUploadBytes(elfBytes);
  assert.equal(elfRes.ok, false);
  assert.equal(elfRes.error, "executable_upload_forbidden");

  // 4. Windows EXE (MZ header)
  const mzBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
  const mzRes = validateArtifactUploadBytes(mzBytes);
  assert.equal(mzRes.ok, false);
  assert.equal(mzRes.error, "executable_upload_forbidden");

  // 5. Valid PNG
  const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngRes = validateArtifactUploadBytes(validPng);
  assert.equal(pngRes.ok, true);
  if (pngRes.ok) {
    assert.equal(pngRes.mime, "image/png");
    assert.ok(pngRes.sha256);
  }
});

test("AC-17.1 & AC-17.2: createLocalFilesystemStorageDriver isolates paths and prevents directory traversal", async () => {
  const testDir = join(tmpdir(), `storage-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const driver = createLocalFilesystemStorageDriver(testDir);

  const tenantAData = new TextEncoder().encode("tenant A private artifact data");
  await driver.put("tenant_a/kit_asset/artifact-1", tenantAData, "text/plain");

  // Read back valid
  const readBack = await driver.get("tenant_a/kit_asset/artifact-1");
  assert.deepEqual(readBack, tenantAData);
  assert.equal(await driver.exists("tenant_a/kit_asset/artifact-1"), true);
  assert.equal(await driver.exists("tenant_b/kit_asset/artifact-1"), false);

  // Attempt path traversal should throw path_traversal_forbidden
  await assert.rejects(
    () => driver.put("../../evil.txt", new Uint8Array([1, 2, 3]), "text/plain"),
    /path_traversal_forbidden/
  );

  await assert.rejects(
    () => driver.get("../../../etc/passwd"),
    /path_traversal_forbidden/
  );

  // Cleanup
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
});

test("AC-17.3: validateKitArtifacts enforces authorized image rights and mandatory affiliate disclosure", () => {
  // 1. Valid layout with merchant_provided image and explicit disclosure
  const validLayout = {
    format: "story",
    hasDisclosure: true,
    disclosureText: "Link de afiliado. Podemos receber comissão pela compra.",
    images: [
      {
        assetRef: "img_01",
        rightsStatus: "merchant_provided",
        sourceRef: "merchant-portal-agreement-2026",
        dimensions: { width: 1080, height: 1920 },
      },
      {
        assetRef: "img_02",
        rightsStatus: "house_created",
        sourceRef: "internal-design-team",
      },
    ],
    contrastRatio: 4.8,
  };

  const validRes = validateKitArtifacts(validLayout);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.blockers.length, 0);

  // 2. Missing disclosure
  const noDisclosureLayout = {
    ...validLayout,
    hasDisclosure: false,
    disclosureText: "",
  };
  const noDiscRes = validateKitArtifacts(noDisclosureLayout);
  assert.equal(noDiscRes.valid, false);
  assert.ok(noDiscRes.blockers.some((b) => b.includes("MISSING_AFFILIATE_DISCLOSURE")));

  // 3. Unauthorized / missing image rights
  const unauthorizedImgLayout = {
    ...validLayout,
    images: [
      {
        assetRef: "img_unauthorized",
        rightsStatus: "unknown",
      },
    ],
  };
  const unauthRes = validateKitArtifacts(unauthorizedImgLayout);
  assert.equal(unauthRes.valid, false);
  assert.ok(unauthRes.blockers.some((b) => b.includes("MISSING_RIGHTS_FOR_ASSET")));

  // 4. Insufficient contrast
  const lowContrastLayout = {
    ...validLayout,
    contrastRatio: 2.1,
  };
  const lowContrastRes = validateKitArtifacts(lowContrastLayout);
  assert.equal(lowContrastRes.valid, false);
  assert.ok(lowContrastRes.blockers.some((b) => b.includes("INSUFFICIENT_CONTRAST")));
});

test("AC-17.4: renderKitPng generates valid PNG image with typography and tracked link QR code", async () => {
  const snapshot = {
    id: "prod_render_1",
    title: "Air Fryer Mondial 4L Digital",
    category: "Eletroportáteis",
    marketplace: "shopee",
    priceCents: 27990,
    currency: "BRL",
    productUrl: "https://shopee.com.br/product/123",
  };

  const material = {
    channel: "instagram_stories",
    shortCopy: "A melhor fritadeira custo-benefício em promoção imperdível!",
    cta: "Aproveitar Desconto",
    disclosure: "Link de afiliado",
  };

  const trackedLink = "https://garimpa.app/p/air123";

  const renderedBytes = await renderKitPng(snapshot, material, trackedLink);
  assert.ok(renderedBytes.length > 0);

  // Output must be a valid PNG
  const mime = detectImageMimeTypeFromMagicNumbers(renderedBytes);
  assert.equal(mime, "image/png");
});

test("BUG-010: sibling prefix, absolute path and symlink cannot escape local storage",async()=>{
 const dir=await fs.mkdtemp(join(tmpdir(),"storage-boundary-"));
 const driver=createLocalFilesystemStorageDriver(join(dir,"private"));
 try{
  await driver.put("tenant/ok",new Uint8Array([1,2,3]),"application/octet-stream");
  await fs.mkdir(join(dir,"outside"));await fs.writeFile(join(dir,"outside","secret"),"synthetic");
  await fs.symlink(join(dir,"outside"),join(dir,"private","shortcut"));
  for(const bad of ["../private-escape/proof.txt",join(dir,"outside","secret"),"shortcut/secret"]){
   await assert.rejects(()=>driver.put(bad,new Uint8Array([0]),"text/plain"),/path_traversal_forbidden/);
   await assert.rejects(()=>driver.get(bad),/path_traversal_forbidden/);
   await assert.rejects(()=>driver.exists(bad),/path_traversal_forbidden/);
  }
  assert.equal(await fs.readFile(join(dir,"outside","secret"),"utf8"),"synthetic");
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test("BUG-011: story/feed/banner dimensions differ and final PNG QR decodes to canonical tracked link",async()=>{
 const {default:sharp}=await import("sharp");const {default:jsQR}=await import("jsqr");
 const {createHash}=await import("node:crypto");
 const snapshot={productId:"synthetic",title:"Cafeteira de teste",priceCents:12990,currency:"BRL",productUrl:"https://example.invalid/product"};
 const link="https://example.invalid/p/canonical-code";
 const digests=new Set();
 const asset=await sharp({create:{width:500,height:200,channels:3,background:"#eeeeee"}}).png().toBuffer();
 for(const [channel,width,height] of [["instagram_stories",1080,1920],["instagram_feed",1080,1080],["banner",1200,628]]){
  const png=await renderKitPng(snapshot,{channel,shortCopy:"Uma oferta testada, com preço observado.",cta:"Ver oferta",disclosure:"Link de afiliado",assetRefs:[]},link,asset);
  const meta=await sharp(png).metadata();assert.equal(meta.width,width);assert.equal(meta.height,height);
  const raw=await sharp(png).ensureAlpha().raw().toBuffer();const decoded=jsQR(new Uint8ClampedArray(raw),width,height,{inversionAttempts:"dontInvert"});
  assert.equal(decoded?.data,link,channel+" QR must decode from the final PNG");
  digests.add(createHash("sha256").update(png).digest("hex"));
 }
 assert.equal(digests.size,3);
 await assert.rejects(()=>renderKitPng(snapshot,{channel:"instagram_feed",shortCopy:"x",cta:"x"},link,undefined,"invalid"),/invalid_kit_format/);
});
