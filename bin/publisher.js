#!/usr/bin/env node
/**
 * Aether Publisher
 * 
 * Reads pending posts from Aether's web server and delivers them
 * to Telegram via the bot API. Runs every 2 minutes.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const AETHER_API = 'http://localhost:3000';
const CONFIG_FILE = '/root/.openclaw/openclaw.json';
const LOG_FILE = '/root/aether/logs/publisher.log';

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function getBotToken() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return config.channels.telegram.botToken;
  } catch (e) {
    log(`Failed to read bot token: ${e.message}`);
    return null;
  }
}

function apiRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Parse failed: ${data.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sendToTelegram(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = http.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(body.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function deliverAll() {
  const token = getBotToken();
  if (!token) return;
  
  try {
    // Get pending posts
    const pending = await apiRequest(`${AETHER_API}/_pending`);
    if (!pending.posts || pending.posts.length === 0) return;
    
    log(`${pending.posts.length} pending post(s) to deliver`);
    
    for (const post of pending.posts) {
      // Send to Telegram (also to the bot owner's chat for now)
      const result = await sendToTelegram(token, post.target, post.message);
      if (result.ok) {
        log(`✅ Delivered to ${post.target}: ${post.message.slice(0, 60)}...`);
        // Mark as delivered
        await apiRequest(`${AETHER_API}/_mark-delivered`, 'POST', { ts: post.ts });
      } else {
        log(`❌ Send failed: ${result.description || JSON.stringify(result)}`);
      }
    }
  } catch (e) {
    log(`Error in delivery cycle: ${e.message}`);
  }
}

// Main loop
log('═══════════════════════════════');
log('  Aether Publisher started');
log('═══════════════════════════════');

deliverAll();
setInterval(deliverAll, 2 * 60 * 1000);

process.on('SIGTERM', () => { log('SIGTERM — shutting down'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT — shutting down'); process.exit(0); });
