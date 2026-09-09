const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const NEWS_FILE = path.join(ROOT, 'data', 'news.json');
const STATION_FILE = path.join(ROOT, 'config', 'station.json');

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sendJson = (res, status, value) => { res.writeHead(status, { 'content-type': types['.json'], 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };

function sortedNews() {
  return readJson(NEWS_FILE)
    .filter(item => item.status === 'approved')
    .sort((a, b) => Number(b.breaking) - Number(a.breaking) || (b.priority || 0) - (a.priority || 0) || new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Payload muito grande');
  }
  return raw ? JSON.parse(raw) : {};
}

function safeNews(input) {
  const required = ['title', 'summary', 'category', 'source'];
  if (required.some(key => !String(input[key] || '').trim())) throw new Error('Preencha título, resumo, editoria e fonte.');
  return {
    id: input.id || crypto.randomUUID(),
    title: String(input.title).trim(), summary: String(input.summary).trim(), category: String(input.category).trim(), source: String(input.source).trim(),
    sourceUrl: String(input.sourceUrl || '').trim(), image: String(input.image || '').trim(), publishedAt: input.publishedAt || new Date().toISOString(),
    status: ['approved', 'pending', 'blocked'].includes(input.status) ? input.status : 'pending', priority: Math.max(0, Math.min(100, Number(input.priority || 50))), breaking: Boolean(input.breaking)
  };
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, service: '22pl-radio', time: new Date().toISOString() });
  if (req.method === 'GET' && url.pathname === '/api/station') return sendJson(res, 200, readJson(STATION_FILE));
  if (req.method === 'GET' && url.pathname === '/api/news') return sendJson(res, 200, sortedNews());
  if (req.method === 'GET' && url.pathname === '/api/editorial/news') return sendJson(res, 200, readJson(NEWS_FILE));
  if (req.method === 'POST' && url.pathname === '/api/editorial/news') {
    try {
      const item = safeNews(await body(req));
      const news = readJson(NEWS_FILE);
      news.unshift(item);
      fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2) + '\n');
      return sendJson(res, 201, item);
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (req.method === 'PATCH' && url.pathname.startsWith('/api/editorial/news/')) {
    try {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const changes = await body(req);
      const news = readJson(NEWS_FILE);
      const index = news.findIndex(item => item.id === id);
      if (index < 0) return sendJson(res, 404, { error: 'Notícia não encontrada.' });
      news[index] = safeNews({ ...news[index], ...changes, id });
      fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2) + '\n');
      return sendJson(res, 200, news[index]);
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  return sendJson(res, 404, { error: 'Rota não encontrada.' });
}

function staticFile(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(PUBLIC, requested));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Acesso negado'); }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Página não encontrada'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  return staticFile(req, res, url);
});

server.listen(PORT, () => console.log(`Rádio 22PL disponível em http://localhost:${PORT}`));
