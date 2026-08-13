import { Game } from './Game.js';
import { CONFIG, PHASES } from './config.js';

export class GameManager {
  constructor(io) {
    this.io = io;
    this.games = new Map();     // code -> Game
    this.playerGame = new Map(); // playerId -> code
    setInterval(() => this.cleanup(), 30_000);
  }

  create(hostId, hostName, options) {
    const game = new Game(this.io, hostId, hostName, options);
    this.games.set(game.code, game);
    this.playerGame.set(hostId, game.code);
    return game;
  }

  join(code, playerId, name) {
    const game = this.games.get(code?.toUpperCase());
    if (!game) throw new Error('Partie introuvable');

    // Reconnexion
    const existing = game.getPlayer(playerId);
    if (existing) {
      existing.connected = true;
      existing.disconnectedAt = null;
    } else {
      game.addPlayer(playerId, name);
    }
    this.playerGame.set(playerId, game.code);
    return game;
  }

  lobbyStats() {
    const games = [...this.games.values()]
      .filter(g => g.phase === PHASES.LOBBY && g.options?.public !== false)
      .map(g => ({ code: g.code, name: g.options?.name || `Partie ${g.code}`, host: g.allPlayers().find(p => p.id === g.hostId)?.name || 'Inconnu', players: g.players.size, maxPlayers: CONFIG.MAX_PLAYERS, phase: g.phase, password: Boolean(g.options?.password || g.options?.hasPassword) }));
    return { onlinePlayers: this.io?.sockets?.sockets?.size ?? 0, games };
  }

  get(code) { return this.games.get(code?.toUpperCase()); }
  gameOf(playerId) { return this.games.get(this.playerGame.get(playerId)); }

  leave(playerId) {
    const game = this.gameOf(playerId);
    if (!game) return;
    game.removePlayer(playerId);
    if (game.phase === PHASES.LOBBY) this.playerGame.delete(playerId);
    game.pushState();
  }

  cleanup() {
    const now = Date.now();
    for (const [code, game] of this.games) {
      const active = game.allPlayers().filter(p => p.connected).length;
      const stale = game.phase === PHASES.ENDED || active === 0;
      if (stale && now - (game.lastEmpty ??= now) > CONFIG.EMPTY_GAME_TTL) {
        clearTimeout(game.timer);
        game.allPlayers().forEach(p => this.playerGame.delete(p.id));
        this.games.delete(code);
      }
      if (active > 0) game.lastEmpty = null;
    }
  }
}
