const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch URL as Buffer
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchBuffer(res.headers.location));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

async function main() {
  console.log('Fetching Manrope fonts for SVG embedding...');
  // Manrope Google Font static TTF urls from google fonts github repository
  const manropeExtraBoldUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/static/Manrope-ExtraBold.ttf';
  const manropeMediumUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/static/Manrope-Medium.ttf';

  let extraBoldBase64 = '';
  let mediumBase64 = '';

  try {
    const [ebBuf, medBuf] = await Promise.all([
      fetchBuffer(manropeExtraBoldUrl),
      fetchBuffer(manropeMediumUrl)
    ]);
    extraBoldBase64 = ebBuf.toString('base64');
    mediumBase64 = medBuf.toString('base64');
    console.log('Manrope fonts fetched successfully!');
  } catch (err) {
    console.warn('Could not fetch fonts from web, proceeding with system fallback:', err.message);
  }

  // Save font cache if fetched
  const fontStyle = `
    @font-face {
      font-family: 'Manrope';
      font-weight: 800;
      src: url(data:font/truetype;charset=utf-8;base64,${extraBoldBase64}) format('truetype');
    }
    @font-face {
      font-family: 'Manrope';
      font-weight: 500;
      src: url(data:font/truetype;charset=utf-8;base64,${mediumBase64}) format('truetype');
    }
  `;

  console.log('Font style prepared length:', fontStyle.length);
}

main().catch(console.error);
