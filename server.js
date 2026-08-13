import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { GameManager } from './src/GameManager.js';
import { registerHandlers } from './src/socketHandlers.js';

const app = express();
app.use(cors());
app.use(express.json());
// Landing page owns /; the original lobby remains available at /play.
app.get('/', (_, res) => res.sendFile('home.html', { root: 'public' }));
app.get('/play', (_, res) => res.sendFile('index.html', { root: 'public' }));
app.get('/play/:gameId', (_, res) => res.sendFile('index.html', { root: 'public' }));
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

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => console.log(`🐺 Wolfy server → http://localhost:${PORT}`));
