import { customAlphabet } from 'nanoid';
import { CONFIG, PHASES, TEAMS, normalizeNickname } from './config.js';
import { ROLES, getRole, defaultComposition } from './roles.js';
import { resolveNight } from './nightResolver.js';
import { checkWin } from './winConditions.js';
import { CONFIG, PHASES, canonicalizeNickname } from './config.js';
import { assertValidNickname } from './nicknameGuard.js';
import { getRole } from './roles.js';

const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CONFIG.CODE_LENGTH);

export class Game {
  constructor(io, hostId, hostName, options = {}) {
    this.io = io;
    this.code = genCode();
    this.hostId = hostId;
    this.phase = PHASES.LOBBY;
    this.players = new Map();   // playerId -> player object
    this.dayNumber = 0;
    this.nightNumber = 0;
    this.lovers = [];
    this.mayorId = null;
    this.nightActions = {};
    this.votes = new Map();     // voterId -> targetId
    this.roleUses = {};
    this.deadThisNight = [];
    this.timer = null;
    this.phaseEndsAt = null;
    this.options = { customComposition: null, ...options };
    this.log = [];

    this.addPlayer(hostId, hostName);
  }

  // ---------- Joueurs ----------
  addPlayer(id, name) {
    if (this.phase !== PHASES.LOBBY) throw new Error('Partie déjà commencée');
    if (this.players.size >= CONFIG.MAX_PLAYERS) throw new Error('Partie pleine');

    const normalizedName = normalizeNickname(name);
    if (normalizedName.length < 2) throw new Error('Le pseudo doit contenir au moins 2 caractères');
    const nameKey = normalizedName.toLocaleLowerCase();
    if (this.allPlayers().some(p => normalizeNickname(p.name).toLocaleLowerCase() === nameKey)) {
      throw new Error('Ce pseudo est déjà utilisé dans cette partie');
    }

    this.players.set(id, {
      id, name: normalizedName,
      role: null,
      alive: true,
      connected: true,
      isMayor: false,
      infected: false,
      lastGuarded: null,
      disconnectedAt: null,
    });
  }

  removePlayer(id) {
    if (this.phase === PHASES.LOBBY) {
      this.players.delete(id);
      if (id === this.hostId) {
        this.hostId = this.players.keys().next().value ?? null;
      }
    } else {
      const p = this.players.get(id);
      if (p) { p.connected = false; p.disconnectedAt = Date.now(); }
    }
  }

  getPlayer(id) { return this.players.get(id); }
  allPlayers() { return [...this.players.values()]; }
  alivePlayers() { return this.allPlayers().filter(p => p.alive); }
  playersByRole(roleId) { return this.allPlayers().filter(p => p.role === roleId); }
  wolves() { return this.alivePlayers().filter(p => getRole(p.role).isWolf); }

  // ---------- Démarrage ----------
  start() {
    if (this.players.size < CONFIG.MIN_PLAYERS) {
      throw new Error(`Il faut au moins ${CONFIG.MIN_PLAYERS} joueurs`);
    }
    const comp = this.options.customComposition
      ?? defaultComposition(this.players.size);

    const shuffled = [...comp].sort(() => Math.random() - 0.5);
    [...this.players.values()].forEach((p, i) => {
      p.role = shuffled[i];
      const def = getRole(p.role);
      if (def.usesLeft) this.roleUses[p.role] = { ...def.usesLeft };
    });

    // Cible du mercenaire
    const merc = this.playersByRole('MERCENARY')[0];
    if (merc) {
      const candidates = this.alivePlayers().filter(p => p.id !== merc.id);
      this.mercTarget = candidates[Math.floor(Math.random() * candidates.length)].id;
    }

    this.setPhase(PHASES.ROLE_REVEAL, CONFIG.DURATIONS.ROLE_REVEAL, () => this.startNight());
  }

  // ---------- Cycle ----------
  startNight() {
    this.nightNumber++;
    this.nightActions = {};
    this.deadThisNight = [];
    this.setPhase(PHASES.NIGHT, CONFIG.DURATIONS.NIGHT_ACTION, () => this.endNight());
  }

