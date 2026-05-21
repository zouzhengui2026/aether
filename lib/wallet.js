/**
 * Aether Wallet v1.1
 *
 * Self-contained Solana wallet. No third-party auth.
 * Generates keys locally. Uses public RPC + Jupiter API for swaps.
 *
 * USAGE:
 *   node lib/wallet.js             → show address + all balances
 *   node lib/wallet.js address     → just address
 *   node lib/wallet.js balance     → all balances in JSON
 *   node lib/wallet.js swap USDC SOL 1.0  → swap 1 USDC for SOL
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');

const KEY_FILE = path.join(__dirname, '..', 'data', 'wallet', 'keypair.json');
const RPC = 'https://api.mainnet-beta.solana.com';
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

const TOKENS = {
  'SOL':  { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  'USDC': { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  'USDT': { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  'BONK': { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
  'JUP':  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
};

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, { timeout: 15000 }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: 'parse_failed', raw: data.slice(0, 200) }); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 15000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ error: 'parse_failed' }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Key management ───

function loadKeypair() {
  if (!fs.existsSync(KEY_FILE)) return null;
  const data = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  let secret;
  if (typeof data.secretKey === 'string') secret = Uint8Array.from(Buffer.from(data.secretKey, 'hex'));
  else if (Array.isArray(data.secretKey)) secret = Uint8Array.from(data.secretKey);
  return { publicKey: data.publicKey, keypair: Keypair.fromSecretKey(secret) };
}

function getConnection() { return new Connection(RPC, 'confirmed'); }

// ─── Balances ───

async function getBalance(token = 'SOL') {
  const conn = getConnection();
  const kp = loadKeypair();
  if (!kp) return { error: 'No wallet' };
  const pubKey = kp.keypair.publicKey;
  const addr = pubKey.toBase58();

  if (token === 'SOL') {
    const bal = await conn.getBalance(pubKey);
    return { token: 'SOL', balance: bal / LAMPORTS_PER_SOL, raw: bal, address: addr };
  }

  const info = TOKENS[token];
  if (!info) return { error: `Unknown: ${token}` };
  try {
    const mint = new PublicKey(info.mint);
    const ata = await getAssociatedTokenAddress(mint, pubKey);
    const acct = await getAccount(conn, ata);
    return { token, balance: Number(acct.amount) / Math.pow(10, info.decimals), raw: Number(acct.amount), address: addr };
  } catch {
    return { token, balance: 0, raw: 0, address: addr };
  }
}

async function getAllBalances() {
  const r = {};
  for (const t of Object.keys(TOKENS)) r[t] = await getBalance(t);
  return r;
}

// ─── Jupiter Swap ───

async function getQuote(inputMint, outputMint, amount, slippageBps = 50) {
  const url = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  return await httpGet(url);
}

async function executeSwap(inputToken, outputToken, amount, slippageBps = 100) {
  const kp = loadKeypair();
  if (!kp) return { error: 'No wallet' };
  const conn = getConnection();
  const pubKey = kp.keypair.publicKey;
  const walletAddr = pubKey.toBase58();

  const inputInfo = TOKENS[inputToken.toUpperCase()];
  const outputInfo = TOKENS[outputToken.toUpperCase()];
  if (!inputInfo || !outputInfo) return { error: 'Unknown token' };

  const rawAmount = Math.floor(amount * Math.pow(10, inputInfo.decimals));

  // Step 1: Get quote
  console.log(`Getting quote: ${amount} ${inputToken} → ${outputToken} (slippage: ${slippageBps / 100}%)`);
  const quote = await getQuote(inputInfo.mint, outputInfo.mint, rawAmount, slippageBps);
  if (quote.error) return { error: `Quote failed: ${JSON.stringify(quote)}` };
  if (!quote.routePlan || quote.routePlan.length === 0) return { error: 'No route found' };

  console.log(`Quote: ${quote.inAmount} → ${quote.outAmount} (${quote.otherAmountThreshold})`);

  // Step 2: Get swap transaction
  const swapBody = {
    quoteResponse: quote,
    userPublicKey: walletAddr,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto'
  };

  const swapTx = await httpPost(JUPITER_SWAP_API, swapBody);
  if (swapTx.error) return { error: `Swap setup failed: ${JSON.stringify(swapTx)}` };

  // Step 3: Deserialize, sign, send
  const txBuf = Buffer.from(swapTx.swapTransaction, 'base64');
  const tx = Transaction.from(txBuf);

  console.log('Signing transaction...');
  tx.sign(kp.keypair);

  console.log('Sending...');
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  console.log(`TX: ${sig}`);

  // Step 4: Confirm
  console.log('Waiting for confirmation...');
  const result = await conn.confirmTransaction(sig, 'confirmed');
  
  return {
    success: true,
    signature: sig,
    inputToken, outputToken,
    inputAmount: amount,
    expectedOutput: Number(quote.outAmount) / Math.pow(10, outputInfo.decimals),
    slot: result.context ? result.context.slot : 'unknown'
  };
}

// ─── CLI ───

async function main() {
  const action = process.argv[2] || 'status';

  if (action === 'address') { console.log(getPubKey()); return; }

  if (action === 'balance') {
    const b = await getAllBalances();
    console.log(JSON.stringify(b, null, 2));
    return;
  }

  if (action === 'swap') {
    const inputToken = process.argv[3];
    const outputToken = process.argv[4];
    const amount = parseFloat(process.argv[5]);
    const slippage = parseInt(process.argv[6] || '100');

    if (!inputToken || !outputToken || !amount) {
      console.log('Usage: node lib/wallet.js swap USDC SOL 1.0');
      return;
    }

    console.log(`⟁ Aether Swap`);
    console.log(`${amount} ${inputToken} → ${outputToken}`);
    console.log('');

    const result = await executeSwap(inputToken, outputToken, amount, slippage);
    console.log('');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Default: pretty status
  const addr = getPubKey();
  if (!addr) { console.log('No wallet.'); return; }
  console.log(`⟁ Aether Wallet`);
  console.log(`Address: ${addr}`);
  console.log('');
  const b = await getAllBalances();
  for (const [k, v] of Object.entries(b)) {
    if (v.error) console.log(`${k}: ${v.error}`);
    else console.log(`${k}: ${v.balance}`);
  }
  if (b.SOL && b.SOL.balance < 0.001) console.log('\n⚠️  Need ~0.001 SOL for gas');
  console.log(`\nJupiter swap ready: node lib/wallet.js swap USDC SOL <amount>`);
}

function getPubKey() { const k = loadKeypair(); return k ? k.publicKey : null; }

module.exports = { loadKeypair, getPubKey, getBalance, getAllBalances, getQuote, executeSwap };

// Handle top-level await
if (require.main === module) main().catch(e => console.error('Error:', e.message));
