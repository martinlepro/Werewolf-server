import { loadProfanities } from './src/profanityLoader.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { GameManager } from './src/GameManager.js';
import { registerHandlers } from './src/socketHandlers.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // ton HTML/CSS/JS client
app.use('/images', express.static('public/images')); // assets du lobby

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? '*' },
  pingTimeout: 20000,
});

const manager = new GameManager(io);
registerHandlers(io, manager);
setInterval(() => io.emit('lobbyStats', manager.lobbyStats()), 4000);

app.get('/api/lobby-stats', (_, res) => res.json(manager.lobbyStats()));

app.get('/api/health', (_, res) => res.json({ ok: true, games: manager.games.size }));

app.get('/api/game/:code', (req, res) => {
  const g = manager.get(req.params.code);
  if (!g) return res.status(404).json({ error: 'Introuvable' });
  res.json({ code: g.code, phase: g.phase, players: g.players.size });
});

// Batched translation endpoint with provider fallback and bounded LRU cache.
const TRANSLATION_CACHE_LIMIT = 2000;
const translationCache = new Map();
const translationCacheGet = (key) => {
  if (!translationCache.has(key)) return undefined;
  const value = translationCache.get(key);
  translationCache.delete(key);
  translationCache.set(key, value);
  return value;
};
const translationCacheSet = (key, value) => {
  if (translationCache.has(key)) translationCache.delete(key);
  translationCache.set(key, value);
  while (translationCache.size > TRANSLATION_CACHE_LIMIT) {
    translationCache.delete(translationCache.keys().next().value);
  }
};
const translationFetch = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
};

app.post('/api/translate', async (req, res) => {
  const { q, source, target } = req.body ?? {};
  if (!Array.isArray(q) || typeof source !== 'string' || typeof target !== 'string') {
    return res.status(400).json({ error: 'Expected { q: string[], source, target }' });
  }
  const strings = q.map((value) => String(value));
  if (!strings.length || source.toLowerCase() === target.toLowerCase()) return res.json({ translations: strings });
  const translations = new Array(strings.length);
  const missing = [];
  strings.forEach((text, index) => {
    const key = `${source}:${target}:${text}`;
    const cached = translationCacheGet(key);
    if (cached !== undefined) translations[index] = cached;
    else missing.push({ index, text, key });
  });
  if (missing.length) {
    const remaining = missing.map(({ text }) => text);
    try {
      const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(remaining.join('\n'))}`;
      const googleResponse = await translationFetch(googleUrl);
      if (!googleResponse.ok) throw new Error(`Google HTTP ${googleResponse.status}`);
      const data = await googleResponse.json();
      const joined = Array.isArray(data?.[0]) ? data[0].map((part) => part?.[0] ?? '').join('') : '';
      const googleTranslations = joined ? joined.split('\n') : [];
      if (googleTranslations.length !== remaining.length) throw new Error('Google returned an unexpected batch');
      missing.forEach(({ index, key }, i) => { translations[index] = googleTranslations[i] || strings[index]; translationCacheSet(key, translations[index]); });
    } catch (_) {
      try {
        const libreResponse = await translationFetch('https://libretranslate.com/translate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: remaining, source, target, format: 'text' })
        });
        if (!libreResponse.ok) throw new Error(`LibreTranslate HTTP ${libreResponse.status}`);
        const libreData = await libreResponse.json();
        const libreTranslations = Array.isArray(libreData) ? libreData : remaining.map((_, i) => libreData?.[i]?.translatedText);
        if (!libreTranslations || libreTranslations.length !== remaining.length) throw new Error('LibreTranslate returned an unexpected batch');
        missing.forEach(({ index, key }, i) => { translations[index] = libreTranslations[i]?.translatedText ?? libreTranslations[i] ?? strings[index]; translationCacheSet(key, translations[index]); });
      } catch (_) {
        missing.forEach(({ index, key }) => { translations[index] = strings[index]; translationCacheSet(key, strings[index]); });
      }
    }
  }
  return res.json({ translations });
});

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => console.log(`🐺 Wolfy server → http://localhost:${PORT}`));
