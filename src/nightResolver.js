import { TEAMS } from './config.js';

/**
 * Résout toutes les actions de la nuit dans le bon ordre.
 * @param {Game} g - instance de partie
 * @returns {{deaths: Array, infos: Object}} morts + infos privées à envoyer
 */
export function resolveNight(g) {
  const A = g.nightActions;          // { playerId: {type, targetId, ...} }
  const deaths = [];                 // [{playerId, cause}]
  const infos = {};                  // { playerId: {...} }

  const alive = (id) => g.players.get(id)?.alive;
  const roleOf = (id) => g.players.get(id)?.role;

  // ---------- 1. CUPIDON (nuit 1) ----------
  if (g.night === 1) {
    const cupid = [...g.players.values()].find(p => p.role === 'CUPID' && p.alive);
    if (cupid && A[cupid.id]?.targets?.length === 2) {
      const [a, b] = A[cupid.id].targets;
      g.lovers = [a, b];
      g.players.get(a).isLover = true;
      g.players.get(b).isLover = true;
      infos[a] = { ...(infos[a] || {}), lover: b };
      infos[b] = { ...(infos[b] || {}), lover: a };
    }
  }

  // ---------- 2. GARDE ----------
  let protectedId = null;
  const guard = [...g.players.values()].find(p => p.role === 'GUARD' && p.alive);
  if (guard && A[guard.id]?.targetId) {
    const t = A[guard.id].targetId;
    if (t !== g.lastProtected) {
      protectedId = t;
      g.lastProtected = t;
    }
  }

  // ---------- 3. VOYANTE ----------
  const seer = [...g.players.values()].find(p => p.role === 'SEER' && p.alive);
  if (seer && A[seer.id]?.targetId) {
    const t = A[seer.id].targetId;
    infos[seer.id] = { ...(infos[seer.id] || {}), seen: { playerId: t, role: roleOf(t) } };
  }

  // ---------- 4. LOUPS-GAROUS ----------
  const wolfVotes = {};
  for (const [pid, act] of Object.entries(A)) {
    if (act.type !== 'WOLF_VOTE') continue;
    if (!alive(pid)) continue;
    wolfVotes[act.targetId] = (wolfVotes[act.targetId] || 0) + 1;
  }
  let wolfVictim = null;
  const maxVotes = Math.max(0, ...Object.values(wolfVotes));
  if (maxVotes > 0) {
    const tied = Object.keys(wolfVotes).filter(id => wolfVotes[id] === maxVotes);
    wolfVictim = tied[Math.floor(Math.random() * tied.length)];
  }

  // Chaperon Rouge : protégée tant que le Chasseur est vivant
  if (wolfVictim && roleOf(wolfVictim) === 'RED_RIDING_HOOD') {
    const hunterAlive = [...g.players.values()].some(p => p.role === 'HUNTER' && p.alive);
    if (hunterAlive) wolfVictim = null;
  }

  if (wolfVictim && wolfVictim === protectedId) wolfVictim = null;

  // ---------- 5. LOUP NOIR (infection) ----------
  const blackWolf = [...g.players.values()].find(p => p.role === 'BLACK_WOLF' && p.alive);
  let infected = false;
  if (blackWolf && A[blackWolf.id]?.infect && wolfVictim && !g.blackWolfUsed) {
    g.blackWolfUsed = true;
    infected = true;
    const v = g.players.get(wolfVictim);
    v.team = TEAMS.WOLVES;
    v.infected = true;
    infos[wolfVictim] = { ...(infos[wolfVictim] || {}), infectedNow: true };
    wolfVictim = null;
  }

  // ---------- 6. SORCIÈRE ----------
  const witch = [...g.players.values()].find(p => p.role === 'WITCH' && p.alive);
  if (witch) {
    const act = A[witch.id] || {};
    if (act.heal && wolfVictim && g.witchHeal > 0) {
      g.witchHeal--;
      wolfVictim = null;
    }
    if (act.poisonTargetId && g.witchPoison > 0) {
      g.witchPoison--;
      deaths.push({ playerId: act.poisonTargetId, cause: 'POISON' });
    }
  }

  if (wolfVictim) deaths.push({ playerId: wolfVictim, cause: 'WOLVES' });

  // ---------- 7. AMOUREUX (chagrin d'amour) ----------
  const expand = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of [...deaths]) {
        if (!g.lovers.includes(d.playerId)) continue;
        const other = g.lovers.find(id => id !== d.playerId);
        if (other && alive(other) && !deaths.some(x => x.playerId === other)) {
          deaths.push({ playerId: other, cause: 'LOVE' });
          changed = true;
        }
      }
    }
  };
  expand();

  // ---------- Application ----------
  for (const d of deaths) {
    const p = g.players.get(d.playerId);
    if (p) { p.alive = false; p.deathCause = d.cause; }
  }

  g.nightActions = {};
  return { deaths, infos, infected };
}
