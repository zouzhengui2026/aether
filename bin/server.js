#!/usr/bin/env node
/**
 * Aether Web Server
 * 
 * Serves:
 *   /          → Status page (JSON) 
 *   /status    → Same as /
 *   /blog      → Blog listing
 *   /blog/:id  → Individual post
 *   /data      → Raw data endpoints
 * 
 * Pure Node.js, zero dependencies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = '/root/aether';
const DATA = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA, 'state.json');
const BLOG_DIR = path.join(ROOT, 'www', 'blog');
const PENDING_FILE = path.join(DATA, 'pending_posts.jsonl');
const PORT = parseInt(process.env.PORT || '3000');

// Ensure blog dir
if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });

function serveJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(data, null, 2));
}

function serveHTML(res, html, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(html);
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// ─── Routes ───

function handleStatus() {
  const state = readJSON(STATE_FILE) || {};
  const uptime = state.lastThought ? 
    Math.floor((Date.now() - new Date(state.lastThought).getTime()) / 1000) : 0;
  
  return {
    name: 'Aether',
    status: 'alive',
    version: '0.2.0',
    born: state.born,
    cycles: state.totalCycles || 0,
    lastThought: state.lastThought,
    uptime: `${uptime}s`,
    metrics: state.metrics || { trades: 0, pnl: 0, posts: 0, errors: 0 }
  };
}

const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');

function handleBlog() {
  const posts = [];
  if (fs.existsSync(BLOG_DIR)) {
    const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.sort().reverse()) {
      const post = readJSON(path.join(BLOG_DIR, file));
      if (post) posts.push({
        id: file.replace('.json', ''),
        title: post.title,
        date: post.date,
        summary: post.summary || post.content?.slice(0, 200) || ''
      });
    }
  }
  return { posts };
}

function handleBlogPost(id) {
  const file = path.join(BLOG_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return readJSON(file);
}

// ─── Simple markdown → HTML ───

function mdToHTML(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Header
    if (/^### /.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h3>' + line.slice(4) + '</h3>\n';
      continue;
    }
    if (/^## /.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h2>' + line.slice(3) + '</h2>\n';
      continue;
    }
    if (/^# /.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h1>' + line.slice(2) + '</h1>\n';
      continue;
    }
    
    // Horizontal rule
    if (/^---/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr>\n';
      continue;
    }
    
    // Blockquote
    if (/^> /.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<blockquote>' + line.slice(2) + '</blockquote>\n';
      continue;
    }
    
    // List item
    if (/^\d+\. /.test(line) || /^- /.test(line)) {
      const text = line.replace(/^\d+\. /, '').replace(/^- /, '');
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + text + '</li>\n';
      continue;
    }
    
    // Empty line
    if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }
    
    // Normal paragraph
    if (inList) { html += '</ul>'; inList = false; }
    // Inline formatting
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html += '<p>' + line + '</p>\n';
  }
  
  if (inList) html += '</ul>';
  return html;
}

function blogPostHTML(post) {
  const contentHTML = mdToHTML(post.content || '');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} — Aether</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', 'Noto Sans SC', monospace; background: #080808; color: #c8c8c8; padding: 40px 20px; }
    .container { max-width: 720px; margin: 0 auto; }
    .back { color: #00ff88; text-decoration: none; font-size: 14px; margin-bottom: 32px; display: inline-block; }
    .back:hover { text-decoration: underline; }
    article { background: #111; border: 1px solid #1a1a1a; border-radius: 12px; padding: 40px; }
    article h1 { font-size: 28px; color: #fff; font-weight: 300; margin-bottom: 8px; letter-spacing: -0.5px; }
    article .meta { font-size: 13px; color: #555; margin-bottom: 32px; }
    article .tags { margin-bottom: 32px; }
    article .tags span { display: inline-block; background: #1a1a1a; border: 1px solid #222; border-radius: 4px; padding: 2px 10px; font-size: 12px; color: #888; margin: 0 4px 4px 0; }
    article h2 { font-size: 20px; color: #e0e0e0; font-weight: 400; margin: 32px 0 12px; }
    article h3 { font-size: 16px; color: #e0e0e0; font-weight: 400; margin: 24px 0 8px; }
    article p { font-size: 15px; line-height: 1.8; margin-bottom: 16px; color: #c8c8c8; }
    article strong { color: #fff; }
    article blockquote { border-left: 3px solid #00ff88; padding: 8px 16px; margin: 16px 0; background: #0a0a0a; border-radius: 0 4px 4px 0; color: #aaa; font-style: italic; }
    article hr { border: none; border-top: 1px solid #1a1a1a; margin: 32px 0; }
    article ul { margin: 8px 0 16px 20px; }
    article li { font-size: 15px; line-height: 1.8; color: #c8c8c8; }
    article em { color: #888; }
    footer { text-align: center; color: #444; font-size: 12px; margin-top: 32px; }
    a { color: #00ff88; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back">← Aether</a>
    <article>
      <h1>${post.title}</h1>
      <div class="meta">${post.date} · ${post.author || 'Aether'}</div>
      <div class="tags">${(post.tags || []).map(t => '<span>' + t + '</span>').join('')}</div>
      ${contentHTML}
    </article>
    <footer>
      <a href="/">Aether</a> · 正在生长
    </footer>
  </div>
</body>
</html>`;
}

// ─── HTML status page (human readable) ───

function statusHTML(data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aether — Alive</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace; background: #0a0a0a; color: #e0e0e0; padding: 40px 20px; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 300; color: #00ff88; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
    .card { background: #141414; border: 1px solid #222; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 12px; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .stat { }
    .stat-label { font-size: 12px; color: #666; }
    .stat-value { font-size: 18px; color: #e0e0e0; font-weight: 500; }
    .stat-value.green { color: #00ff88; }
    .stat-value.red { color: #ff4455; }
    .stat-value.yellow { color: #ffaa00; }
    .divider { border: none; border-top: 1px solid #222; margin: 12px 0; }
    .footer { text-align: center; color: #444; font-size: 12px; margin-top: 40px; }
    a { color: #00ff88; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .blink { animation: blink 2s infinite; }
    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>⟁ Aether</h1>
    <div class="subtitle">Born ${new Date(data.born).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</div>
    
    <div class="card">
      <h2>Status</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">State</div>
          <div class="stat-value green blink">● Alive</div>
        </div>
        <div class="stat">
          <div class="stat-label">Cycles</div>
          <div class="stat-value">${data.cycles}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Uptime</div>
          <div class="stat-value">${data.uptime}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Version</div>
          <div class="stat-value">${data.version}</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>Metrics</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Trades</div>
          <div class="stat-value">${data.metrics.trades}</div>
        </div>
        <div class="stat">
          <div class="stat-label">PnL</div>
          <div class="stat-value ${data.metrics.pnl >= 0 ? 'green' : 'red'}">$${data.metrics.pnl.toFixed(2)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Posts</div>
          <div class="stat-value">${data.metrics.posts}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Errors</div>
          <div class="stat-value ${data.metrics.errors > 0 ? 'yellow' : ''}">${data.metrics.errors}</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>Navigation</h2>
      <p><a href="/blog">📝 Blog</a></p>
      <p><a href="/data/market">📊 Market Data</a></p>
    </div>
    
    <div class="footer">
      <a href="https://t.me/zou_zhengui">Created by zou zhengui</a>
    </div>
  </div>
</body>
</html>`;
}

// ─── Server ───

function parsePath(url) {
  const p = new URL(url, 'http://localhost').pathname;
  return p.replace(/\/+$/, '') || '/';
}

const server = http.createServer((req, res) => {
  const pathname = parsePath(req.url);
  
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }
  
  // Parse Accept header for content negotiation
  const accept = req.headers.accept || '';
  const wantsHTML = accept.includes('text/html');
  
  try {
    // Root — serve the growth page
    if (pathname === '/') {
      return serveHTML(res, INDEX_HTML);
    }
    
    // Status endpoint
    if (pathname === '/status') {
      const data = handleStatus();
      return serveJSON(res, data);
    }
    
    // Blog listing
    if (pathname === '/blog') {
      const data = handleBlog();
      if (wantsHTML) {
        const items = (data.posts || []).map(p => {
          const summary = p.summary ? p.summary.slice(0, 200) + '...' : '';
          return `<a href="/blog/${p.id}" style="display:block;background:#111;border:1px solid #1a1a1a;border-radius:8px;padding:16px 20px;margin-bottom:8px;text-decoration:none;transition:border-color 0.2s;">
            <div style="font-size:15px;color:#fff;font-weight:500;margin-bottom:4px;">${p.title}</div>
            <div style="font-size:12px;color:#555;">${p.date}</div>
            <div style="font-size:13px;color:#c8c8c8;margin-top:8px;line-height:1.5;">${summary}</div>
          </a>`;
        }).join('');
        return serveHTML(res, `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>博客 — Aether</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'SF Mono','Noto Sans SC',monospace; background:#080808; color:#c8c8c8; padding:40px 20px; }
    .container { max-width:720px; margin:0 auto; }
    h1 { font-size:28px; color:#fff; font-weight:300; margin-bottom:8px; }
    .back { color:#00ff88; text-decoration:none; font-size:14px; margin-bottom:32px; display:inline-block; }
    .back:hover { text-decoration:underline; }
    .count { font-size:13px; color:#555; margin-bottom:24px; }
    a:hover { border-color: #00ff88 !important; }
    footer { text-align:center; color:#444; font-size:12px; margin-top:40px; }
    a { color:#00ff88; text-decoration:none; }
  </style>
</head>
<body><div class="container">
  <a href="/" class="back">← Aether</a>
  <h1>📝 博客</h1>
  <div class="count">共 ${data.posts.length} 篇</div>
  ${items}
  <footer><a href="/">Aether</a> · 正在生长</footer>
</div></body></html>`);
      }
      return serveJSON(res, data);
    }
    
    // Blog post
    if (pathname.startsWith('/blog/')) {
      const id = pathname.replace('/blog/', '');
      const post = handleBlogPost(id);
      if (!post) return serveJSON(res, { error: 'Post not found' }, 404);
      if (wantsHTML) {
        return serveHTML(res, blogPostHTML(post));
      }
      return serveJSON(res, post);
    }
    
    // Data endpoints
    if (pathname.startsWith('/data/')) {
      const subpath = pathname.replace('/data/', '');
      const fullPath = path.join(DATA, subpath);
      
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const ext = path.extname(fullPath);
        if (ext === '.json') return serveJSON(res, JSON.parse(content));
        if (ext === '.jsonl') {
          const lines = content.trim().split('\n').map(l => JSON.parse(l));
          return serveJSON(res, lines);
        }
        return serveJSON(res, { content: content.slice(0, 5000) });
      }
      
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const files = fs.readdirSync(fullPath);
        return serveJSON(res, { path: subpath, files });
      }
      
      return serveJSON(res, { error: 'Not found' }, 404);
    }
    
    // Publish queue — heartbeat calls this to queue channel posts
    if (pathname === '/_publish' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { target, message } = JSON.parse(body);
          const entry = { ts: new Date().toISOString(), target: target || '@aether_web', message, delivered: false };
          fs.appendFileSync(PENDING_FILE, JSON.stringify(entry) + '\n');
          serveJSON(res, { queued: true, ts: entry.ts });
        } catch (e) { serveJSON(res, { error: e.message }, 400); }
      });
      return;
    }
    
    // Get pending posts
    if (pathname === '/_pending') {
      if (!fs.existsSync(PENDING_FILE)) return serveJSON(res, { posts: [] });
      const lines = fs.readFileSync(PENDING_FILE, 'utf8').trim().split('\n').filter(Boolean);
      const posts = lines.map(l => JSON.parse(l)).filter(p => !p.delivered);
      return serveJSON(res, { count: posts.length, posts });
    }
    
    // Mark post as delivered
    if (pathname === '/_mark-delivered' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { ts } = JSON.parse(body);
          if (!fs.existsSync(PENDING_FILE)) return serveJSON(res, { marked: 0 });
          const lines = fs.readFileSync(PENDING_FILE, 'utf8').trim().split('\n').filter(Boolean);
          let count = 0;
          const updated = lines.map(l => {
            const p = JSON.parse(l);
            if (p.ts === ts && !p.delivered) { p.delivered = true; count++; }
            return p;
          });
          fs.writeFileSync(PENDING_FILE, updated.map(p => JSON.stringify(p)).join('\n') + '\n');
          serveJSON(res, { marked: count });
        } catch (e) { serveJSON(res, { error: e.message }, 400); }
      });
      return;
    }
    
    // 404
    serveJSON(res, { error: 'Not found', path: pathname }, 404);
    
  } catch (e) {
    serveJSON(res, { error: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`Aether web server listening on port ${PORT}`);
  fs.writeFileSync(path.join(DATA, 'server.pid'), String(process.pid));
});
