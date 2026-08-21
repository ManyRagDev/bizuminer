# BizuMiner - Brand Assets & Design System

Esta pasta contém o pacote oficial de identidade visual do **BizuMiner**.

## 🎨 Paleta de Cores

| Nome | Hex | Aplicação |
| :--- | :--- | :--- |
| **Primary Blue** | `#2563EB` | Símbolo B, botões principais, destaques ativos |
| **Primary Hover / Deep** | `#1D4ED8` | Estados hover e ênfase |
| **Lime Accent (Bizu Spark)** | `#D9F99D` | Brilho dos olhos, tags de oportunidade, novidades |
| **Success Emerald** | `#10B981` | Variação positiva de preço, menor preço histórico |
| **Dark Slate (Text)** | `#0F172A` | Tipografia principal (Light mode) |
| **Neutral Background** | `#F8F9FA` | Fundo da aplicação e cards |
| **Dark Mode Surface** | `#0B132B` | Fundo principal no modo escuro |

---

## 🔤 Tipografia Oficial

* **Wordmark & Headlines:** `Manrope` (ExtraBold 800 para "Bizu", Medium 500 para "Miner")
* **Corpo de Texto:** `Manrope` (Regular 400 / Medium 500)
* **Labels & Tags:** `Be Vietnam Pro` ou `Manrope`

---

## 📁 Estrutura de Arquivos

* `svg/`: Arquivos vetoriais em escala infinita para web, apps e materiais impressos.
  * `bizuminer-logo-horizontal-light.svg`
  * `bizuminer-logo-horizontal-dark.svg`
  * `bizuminer-logo-vertical-light.svg`
  * `bizuminer-logo-vertical-dark.svg`
  * `bizuminer-icon-square-blue.svg`
  * `favicon.svg`
* `png/`: Imagens em 1x, 2x (@2x) e 4x (@4x) com transparência.
* `webp/`: Formatos modernos de alta performance para a web.
* `favicons/`: `favicon.ico` (16x16, 32x32, 48x48 embutidos), `favicon-16x16.png`, `favicon-32x32.png`.
* `app-icons/`: `apple-touch-icon.png` (180x180), `android-chrome-192x192.png`, `android-chrome-512x512.png`.

---

## 💻 Exemplo de Importação no Next.js (HTML Head)

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```
