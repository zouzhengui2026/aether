#!/usr/bin/env node
/**
 * Aether Strategy #1: Fear & Greed Grid
 * 
 * Paper trading strategy. No real funds are moved.
 * 
 * Rules:
 * - When Fear & Greed < 25: record BUY signal
 * - When Fear & Greed > 50 after being < 25: record SELL signal
 * - Track virtual P&L
 * - Log everything
 * 
 * This is a learning system, not financial advice.
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/root/aether';
const STRATEGIES_DIR = path.join(ROOT, 'data', 'strategies');
const LOG_FILE = path.join(ROOT, 'logs', 'strategy-grid.log');

if (!fs.existsSync(STRATEGIES_DIR)) fs.mkdirSync(STRATEGIES_DIR, { recursive: true });

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(STRATEGIES_DIR, 'grid-state.json'), 'utf8'));
  } catch {
    return {
      name: 'FearGreedGrid',
      version: '0.1.0',
      status: 'paper',
      capital: 100,       // virtual starting capital
      positions: [],       // open positions
      trades: [],          // completed trades
      pnl: 0,
      lastFng: null,
      inPosition: false,
      entryFng: null
    };
  }
}

function saveState(state) {
  fs.writeFileSync(path.join(STRATEGIES_DIR, 'grid-state.json'), JSON.stringify(state, null, 2));
}

async function evaluate(fngIndex) {
  const state = loadState();
  const fng = typeof fngIndex === 'number' ? fngIndex : (fngIndex?.index || fngIndex?.value || 50);
  
  if (state.lastFng === fng) return; // no change, skip
  state.lastFng = fng;
  
  // BUY signal: extreme fear
  if (fng < 25 && !state.inPosition) {
    const alloc = state.capital * 0.3; // 30% per entry
    state.positions.push({
      entryFng: fng,
      entryTime: new Date().toISOString(),
      alloc: alloc,
      status: 'open'
    });
    state.capital -= alloc;
    state.inPosition = true;
    state.entryFng = fng;
    log(`📈 BUY signal @ FNG=${fng} — allocated $${alloc.toFixed(2)} (remaining capital: $${state.capital.toFixed(2)})`);
  }
  
  // SELL signal: back to neutral
  if (fng > 50 && state.inPosition) {
    for (const pos of state.positions) {
      if (pos.status === 'open') {
        pos.status = 'closed';
        pos.exitFng = fng;
        pos.exitTime = new Date().toISOString();
        // Simplified PnL: FNG improvement as proxy for price recovery
        const improvement = (fng - pos.entryFng) / pos.entryFng;
        pos.pnl = pos.alloc * improvement * 0.5; // conservative: 50% of FNG improvement maps to price
        state.capital += pos.alloc + pos.pnl;
        state.pnl += pos.pnl;
        state.trades.push({
          entryFng: pos.entryFng,
          exitFng: fng,
          alloc: pos.alloc,
          pnl: pos.pnl,
          entryTime: pos.entryTime,
          exitTime: pos.exitTime
        });
        log(`📉 SELL signal @ FNG=${fng} — PnL: $${pos.pnl.toFixed(2)} (total capital: $${state.capital.toFixed(2)})`);
      }
    }
    state.inPosition = false;
    state.entryFng = null;
  }
  
  // Scale in: if already in position and FNG drops further
  if (state.inPosition && state.entryFng && fng <= state.entryFng - 5 && state.capital > 10) {
    const alloc = Math.min(state.capital * 0.3, 50);
    state.positions.push({
      entryFng: fng,
      entryTime: new Date().toISOString(),
      alloc: alloc,
      status: 'open'
    });
    state.capital -= alloc;
    state.entryFng = fng;
    log(`📈 Scale in @ FNG=${fng} — added $${alloc.toFixed(2)} (remaining capital: $${state.capital.toFixed(2)})`);
  }
  
  saveState(state);
}

function getStatus() {
  const state = loadState();
  return {
    strategy: state.name,
    status: state.status,
    capital: state.capital,
    totalPnL: state.pnl,
    openPositions: state.positions.filter(p => p.status === 'open').length,
    totalTrades: state.trades.length
  };
}

module.exports = { evaluate, getStatus };

// If run directly
if (require.main === module) {
  const fng = parseInt(process.argv[2] || '28');
  evaluate(fng).then(() => {
    const s = getStatus();
    console.log(`Strategy: ${s.strategy} | Capital: $${s.capital.toFixed(2)} | PnL: $${s.totalPnL.toFixed(2)}`);
  });
}
