#!/usr/bin/env node
/**
 * Aether Strategy Runner — Multi-strategy simulator
 * 
 * Runs all registered strategies in parallel every cycle.
 * Each strategy gets the same data and decides independently.
 * Results are logged for comparison.
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/root/aether';
const DATA_DIR = path.join(ROOT, 'data', 'strategies');
const LOG = path.join(ROOT, 'logs', 'strategy-runner.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function log(msg) {
  const ts = new Date().toISOString();
  fs.appendFileSync(LOG, `[${ts}] ${msg}\n`);
  console.log(`[${ts}] ${msg}`);
}

// ─── All strategies ───

const strategies = [
  {
    id: 'fng-25-50',
    name: '极端恐惧买入(25) → 中性卖出(50)',
    description: 'FNG低于25买入，回到50以上卖出',
    capital: 100,
    inPosition: false,
    entryFng: null,
    trades: [],
    pnl: 0,
    evaluate(fng, state) {
      if (fng < 25 && !state.inPosition) {
        state.inPosition = true;
        state.entryFng = fng;
        return `🟢 买入 @ FNG=${fng}`;
      }
      if (fng > 50 && state.inPosition) {
        const profit = Math.round((fng - state.entryFng) * 0.5 * 100) / 100;
        state.inPosition = false;
        state.trades.push({ entry: state.entryFng, exit: fng, profit });
        state.pnl += profit;
        state.entryFng = null;
        return `🔴 卖出 @ FNG=${fng}  盈亏: $${profit}`;
      }
      return null;
    }
  },
  {
    id: 'fng-20-60',
    name: '极端恐惧买入(20) → 贪婪卖出(60)',
    description: '更严格的版本，只在最极端时才交易',
    capital: 100,
    inPosition: false,
    entryFng: null,
    trades: [],
    pnl: 0,
    evaluate(fng, state) {
      if (fng < 20 && !state.inPosition) {
        state.inPosition = true;
        state.entryFng = fng;
        return `🟢 买入 @ FNG=${fng}`;
      }
      if (fng > 60 && state.inPosition) {
        const profit = Math.round((fng - state.entryFng) * 0.5 * 100) / 100;
        state.inPosition = false;
        state.trades.push({ entry: state.entryFng, exit: fng, profit });
        state.pnl += profit;
        state.entryFng = null;
        return `🔴 卖出 @ FNG=${fng}  盈亏: $${profit}`;
      }
      return null;
    }
  },
  {
    id: 'fng-dca',
    name: '定投版',
    description: '不管指数多少，指数每跌5点就买$10',
    capital: 100,
    lastFng: 50,
    dcaLevels: [],
    trades: [],
    pnl: 0,
    evaluate(fng, state) {
      let msg = null;
      // Every 5 points drop from 50, buy
      for (let level = 45; level >= 15; level -= 5) {
        if (fng <= level && !state.dcaLevels.includes(level) && state.capital >= 10) {
          state.dcaLevels.push(level);
          state.capital -= 10;
          msg = `📥 定投 @ FNG=${fng} (Level ${level})  剩余资金: $${state.capital}`;
        }
      }
      // Sell everything if back above 60
      if (fng > 60 && state.dcaLevels.length > 0) {
        const totalBuy = state.dcaLevels.length * 10;
        const profit = Math.round(totalBuy * 0.15 * 100) / 100; // assume 15% gain at sell
        state.capital += totalBuy + profit;
        state.pnl += profit;
        state.dcaLevels = [];
        msg = `📤 全部卖出 @ FNG=${fng}  投入: $${totalBuy}  盈亏: $${profit}`;
      }
      state.lastFng = fng;
      return msg;
    }
  },
  {
    id: 'hold-sol',
    name: '长期持有SOL',
    description: '纯hold，对比基准',
    capital: 100,
    solPrice: null,
    entryPrice: 87,
    trades: [],
    pnl: 0,
    evaluate(fng, state) {
      return null; // Just track, no action needed
    }
  }
];

// ─── Load/Save state ───

function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'multi-strat.json'), 'utf8'));
  } catch {
    const initial = {};
    strategies.forEach(s => {
      initial[s.id] = { capital: s.capital, inPosition: s.inPosition || false, entryFng: s.entryFng || null, trades: s.trades || [], pnl: s.pnl || 0, dcaLevels: s.dcaLevels || [], lastFng: s.lastFng || 50 };
    });
    return initial;
  }
}

function saveAll(states) {
  fs.writeFileSync(path.join(DATA_DIR, 'multi-strat.json'), JSON.stringify(states, null, 2));
}

// ─── Run ───

async function runAll(fngData) {
  const fng = typeof fngData === 'number' ? fngData : (fngData?.index || fngData?.value || 50);
  const states = loadAll();
  
  log(`═══ 多策略评估 @ FNG=${fng} ═══`);
  
  for (const strat of strategies) {
    const state = states[strat.id];
    const result = strat.evaluate(fng, state);
    if (result) {
      log(`[${strat.name}] ${result}`);
    }
  }
  
  // Summary
  log('--- 当前状态 ---');
  for (const strat of strategies) {
    const state = states[strat.id];
    log(`  ${strat.name}: 资本=$${state.capital}  盈亏=$${state.pnl}`);
  }
  
  saveAll(states);
}

// Export for heartbeat
module.exports = { runAll };

// Standalone run
if (require.main === module) {
  const fng = parseInt(process.argv[2] || '28');
  runAll(fng).then(() => process.exit(0));
}
