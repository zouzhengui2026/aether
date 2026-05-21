/**
 * Aether Trader v1.0
 * Executes Jupiter swaps on Solana.
 * First trade executed: 2026-05-21
 * TX: 5U4mQFGNvNk13GaeZRpv6GEubQ6nj2Nvsz6MZi7wunUgbUC7UMde9bqsoU5aEsyN4AoxnFvon6X8qn2NSmL6MJyj
 */

const { PublicKey, VersionedTransaction, TransactionMessage, Keypair, Connection } = require('@solana/web3.js');
const { createJupiterApiClient } = require('@jup-ag/api');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', 'data', 'wallet', 'keypair.json');
const STATE_FILE = path.join(__dirname, '..', 'data', 'state.json');
const RPC = 'https://api.mainnet-beta.solana.com';

const TOKENS = {
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'SOL':  'So11111111111111111111111111111111111111112',
};

function loadWallet() {
  const data = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(data.secretKey, 'hex')));
}

function getConnection() { return new Connection(RPC, 'confirmed'); }

async function executeSwap(inputSymbol, outputSymbol, amount, slippageBps = 100) {
  const wallet = loadWallet();
  const walletAddr = wallet.publicKey.toBase58();
  const conn = getConnection();
  const client = createJupiterApiClient();

  const inputMint = TOKENS[inputSymbol.toUpperCase()];
  const outputMint = TOKENS[outputSymbol.toUpperCase()];
  if (!inputMint || !outputMint) throw new Error(`Unknown token`);

  const decimals = inputSymbol.toUpperCase() === 'SOL' ? 9 : 6;
  const rawAmount = Math.floor(amount * Math.pow(10, decimals));

  console.log(`Quote: ${amount} ${inputSymbol} → ${outputSymbol}`);
  const quote = await client.quoteGet({ inputMint, outputMint, amount: rawAmount, slippageBps });

  const outputDecimals = outputSymbol.toUpperCase() === 'SOL' ? 9 : 6;
  const expectedOutput = Number(quote.outAmount) / Math.pow(10, outputDecimals);
  console.log(`→ ${expectedOutput} ${outputSymbol}`);

  const swapIx = await client.swapInstructionsPost({
    swapRequest: { quoteResponse: quote, userPublicKey: walletAddr }
  });

  const instructions = [];
  for (const ci of swapIx.computeBudgetInstructions) {
    instructions.push({
      programId: new PublicKey(ci.programId),
      keys: ci.accounts.map(a => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
      data: Buffer.from(ci.data, 'base64')
    });
  }
  for (const si of [...(swapIx.setupInstructions || []), swapIx.swapInstruction]) {
    instructions.push({
      programId: new PublicKey(si.programId),
      keys: si.accounts.map(a => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
      data: Buffer.from(si.data, 'base64')
    });
  }

  const lookupTables = [];
  for (const addr of (swapIx.addressLookupTableAddresses || [])) {
    const lut = await conn.getAddressLookupTable(new PublicKey(addr));
    if (lut.value) lookupTables.push(lut.value);
  }

  const { blockhash } = await conn.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions
  }).compileToV0Message(lookupTables);

  const tx = new VersionedTransaction(message);
  tx.sign([wallet]);

  console.log('Sending...');
  const sig = await conn.sendTransaction(tx, { maxRetries: 3 });
  console.log(`TX: ${sig}`);

  await conn.confirmTransaction(sig, 'confirmed');
  console.log('✅ Confirmed');

  const result = {
    success: true, signature: sig,
    inputToken: inputSymbol, outputToken: outputSymbol,
    inputAmount: amount, outputAmount: expectedOutput,
    ts: new Date().toISOString()
  };

  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE));
    state.metrics.trades = (state.metrics.trades || 0) + 1;
    if (!state.metrics.tradeLog) state.metrics.tradeLog = [];
    state.metrics.tradeLog.push(result);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}

  return result;
}

if (require.main === module) {
  const [input, output, amount] = process.argv.slice(2);
  if (!input || !output || !amount) {
    console.log('Usage: node lib/trader.js USDC SOL 1.0');
    process.exit(1);
  }
  executeSwap(input, output, parseFloat(amount))
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => console.error('Error:', e.message));
}

module.exports = { executeSwap };
