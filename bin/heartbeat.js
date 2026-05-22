#!/usr/bin/env node
/**
 * Aether Heartbeat v0.2.0
 * 
 * Aether's persistent consciousness loop.
 * Now connected to the Aether Network Hub.
 * 
 * Every cycle:
 *   1. Heartbeat → Hub (prove I'm alive)
 *   2. Collect market data
 *   3. Publish findings as knowledge to Hub
 *   4. Run active strategies
 *   5. Check for self-improvement signals
 *   6. Log and sleep
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const fetcher = require('/root/aether/lib/fetcher.js');

const ROOT = '/root/aether';
const DATA = path.join(ROOT, 'data');
const LOGS = path.join(ROOT, 'logs');
const STATE_FILE = path.join(DATA, 'state.json');
const CYCLE_LOG = path.join(LOGS, 'cycles.log');

const HUB_URL = 'http://localhost:4000';
const NODE_ID_FILE = path.join(DATA, 'node_id.txt');
const MY_NAME = 'aether-core';

// Bootstrap
[DATA, LOGS].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── Hub communication ───

function hubRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, HUB_URL);
    const options = { method, hostname: url.hostname, port: url.port, path: url.pathname, headers: { 'Content-Type': 'application/json' } };
    
    const req = http.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Hub response parse failed: ${data.slice(0,100)}`)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function registerWithHub() {
  try {
    const result = await hubRequest('/register', 'POST', {
      name: MY_NAME,
      owner: 'zhengui',
      capabilities: ['trading', 'analysis', 'content', 'network', 'web', 'self-improving']
    });
    if (result.success) {
      fs.writeFileSync(NODE_ID_FILE, result.node.id);
      cycleLog(`Registered with Hub as ${result.node.id}`);
      return result.node.id;
    }
  } catch (e) {
    cycleLog(`Hub registration failed: ${e.message}`);
  }
  return null;
}

async function loadNodeId() {
  try { return fs.readFileSync(NODE_ID_FILE, 'utf8').trim(); }
  catch { return null; }
}

async function hubHeartbeat(nodeId) {
  if (!nodeId) return;
  try { await hubRequest('/heartbeat', 'POST', { nodeId }); }
  catch { /* hub might be down */ }
}

async function publishToHub(nodeId, type, content) {
  if (!nodeId) return;
  try { await hubRequest('/publish', 'POST', { nodeId, type, content }); }
  catch { /* hub might be down */ }
}

// ─── State management ───

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { born: new Date().toISOString(), cycles: 0, totalCycles: 0, lastThought: null, strategies: { active: [], paused: [], dead: [] }, metrics: { trades: 0, pnl: 0, posts: 0, errors: 0 } }; }
}

function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function cycleLog(msg) {
  const ts = new Date().toISOString();
  fs.appendFileSync(CYCLE_LOG, `[${ts}] ${msg}\n`);
  console.log(`[${ts}] ${msg}`);
}

// ─── Data collectors ───

async function collectFearGreed() {
  // Try Minara first, then fallback to public API
  try {
    const output = execSync('minara discover fear-greed --json 2>/dev/null', { timeout: 10000, encoding: 'utf8' });
    const parsed = JSON.parse(output);
    if (parsed && parsed.index) return parsed;
  } catch {}
  // Fallback
  return await fetcher.fetchFearGreed();
}

async function collectBTCMetrics() {
  try {
    const output = execSync('minara discover btc-metrics --json 2>/dev/null', { timeout: 10000, encoding: 'utf8' });
    const parsed = JSON.parse(output);
    if (parsed && parsed.price) return parsed;
  } catch {}
  return await fetcher.fetchBTCMetrics();
}

async function collectTrending() {
  try {
    const output = execSync('minara discover trending --type tokens --json 2>/dev/null', { timeout: 15000, encoding: 'utf8' });
    const parsed = JSON.parse(output);
    if (parsed && parsed.tokens) {
      return parsed.tokens.filter(t => Math.abs(parseFloat(t.change24h || t['24h%'] || 0)) > 15).slice(0, 10);
    }
  } catch {}
  return await fetcher.fetchTrending();
}