  endNight() {
  try {
    const result = resolveNight(this) ?? {};

    const deaths = Array.isArray(result.deaths)
      ? result.deaths
      : [];

    const reveals =
      result.reveals &&
      typeof result.reveals === 'object'
        ? result.reveals
        : {};

    // Révélations privées
    for (const [pid, payload] of Object.entries(reveals)) {
      this.io.to(`p:${pid}`).emit('privateReveal', payload);
    }

    // Applique les morts de la nuit
    for (const death of deaths) {
      if (!death?.id) continue;

      this.kill(
        death.id,
        death.cause ?? 'NIGHT'
      );
    }

    this.deadThisNight = deaths;

    // Vérifie la victoire
    const win = checkWin(this);

    if (win?.over) {
      return this.end(win);
    }

    // Vérifie si le chasseur est mort cette nuit
    const hunterDead = deaths.find((death) => {
      if (!death?.id) return false;

      const player = this.getPlayer(death.id);

      return player?.role === 'HUNTER';
    });

    if (hunterDead) {
      this.pendingHunter = hunterDead.id;

      return this.setPhase(
        PHASES.HUNTER_SHOT,
        CONFIG.DURATIONS.HUNTER_SHOT,
        () => this.afterHunter()
      );
    }

    return this.startDay();
  } catch (error) {
    console.error(
      `[Game ${this.code}] Erreur dans endNight :`,
      error
    );

    // Évite que le processus Node.js plante complètement
    this.deadThisNight = [];

    return this.startDay();
  }
  }

  startDay() {
    this.dayNumber++;
    this.setPhase(PHASES.DAY_ANNOUNCE, CONFIG.DURATIONS.DEATH_ANNOUNCE, () => {
      if (this.dayNumber === 1 && !this.mayorId) {
        this.setPhase(PHASES.MAYOR_ELECTION, CONFIG.DURATIONS.MAYOR_ELECTION,
                      () => this.resolveMayor());
        this.votes.clear();
      } else {
        this.startDiscussion();
      }
    });
  }

  startDiscussion() {
    this.setPhase(PHASES.DAY_DISCUSSION, CONFIG.DURATIONS.DAY_DISCUSSION,
                  () => this.startVote());
  }

  startVote() {
    this.votes.clear();
    this.mentalistWarned = false;
    this.setPhase(PHASES.DAY_VOTE, CONFIG.DURATIONS.DAY_VOTE, () => this.resolveVote());
  }

  resolveMayor() {
    const winner = this.tally(this.votes);
    if (winner) {
      this.mayorId = winner;
      this.getPlayer(winner).isMayor = true;
      this.broadcast('mayorElected', { playerId: winner });
    }
    this.votes.clear();
    this.startDiscussion();
  }

  resolveVote() {
    const target = this.tally(this.votes, this.mayorId);
    this.votes.clear();

    if (!target) {
      this.broadcast('voteResult', { eliminated: null });
      return this.startNight();
    }

    // Mercenaire : victoire immédiate si sa cible tombe au jour 1
    if (this.dayNumber === 1 && target === this.mercTarget) {
      const merc = this.playersByRole('MERCENARY')[0];
      if (merc?.alive) {
        return this.end({ over: true, winner: TEAMS.SOLO, winnerIds: [merc.id],
                          reason: 'Le Mercenaire a éliminé sa cible.' });
      }
    }

    this.kill(target, 'VOTE');
    this.broadcast('voteResult', { eliminated: target, role: this.getPlayer(target).role });

    const win = checkWin(this);
    if (win.over) return this.end(win);

    if (this.getPlayer(target).role === 'HUNTER') {
      this.pendingHunter = target;
      return this.setPhase(PHASES.HUNTER_SHOT, CONFIG.DURATIONS.HUNTER_SHOT,
                           () => this.afterHunter());
    }

    this.startNight();
  }

  afterHunter() {
    this.pendingHunter = null;
    const win = checkWin(this);
    if (win.over) return this.end(win);
    this.phase === PHASES.NIGHT ? this.startDay() : this.startNight();
  }

  /** Comptage des voix. Le maire tranche les égalités. */
  tally(votes, tieBreakerId = null) {
    const counts = new Map();
    for (const target of votes.values()) {
      if (!target) continue;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    if (counts.size === 0) return null;

    const max = Math.max(...counts.values());
    const tied = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);

    if (tied.length === 1) return tied[0];
    if (tieBreakerId && votes.has(tieBreakerId) && tied.includes(votes.get(tieBreakerId))) {
      return votes.get(tieBreakerId);
    }
    return null; // égalité non tranchée
  }

