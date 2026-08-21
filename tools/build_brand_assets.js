const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const sharp = require(path.join(__dirname, '../packages/web/node_modules/sharp'));

// Helper to fetch URL as Buffer with redirect handling
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function build() {
  console.log('🚀 Iniciando geração de assets visuais do BizuMiner...');

  // 1. Download Google Font Manrope (Medium 500 e ExtraBold 800)
  console.log('📦 Baixando tipografia oficial Manrope...');
  const [ttf500, ttf800] = await Promise.all([
    fetchUrl('https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk7PFO_F.ttf'),
    fetchUrl('https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk59E-_F.ttf')
  ]);

  const fontCss = `
    @font-face {
      font-family: 'Manrope';
      font-style: normal;
      font-weight: 500;
      src: url('data:font/truetype;charset=utf-8;base64,${ttf500.toString('base64')}') format('truetype');
    }
    @font-face {
      font-family: 'Manrope';
      font-style: normal;
      font-weight: 800;
      src: url('data:font/truetype;charset=utf-8;base64,${ttf800.toString('base64')}') format('truetype');
    }
  `;

  // 2. SVG Símbolo B Geométrico com Olhos
  // Cores:
  // Primary Blue: #2563EB
  // Dark Slate: #0F172A
  // Light Blue (Dark mode): #3B82F6 / #60A5FA
  // Lime Accent: #D9F99D

  const getBSymbol = (fillColor, eyeBg, pupilColor, limeAccent, scale = 1, x = 0, y = 0) => `
    <g transform="translate(${x}, ${y}) scale(${scale})">
      <!-- Haste sólida e curvas externas do 'B' fechado -->
      <path d="M0 6C0 2.68629 2.68629 0 6 0H36C52.5685 0 66 13.4315 66 30C66 36.2163 64.108 42.0163 60.854 46.855C64.632 51.815 67 58.043 67 65C67 81.5685 53.5685 95 37 95H6C2.68629 95 0 92.3137 0 89V6Z" fill="${fillColor}"/>
      
      <!-- Olho Superior -->
      <circle cx="25" cy="22" r="12" fill="${eyeBg}"/>
      <circle cx="28" cy="19.5" r="6" fill="${pupilColor}"/>
      <circle cx="30.5" cy="17" r="2.2" fill="${limeAccent}"/>

      <!-- Olho Inferior -->
      <circle cx="25" cy="48" r="12" fill="${eyeBg}"/>
      <circle cx="28" cy="45.5" r="6" fill="${pupilColor}"/>
      <circle cx="30.5" cy="43" r="2.2" fill="${limeAccent}"/>
    </g>
  `;

  // Modelos de SVG
  const svgs = {
    // 1. Horizontal Light
    'bizuminer-logo-horizontal-light': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 100" width="440" height="100" fill="none">
        <style>${fontCss}</style>
        ${getBSymbol('#2563EB', '#FFFFFF', '#0F172A', '#D9F99D', 0.84, 10, 10)}
        <text x="84" y="60" font-family="'Manrope', sans-serif" font-size="44" font-weight="800" fill="#0F172A" letter-spacing="-0.8">Bizu<tspan font-weight="500" fill="#2563EB">Miner</tspan></text>
      </svg>
    `,

    // 2. Horizontal Dark
    'bizuminer-logo-horizontal-dark': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 100" width="440" height="100" fill="none">
        <style>${fontCss}</style>
        ${getBSymbol('#3B82F6', '#0B132B', '#FFFFFF', '#D9F99D', 0.84, 10, 10)}
        <text x="84" y="60" font-family="'Manrope', sans-serif" font-size="44" font-weight="800" fill="#FFFFFF" letter-spacing="-0.8">Bizu<tspan font-weight="500" fill="#60A5FA">Miner</tspan></text>
      </svg>
    `,

    // 3. Vertical Stacked Light
    'bizuminer-logo-vertical-light': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300" fill="none">
        <style>${fontCss}</style>
        ${getBSymbol('#2563EB', '#FFFFFF', '#0F172A', '#D9F99D', 1.2, 110, 50)}
        <text x="150" y="210" text-anchor="middle" font-family="'Manrope', sans-serif" font-size="36" font-weight="800" fill="#0F172A" letter-spacing="-0.6">Bizu<tspan font-weight="500" fill="#2563EB">Miner</tspan></text>
      </svg>
    `,

    // 4. Vertical Stacked Dark
    'bizuminer-logo-vertical-dark': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300" fill="none">
        <style>${fontCss}</style>
        ${getBSymbol('#3B82F6', '#0B132B', '#FFFFFF', '#D9F99D', 1.2, 110, 50)}
        <text x="150" y="210" text-anchor="middle" font-family="'Manrope', sans-serif" font-size="36" font-weight="800" fill="#FFFFFF" letter-spacing="-0.6">Bizu<tspan font-weight="500" fill="#60A5FA">Miner</tspan></text>
      </svg>
    `,

    // 5. Icon Only Light (Transparent)
    'bizuminer-icon-light': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" fill="none">
        ${getBSymbol('#2563EB', '#FFFFFF', '#0F172A', '#D9F99D', 0.95, 18, 5)}
      </svg>
    `,

    // 6. Icon Only Dark (Transparent)
    'bizuminer-icon-dark': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" fill="none">
        ${getBSymbol('#3B82F6', '#0B132B', '#FFFFFF', '#D9F99D', 0.95, 18, 5)}
      </svg>
    `,

    // 7. App Icon Square Blue (Full Bleed Rounded)
    'bizuminer-icon-square-blue': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">
        <rect width="512" height="512" rx="115" fill="#2563EB"/>
        <g transform="translate(145, 80) scale(4.4)">
          <!-- Haste do B em branco/contraste com fundo azul -->
          <circle cx="25" cy="22" r="12" fill="#FFFFFF"/>
          <circle cx="28" cy="19.5" r="6" fill="#0F172A"/>
          <circle cx="30.5" cy="17" r="2.2" fill="#D9F99D"/>

          <circle cx="25" cy="48" r="12" fill="#FFFFFF"/>
          <circle cx="28" cy="45.5" r="6" fill="#0F172A"/>
          <circle cx="30.5" cy="43" r="2.2" fill="#D9F99D"/>
        </g>
      </svg>
    `,

    // 8. App Icon Square Dark (Full Bleed Rounded)
    'bizuminer-icon-square-dark': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">
        <rect width="512" height="512" rx="115" fill="#0B132B"/>
        ${getBSymbol('#3B82F6', '#0B132B', '#FFFFFF', '#D9F99D', 4.4, 110, 48)}
      </svg>
    `,

    // 9. Standard Favicon SVG
    'favicon': `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect width="32" height="32" rx="8" fill="#2563EB"/>
        <circle cx="18" cy="11.5" r="5" fill="#FFFFFF"/>
        <circle cx="19.5" cy="10" r="2.5" fill="#0F172A"/>
        <circle cx="20.5" cy="9" r="1" fill="#D9F99D"/>
        
        <circle cx="18" cy="21.5" r="5" fill="#FFFFFF"/>
        <circle cx="19.5" cy="20" r="2.5" fill="#0F172A"/>
        <circle cx="20.5" cy="19" r="1" fill="#D9F99D"/>
      </svg>
    `
  };

  // Pastas de Saída
  const rootBrandDir = path.join(__dirname, '../brand-assets');
  const dirs = {
    root: rootBrandDir,
    svg: path.join(rootBrandDir, 'svg'),
    png: path.join(rootBrandDir, 'png'),
    webp: path.join(rootBrandDir, 'webp'),
    favicons: path.join(rootBrandDir, 'favicons'),
    appIcons: path.join(rootBrandDir, 'app-icons'),
    sitePublicBrand: path.join(__dirname, '../packages/site/public/brand'),
    sitePublic: path.join(__dirname, '../packages/site/public'),
    webPublicBrand: path.join(__dirname, '../packages/web/public/brand'),
    webPublic: path.join(__dirname, '../packages/web/public')
  };

  Object.values(dirs).forEach(ensureDir);

  // 3. Salvar todos os SVGs
  console.log('💾 Salvando arquivos SVG vetoriais...');
  for (const [name, content] of Object.entries(svgs)) {
    const trimmed = content.trim();
    fs.writeFileSync(path.join(dirs.svg, `${name}.svg`), trimmed);
    fs.writeFileSync(path.join(dirs.sitePublicBrand, `${name}.svg`), trimmed);
    fs.writeFileSync(path.join(dirs.webPublicBrand, `${name}.svg`), trimmed);
  }
  fs.writeFileSync(path.join(dirs.favicons, `favicon.svg`), svgs['favicon'].trim());
  fs.writeFileSync(path.join(dirs.sitePublic, `favicon.svg`), svgs['favicon'].trim());
  fs.writeFileSync(path.join(dirs.webPublic, `favicon.svg`), svgs['favicon'].trim());

  // 4. Renderizar PNGs e WebPs de Alta Resolução com Sharp
  console.log('🖼️ Gerando versões PNG e WebP em múltiplas resoluções...');

  // Logos Horizontais
  for (const theme of ['light', 'dark']) {
    const key = `bizuminer-logo-horizontal-${theme}`;
    const svgBuf = Buffer.from(svgs[key]);
    
    // 1x (440x100)
    await sharp(svgBuf).png().toFile(path.join(dirs.png, `${key}.png`));
    await sharp(svgBuf).webp({ lossless: true }).toFile(path.join(dirs.webp, `${key}.webp`));
    
    // 2x (880x200)
    await sharp(svgBuf, { density: 144 }).resize(880, 200).png().toFile(path.join(dirs.png, `${key}@2x.png`));
    await sharp(svgBuf, { density: 144 }).resize(880, 200).webp({ lossless: true }).toFile(path.join(dirs.webp, `${key}@2x.webp`));

    // 4x (1760x400)
    await sharp(svgBuf, { density: 288 }).resize(1760, 400).png().toFile(path.join(dirs.png, `${key}@4x.png`));
  }

  // Logos Verticais
  for (const theme of ['light', 'dark']) {
    const key = `bizuminer-logo-vertical-${theme}`;
    const svgBuf = Buffer.from(svgs[key]);
    await sharp(svgBuf).resize(300, 300).png().toFile(path.join(dirs.png, `${key}.png`));
    await sharp(svgBuf).resize(600, 600).png().toFile(path.join(dirs.png, `${key}@2x.png`));
    await sharp(svgBuf).resize(300, 300).webp({ lossless: true }).toFile(path.join(dirs.webp, `${key}.webp`));
  }

  // Ícones e App Icons
  const appIconSquareSvg = Buffer.from(svgs['bizuminer-icon-square-blue']);
  const appIconDarkSvg = Buffer.from(svgs['bizuminer-icon-square-dark']);
  const iconLightSvg = Buffer.from(svgs['bizuminer-icon-light']);

  // Master App Icons
  await sharp(appIconSquareSvg).resize(512, 512).png().toFile(path.join(dirs.appIcons, 'android-chrome-512x512.png'));
  await sharp(appIconSquareSvg).resize(192, 192).png().toFile(path.join(dirs.appIcons, 'android-chrome-192x192.png'));
  await sharp(appIconSquareSvg).resize(180, 180).png().toFile(path.join(dirs.appIcons, 'apple-touch-icon.png'));
  await sharp(appIconSquareSvg).resize(128, 128).png().toFile(path.join(dirs.appIcons, 'icon-128x128.png'));
  await sharp(appIconSquareSvg).resize(512, 512).webp({ lossless: true }).toFile(path.join(dirs.webp, 'bizuminer-icon-square-blue.webp'));

  // Copiar App Icons para site e web public
  for (const targetDir of [dirs.sitePublic, dirs.webPublic, dirs.sitePublicBrand, dirs.webPublicBrand]) {
    await sharp(appIconSquareSvg).resize(512, 512).png().toFile(path.join(targetDir, 'android-chrome-512x512.png'));
    await sharp(appIconSquareSvg).resize(192, 192).png().toFile(path.join(targetDir, 'android-chrome-192x192.png'));
    await sharp(appIconSquareSvg).resize(180, 180).png().toFile(path.join(targetDir, 'apple-touch-icon.png'));
    await sharp(appIconSquareSvg).resize(192, 192).png().toFile(path.join(targetDir, 'icon-192.png'));
    await sharp(appIconSquareSvg).resize(512, 512).png().toFile(path.join(targetDir, 'icon-512.png'));
  }

  // Favicons individuais em PNG
  const faviconSvgBuf = Buffer.from(svgs['favicon']);
  await sharp(faviconSvgBuf).resize(16, 16).png().toFile(path.join(dirs.favicons, 'favicon-16x16.png'));
  await sharp(faviconSvgBuf).resize(32, 32).png().toFile(path.join(dirs.favicons, 'favicon-32x32.png'));
  await sharp(faviconSvgBuf).resize(48, 48).png().toFile(path.join(dirs.favicons, 'favicon-48x48.png'));

  // Copiar favicons para site e web public
  for (const targetDir of [dirs.sitePublic, dirs.webPublic]) {
    await sharp(faviconSvgBuf).resize(16, 16).png().toFile(path.join(targetDir, 'favicon-16x16.png'));
    await sharp(faviconSvgBuf).resize(32, 32).png().toFile(path.join(targetDir, 'favicon-32x32.png'));
    await sharp(faviconSvgBuf).resize(48, 48).png().toFile(path.join(targetDir, 'favicon-48x48.png'));
  }

  // 5. Gerar Favicon.ico multi-resolução usando Python Pillow
  console.log('🌐 Gerando favicon.ico multi-resolução...');
  const icoScript = `
from PIL import Image
import os

source_png = r"${path.join(dirs.appIcons, 'android-chrome-512x512.png')}"
img = Image.open(source_png)

targets = [
  r"${path.join(dirs.favicons, 'favicon.ico')}",
  r"${path.join(dirs.sitePublic, 'favicon.ico')}",
  r"${path.join(dirs.webPublic, 'favicon.ico')}"
]

for t in targets:
  img.save(t, format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

print("favicon.ico generated successfully for all targets!")
  `;

  fs.writeFileSync(path.join(__dirname, 'make_ico.py'), icoScript);
  execSync(`python "${path.join(__dirname, 'make_ico.py')}"`, { stdio: 'inherit' });

  // 6. Criar README de Guia de Uso da Marca
  const brandReadme = `# BizuMiner - Brand Assets & Design System

Esta pasta contém o pacote oficial de identidade visual do **BizuMiner**.

## 🎨 Paleta de Cores

| Nome | Hex | Aplicação |
| :--- | :--- | :--- |
| **Primary Blue** | \`#2563EB\` | Símbolo B, botões principais, destaques ativos |
| **Primary Hover / Deep** | \`#1D4ED8\` | Estados hover e ênfase |
| **Lime Accent (Bizu Spark)** | \`#D9F99D\` | Brilho dos olhos, tags de oportunidade, novidades |
| **Success Emerald** | \`#10B981\` | Variação positiva de preço, menor preço histórico |
| **Dark Slate (Text)** | \`#0F172A\` | Tipografia principal (Light mode) |
| **Neutral Background** | \`#F8F9FA\` | Fundo da aplicação e cards |
| **Dark Mode Surface** | \`#0B132B\` | Fundo principal no modo escuro |

---

## 🔤 Tipografia Oficial

* **Wordmark & Headlines:** \`Manrope\` (ExtraBold 800 para "Bizu", Medium 500 para "Miner")
* **Corpo de Texto:** \`Manrope\` (Regular 400 / Medium 500)
* **Labels & Tags:** \`Be Vietnam Pro\` ou \`Manrope\`

---

## 📁 Estrutura de Arquivos

* \`svg/\`: Arquivos vetoriais em escala infinita para web, apps e materiais impressos.
  * \`bizuminer-logo-horizontal-light.svg\`
  * \`bizuminer-logo-horizontal-dark.svg\`
  * \`bizuminer-logo-vertical-light.svg\`
  * \`bizuminer-logo-vertical-dark.svg\`
  * \`bizuminer-icon-square-blue.svg\`
  * \`favicon.svg\`
* \`png/\`: Imagens em 1x, 2x (@2x) e 4x (@4x) com transparência.
* \`webp/\`: Formatos modernos de alta performance para a web.
* \`favicons/\`: \`favicon.ico\` (16x16, 32x32, 48x48 embutidos), \`favicon-16x16.png\`, \`favicon-32x32.png\`.
* \`app-icons/\`: \`apple-touch-icon.png\` (180x180), \`android-chrome-192x192.png\`, \`android-chrome-512x512.png\`.

---

## 💻 Exemplo de Importação no Next.js (HTML Head)

\`\`\`html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
\`\`\`
`;

  fs.writeFileSync(path.join(dirs.root, 'README.md'), brandReadme);

  console.log('✅ Todos os assets foram gerados e sincronizados com sucesso!');
}

build().catch(err => {
  console.error('❌ Erro durante a geração dos assets:', err);
  process.exit(1);
});
