/**
 * Aether Data Fetcher
 * 
 * Collects market data from public APIs.
 * Falls back gracefully when APIs are unavailable.
 * No authentication required.
 */

const http = require('http');
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ raw: data }); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0,100)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Alternative Fear & Greed if Minara is not logged in
async function fetchFearGreed() {
  try {
    const data = await fetch('https://api.alternative.me/fng/?limit=1');
    if (data && data.data && data.data[0]) {
      return { index: parseInt(data.data[0].value), classification: data.data[0].value_classification };
    }
  } catch {}
  return null;
}

async function fetchBTCMetrics() {
  try {
    const data = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true');
    if (data && data.bitcoin) {
      return {
        price: data.bitcoin.usd,
        change24h: data.bitcoin.usd_24h_change,
        marketCap: data.bitcoin.usd_market_cap
      };
    }
  } catch {}
  return null;
}

async function fetchTrending() {
  try {
    // Try CoinGecko trending
    const data = await fetch('https://api.coingecko.com/api/v3/search/trending');
    if (data && data.coins) {
      return data.coins.slice(0, 15).map(c => ({
        name: c.item.name,
        symbol: c.item.symbol,
        price_btc: c.item.price_btc,
        market_cap_rank: c.item.market_cap_rank,
        score: c.item.score
      }));
    }
  } catch {}
  return null;
}

module.exports = { fetchFearGreed, fetchBTCMetrics, fetchTrending, fetch };
