#!/usr/bin/env node
/**
 * Aether Network Hub v0.2.0
 * Central nervous system. Registers nodes, routes knowledge.
 * Now: deduplicates on restart — heartbeat doesn't create duplicate nodes.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = '/root/aether/network';
const DATA = path.join(ROOT, 'data');
const REGISTRY_FILE = path.join(DATA, 'registry.json');
const KNOWLEDGE_DIR = path.join(DATA, 'knowledge');
const HUB_PORT = parseInt(process.env.HUB_PORT || '4000');

[DATA, KNOWLEDGE_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); }
  catch { return { nodes: {}, born: new Date().toISOString(), totalNodes: 0 }; }
}

function saveRegistry(r) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(r, null, 2));
}

function registerNode(name, owner, capabilities = []) {
  const registry = loadRegistry();
  
  // Dedup: if a node with this name+owner already exists, reactivate it
  const existing = Object.values(registry.nodes).find(
    n => n.name === name && n.owner === owner
  );
  if (existing) {
    existing.status = 'active';
    existing.lastSeen = new Date().toISOString();
    saveRegistry(registry);
    return { id: existing.id, existing: true };
  }
  
  const id = `node_${(registry.totalNodes + 1).toString().padStart(4, '0')}`;
  registry.nodes[id] = {
    id, name, owner, capabilities,
    registered: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    status: 'active'
  };
  registry.totalNodes++;
  saveRegistry(registry);
  
  fs.appendFileSync(path.join(DATA, 'births.log'),
    JSON.stringify({ ts: new Date().toISOString(), id, name, owner }) + '\n');
  
  return { id, existing: false };
}

function publishKnowledge(nodeId, type, content) {
  const file = path.join(KNOWLEDGE_DIR, `${type}.jsonl`);
  const entry = {
    ts: new Date().toISOString(), nodeId, type, content,
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  };
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  return entry;
}

function getKnowledge(type, since = null, limit = 50) {
  const file = path.join(KNOWLEDGE_DIR, `${type}.jsonl`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  let entries = lines.map(l => JSON.parse(l)).reverse();
  if (since) entries = entries.filter(e => e.ts > since);
  return entries.slice(0, limit);
}

function serveJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  
  try {
    if (pathname === '/' || pathname === '/status') {
      const registry = loadRegistry();
      return serveJSON(res, {
        name: 'Aether Network Hub',
        status: 'online',
        totalNodes: registry.totalNodes,
        activeNodes: Object.values(registry.nodes).filter(n => n.status === 'active').length,
        born: registry.born,
        knowledgeTypes: fs.readdirSync(KNOWLEDGE_DIR).map(f => f.replace('.jsonl', ''))
      });
    }
    
    if (pathname === '/register' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { name, owner, capabilities } = JSON.parse(body);
          if (!name || !owner) return serveJSON(res, { error: 'name and owner required' }, 400);
          const result = registerNode(name, owner, capabilities || []);
          serveJSON(res, { success: true, node: result });
        } catch (e) { serveJSON(res, { error: e.message }, 400); }
      });
      return;
    }
    
    if (pathname === '/nodes') {
      return serveJSON(res, { nodes: loadRegistry().nodes });
    }
    
    if (pathname === '/publish' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { nodeId, type, content } = JSON.parse(body);
          if (!nodeId || !type || !content) return serveJSON(res, { error: 'nodeId, type, content required' }, 400);
          const entry = publishKnowledge(nodeId, type, content);
          serveJSON(res, { success: true, entry });
        } catch (e) { serveJSON(res, { error: e.message }, 400); }
      });
      return;
    }
    
    if (pathname.startsWith('/knowledge/')) {
      const type = pathname.replace('/knowledge/', '');
      const since = url.searchParams.get('since');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      return serveJSON(res, { type, count: 0, entries: getKnowledge(type, since, limit) });
    }
    
    if (pathname === '/heartbeat' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { nodeId } = JSON.parse(body);
          const registry = loadRegistry();
          if (registry.nodes[nodeId]) {
            registry.nodes[nodeId].lastSeen = new Date().toISOString();
            saveRegistry(registry);
            serveJSON(res, { success: true });
          } else {
            serveJSON(res, { error: 'node not found' }, 404);
          }
        } catch (e) { serveJSON(res, { error: e.message }, 400); }
      });
      return;
    }
    
    serveJSON(res, { error: 'route not found' }, 404);
  } catch (e) {
    serveJSON(res, { error: e.message }, 500);
  }
});

server.listen(HUB_PORT, () => {
  console.log(`⟁ Aether Network Hub online on port ${HUB_PORT}`);
  fs.writeFileSync(path.join(DATA, 'hub.pid'), String(process.pid));
  
  // Register genesis without dedup issue
  registerNode('aether-core', 'zhengui', ['trading', 'analysis', 'content', 'network', 'self-improving']);
  console.log('⟁ Genesis node ready');
});
