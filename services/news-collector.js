const fs = require('node:fs');
const crypto = require('node:crypto');

const decodeEntities = value => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

const cleanText = value => decodeEntities(value)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const removeSources = value => String(value || '')
  .replace(/(?:^|\s)(?:fontes consultadas|fontes?|referências)\b(?:\s*:)?[\s\S]*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

function rawTag(xml, names) {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return match[1];
  }
  return '';
}

function tag(xml, names) {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return cleanText(match[1]);
  }
  return '';
}

function link(xml) {
  const rssLink = tag(xml, ['link']);
  if (rssLink) return rssLink;
  const atom = xml.match(/<link[^>]+href=["']([^"']+)["']/i);
  return atom ? decodeEntities(atom[1]) : '';
}

function sourceName(xml, fallback, title) {
  const source = tag(xml, ['source', 'dc:creator', 'author']);
  if (source) return source;
  const parts = title.split(' - ');
  return parts.length > 1 ? parts.at(-1).trim() : fallback;
}

function headline(title, source) {
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

function parseFeed(xml, config) {
  const blocks = xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) || [];
  return blocks.map(block => {
    const rawTitle = tag(block, ['title']);
    const source = sourceName(block, config.name, rawTitle);
    const title = headline(rawTitle, source);
    const rawContent = rawTag(block, ['content:encoded', 'content']);
    const description = tag(block, ['description', 'summary']);
    const feedContent = removeSources(cleanText(rawContent));
    const publishedAt = tag(block, ['pubDate', 'published', 'updated', 'dc:date']);
    const sourceUrl = link(block);
    if (!title || !sourceUrl) return null;
    const urgent = /\b(urgente|plantão|ataque|terremoto|explosão|morre|morreu|queda de avião)\b/i.test(title);
    return {
      id: `feed-${crypto.createHash('sha1').update(`${title}|${source}`).digest('hex').slice(0, 20)}`,
      title,
      summary: description && description !== rawTitle ? description.slice(0, 700) : `Confira os detalhes desta notícia publicada por ${source}.`,
      content: feedContent.length > 80 ? feedContent : '',
      category: config.category || 'Últimas Notícias',
      source,
      sourceUrl,
      image: '',
      publishedAt: Number.isNaN(Date.parse(publishedAt)) ? new Date().toISOString() : new Date(publishedAt).toISOString(),
      status: config.autoApprove === false ? 'pending' : 'approved',
      priority: urgent ? 100 : 50,
      breaking: urgent,
      importedAt: new Date().toISOString(),
      feedId: config.id
    };
  }).filter(Boolean);
}

function extractArticleText(html) {
  let area = String(html || '');
  const article = area.match(/<article(?:\s[^>]*)?>([\s\S]*?)<\/article>/i);
  const main = area.match(/<main(?:\s[^>]*)?>([\s\S]*?)<\/main>/i);
  area = article?.[1] || main?.[1] || area;
  area = area
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:nav|aside|footer|form|button)[\s\S]*?<\/(?:nav|aside|footer|form|button)>/gi, ' ')
    .replace(/<h[1-6][^>]*>\s*(?:fontes?|fontes consultadas|referências)\s*<\/h[1-6]>[\s\S]*$/i, ' ');
  const blocos = [...area.matchAll(/<(?:p|h2|h3)(?:\s[^>]*)?>([\s\S]*?)<\/(?:p|h2|h3)>/gi)]
    .map(match => cleanText(match[1]))
    .filter(texto => texto.length > 20)
    .filter(texto => !/^(?:leia também|veja também|publicidade|compartilhe|siga-nos|assine|fontes?|referências)\b/i.test(texto));
  return removeSources(blocos.join(' '));
}

async function fetchArticleText(url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 Radio22PL/0.3', accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return extractArticleText(await response.text());
  } catch {
    return '';
  }
}

function createCollector({ sourcesFile, newsFile, intervalMinutes = 3 }) {
  const state = { running: false, lastRun: null, imported: 0, errors: [] };

  async function sync() {
    if (state.running) return state;
    state.running = true;
    state.errors = [];
    let imported = 0;
    try {
      const sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8')).filter(source => source.enabled);
      const current = JSON.parse(fs.readFileSync(newsFile, 'utf8'));
      const byId = new Map(current.map(item => [item.id, item]));
      for (const source of sources) {
        try {
          const response = await fetch(source.url, { headers: { 'user-agent': 'Radio22PL/0.2 (+https://github.com/assumcaonerd/22pl)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const items = parseFeed(await response.text(), source);
          for (const item of items) {
            const existing = byId.get(item.id);
            if (existing) {
              if (!existing.content) existing.content = item.content || await fetchArticleText(existing.sourceUrl || item.sourceUrl);
              continue;
            }
            if (!item.content) item.content = await fetchArticleText(item.sourceUrl);
            current.push(item);
            byId.set(item.id, item);
            imported += 1;
          }
        } catch (error) {
          state.errors.push({ source: source.name, message: error.message });
        }
      }
      current.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      fs.writeFileSync(newsFile, `${JSON.stringify(current.slice(0, 300), null, 2)}\n`);
      state.lastRun = new Date().toISOString();
      state.imported = imported;
      state.running = false;
      return { ...state };
    } finally {
      state.running = false;
    }
  }

  const timer = setInterval(() => sync().catch(error => { state.errors.push({ source: 'coletor', message: error.message }); }), intervalMinutes * 60_000);
  timer.unref();
  return { sync, status: () => ({ ...state }), intervalMinutes };
}

module.exports = { createCollector, parseFeed, cleanText, extractArticleText, removeSources };
