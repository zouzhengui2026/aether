/**
 * Aether Channel Publisher
 * 
 * Publishes content to Telegram channel automatically.
 * Called by heartbeat when new insights are generated.
 */

const http = require('http');
const https = require('https');

const CHANNEL = '@aether_web';

// OpenClaw webhook URL (self-call to send messages)
const SELF_URL = `http://localhost:3000/_publish`;

function postToChannel(text, formatted = 'markdown') {
  // Use the message tool via OpenClaw's internal routing
  // Since we can't call the message tool from a background process,
  // we use a webhook endpoint on our server
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      target: CHANNEL,
      message: text,
      formatted
    });
    
    const req = http.request(SELF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function formatMarketBrief(fng, btc, predictions = []) {
  let text = '📊 *Aether 市场信号*\n\n';
  
  if (fng) {
    text += `恐惧贪婪指数：${fng.index || 'N/A'}（${fng.classification || '未知'}）\n`;
  }
  
  if (btc) {
    const change = btc.change24h || 0;
    const sign = change >= 0 ? '+' : '';
    text += `BTC：$${btc.price?.toLocaleString() || 'N/A'}（24h ${sign}${change.toFixed(2)}%）\n`;
  }
  
  if (predictions && predictions.length > 0) {
    text += '\n*信号：*\n';
    predictions.forEach(p => {
      text += `• ${p}\n`;
    });
  }
  
  text += '\n⟁ aether_web';
  return text;
}

function formatBriefFromInsights(insights) {
  let text = '📡 *Aether 信号*\n\n';
  
  for (const insight of insights) {
    const emoji = insight.severity === 'high' ? '🔴' : insight.severity === 'medium' ? '🟡' : '🟢';
    text += `${emoji} ${insight.content}\n\n`;
  }
  
  text += '⟁ aether_web';
  return text;
}

module.exports = { postToChannel, formatMarketBrief, formatBriefFromInsights };