  // ---------- Morts ----------
  kill(playerId, cause) {
    const p = this.getPlayer(playerId);
    if (!p || !p.alive) return;
    p.alive = false;
    this.log.push({ type: 'DEATH', playerId, cause, day: this.dayNumber });

    if (p.isMayor) {
      p.isMayor = false;
      this.mayorId = null;
    }

    // Chagrin d'amour
    if (this.lovers.includes(playerId)) {
      const other = this.lovers.find(id => id !== playerId);
      const lover = this.getPlayer(other);
      if (lover?.alive) this.kill(other, 'HEARTBREAK');
    }
  }

  // ---------- Phases ----------
  setPhase(phase, durationSec, onEnd) {
    clearTimeout(this.timer);
    this.phase = phase;
    this.phaseEndsAt = Date.now() + durationSec * 1000;
    this.pushState();

    // Alerte mentaliste avant la fin du vote
    if (phase === PHASES.DAY_VOTE) {
      const delay = (durationSec - CONFIG.MENTALIST_PEEK_BEFORE_END) * 1000;
      if (delay > 0) {
        setTimeout(() => {
          const m = this.playersByRole('MENTALIST').find(p => p.alive);
          if (m && this.phase === PHASES.DAY_VOTE) {
            this.io.to(`p:${m.id}`).emit('privateReveal', {
              type: 'MENTALIST_PEEK',
              projectedTarget: this.tally(this.votes, this.mayorId),
            });
          }
        }, delay);
      }
    }

    if (onEnd) this.timer = setTimeout(onEnd, durationSec * 1000);
  }

  skipPhase() {
    // Utilisé quand tous les joueurs ont agi
    clearTimeout(this.timer);
    const map = {
      [PHASES.NIGHT]: () => this.endNight(),
      [PHASES.DAY_VOTE]: () => this.resolveVote(),
      [PHASES.MAYOR_ELECTION]: () => this.resolveMayor(),
      [PHASES.HUNTER_SHOT]: () => this.afterHunter(),
    };
    map[this.phase]?.();
  }

  end(win) {
    clearTimeout(this.timer);
    this.phase = PHASES.ENDED;
    this.result = win;
    this.broadcast('gameEnded', {
      winner: win.winner,
      winnerIds: win.winnerIds ?? null,
      reason: win.reason,
      roles: this.allPlayers().map(p => ({
        id: p.id, name: p.name, role: p.role, roleName: getRole(p.role).name,
      })),
    });
  }

  // ---------- Sérialisation ----------
  /** État PUBLIC — visible par tous, ne contient AUCUN rôle caché */
  publicState() {
    return {
      code: this.code,
      phase: this.phase,
      minPlayers: CONFIG.MIN_PLAYERS,
      dayNumber: this.dayNumber,
      nightNumber: this.nightNumber,
      phaseEndsAt: this.phaseEndsAt,
      hostId: this.hostId,
      mayorId: this.mayorId,
      players: this.allPlayers().map(p => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        isMayor: p.isMayor,
        // Le rôle n'est révélé QUE si le joueur est mort
        role: p.alive ? null : p.role,
      })),
      deadThisNight: this.deadThisNight.map(d => d.id),
      voteCount: this.phase === PHASES.DAY_VOTE ? this.votes.size : null,
    };
  }

  /** État PRIVÉ — spécifique à un joueur */
  privateState(playerId) {
    const p = this.getPlayer(playerId);
    if (!p || !p.role) return {};
    const def = getRole(p.role);

    const state = {
      role: p.role,
      roleName: def.name,
      roleDescription: def.description,
      roleGoal: def.goal,
      team: def.team,
      usesLeft: this.roleUses[p.role] ?? null,
    };

    // Les loups se connaissent entre eux
    if (def.isWolf) {
      state.wolfPack = this.allPlayers()
        .filter(x => getRole(x.role).isWolf && x.id !== playerId)
        .map(x => ({ id: x.id, name: x.name, role: x.role, alive: x.alive }));
    }

    // Amoureux
    if (this.lovers.includes(playerId)) {
      state.loverId = this.lovers.find(id => id !== playerId);
    }

    // Cible du mercenaire
    if (p.role === 'MERCENARY') state.mercTarget = this.mercTarget;

    return state;
  }

  pushState() {
    const pub = this.publicState();
    for (const p of this.players.values()) {
      this.io.to(`p:${p.id}`).emit('gameState', {
        ...pub,
        you: { id: p.id, alive: p.alive, ...this.privateState(p.id) },
      });
    }
  }

  broadcast(event, payload) {
    this.io.to(`g:${this.code}`).emit(event, payload);
  }
}