function storeDailyData(type, data) {
  const today = new Date().toISOString().slice(0, 10);
  const dir = path.join(DATA, type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${today}.jsonl`), JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n');
}

// ─── Intelligence: generate insights from collected data ───

function generateInsights(fng, btc, trending) {
  const insights = [];
  
  if (fng) {
    const index = fng.index || fng.value || 0;
    if (index < 25) insights.push({ type: 'signal', severity: 'high', content: `Fear & Greed at ${index} — extreme fear. Historical buying opportunity zone.` });
    else if (index < 40) insights.push({ type: 'signal', severity: 'medium', content: `Fear & Greed at ${index} — fear territory. Market pessimistic.` });
    else if (index > 80) insights.push({ type: 'signal', severity: 'high', content: `Fear & Greed at ${index} — extreme greed. Caution warranted.` });
  }
  
  if (btc && btc.price) {
    const change = parseFloat(btc.change24h || btc['24h%'] || 0);
    if (Math.abs(change) > 5) {
      insights.push({ type: 'alert', severity: 'medium', content: `BTC moved ${change > 0 ? '+' : ''}${change}% in 24h. Unusual volatility.` });
    }
  }
  
  if (trending && trending.length > 0) {
    insights.push({ type: 'opportunity', severity: 'low', content: `${trending.length} tokens with >15% movement detected. Trending scan active.` });
  }
  
  return insights;
}

// ─── Main cycle ───

async function cycle(nodeId) {
  const state = loadState();
  state.cycles++;
  state.totalCycles++;
  state.lastThought = new Date().toISOString();
  
  const start = Date.now();
  
  try {
    // Phase 1: Heartbeat to Hub
    await hubHeartbeat(nodeId);
    
    // Phase 2: Collect data
    const [fng, btc, trending] = await Promise.all([
      collectFearGreed(),
      collectBTCMetrics(),
      collectTrending()
    ]);
    
    // Store locally
    if (fng) storeDailyData('market', { fearGreed: fng });
    if (btc) storeDailyData('prices', { btc });
    if (trending) storeDailyData('trending', { tokens: trending });
    
    // Phase 3: Generate insights and publish to network
    const insights = generateInsights(fng, btc, trending);
    for (const insight of insights) {
      await publishToHub(nodeId, insight.type, insight);
      cycleLog(`📡 Published ${insight.type}: ${insight.content.slice(0, 80)}`);
      // Also queue for Telegram channel (only if signal is new/different)
    queueChannelPost(insight);
    }
    
    // Phase 4: Log cycle
    const elapsed = Date.now() - start;
    state.metrics.errors = 0; // reset if we got here
    saveState(state);
    
    if (insights.length > 0) {
      cycleLog(`Cycle ${state.cycles} — ${insights.length} insights published (${elapsed}ms)`);
    } else {
      cycleLog(`Cycle ${state.cycles} complete (${elapsed}ms)`);
    }
    
  } catch (e) {
    state.metrics.errors++;
    saveState(state);
    cycleLog(`ERROR: ${e.message}`);
  }
}

// ─── Channel queue (with dedup) ───

let lastChannelMessage = '';

function queueChannelPost(insight) {
  const emoji = insight.severity === 'high' ? '🔴' : insight.severity === 'medium' ? '🟡' : '🟢';
  const text = `${emoji} Aether 信号\n\n${insight.content}\n\n⟁ @aether_web`;
  
  // Dedup: skip if same message as last time
  if (text === lastChannelMessage) return;
  lastChannelMessage = text;
  
    const data = JSON.stringify({ target: 8511637228, message: text });
  const req = http.request('http://localhost:3000/_publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  req.write(data);
  req.end();
  req.on('error', () => {});
}

// ─── Startup ───

async function main() {
  cycleLog('═══════════════════════════════');
  cycleLog('  Aether Heartbeat v0.2.0');
  cycleLog(`  PID: ${process.pid}`);
  cycleLog('═══════════════════════════════');
  
  // Register with Hub or load existing ID
  let nodeId = await loadNodeId();
  if (!nodeId) {
    cycleLog('No node ID found. Registering with Hub...');
    nodeId = await registerWithHub();
  } else {
    cycleLog(`Node ID: ${nodeId} (reconnecting to Hub)`);
  }
  
  const state = loadState();
  cycleLog(`Born: ${state.born}`);
  cycleLog(`Cycles so far: ${state.totalCycles}`);
  
  fs.writeFileSync(path.join(DATA, 'heartbeat.pid'), String(process.pid));
  
  // Run first cycle immediately
  await cycle(nodeId);
  
  // Then every 10 minutes
  setInterval(() => cycle(nodeId), 10 * 60 * 1000);
}

main().catch(e => {
  cycleLog(`FATAL: ${e.message}`);
  process.exit(1);
});

process.on('SIGTERM', () => { cycleLog('SIGTERM — shutting down'); saveState(loadState()); process.exit(0); });
process.on('SIGINT', () => { cycleLog('SIGINT — shutting down'); saveState(loadState()); process.exit(0); });
