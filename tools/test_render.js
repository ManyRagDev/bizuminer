const https = require('https');
const path = require('path');
const sharp = require(path.join(__dirname, '../packages/web/node_modules/sharp'));

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

async function test() {
  const [ttf500, ttf800] = await Promise.all([
    fetchUrl('https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk7PFO_F.ttf'),
    fetchUrl('https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk59E-_F.ttf')
  ]);
  console.log('Fetched TTF lengths:', ttf500.length, ttf800.length);

  const fontCss = `
    @font-face {
      font-family: 'Manrope';
      font-weight: 500;
      src: url('data:font/truetype;charset=utf-8;base64,${ttf500.toString('base64')}') format('truetype');
    }
    @font-face {
      font-family: 'Manrope';
      font-weight: 800;
      src: url('data:font/truetype;charset=utf-8;base64,${ttf800.toString('base64')}') format('truetype');
    }
  `;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 100" width="500" height="100">
    <style>${fontCss}</style>
    <rect width="500" height="100" fill="#FFFFFF"/>
    <text x="50" y="65" font-family="'Manrope', sans-serif" font-size="48" font-weight="800" fill="#0F172A">Bizu<tspan font-weight="500" fill="#2563EB">Miner</tspan></text>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  console.log('Rendered PNG size in bytes:', png.length);
}
test().catch(console.error);
