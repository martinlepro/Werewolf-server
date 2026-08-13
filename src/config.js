export function normalizeNickname(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

export const CONFIG = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 20,
  CODE_LENGTH: 10,

  // Durées en secondes
  DURATIONS: {
    LOBBY_COUNTDOWN: 5,
    ROLE_REVEAL: 8,
    NIGHT_ACTION: 30,
    DAY_DISCUSSION: 180,
    MAYOR_ELECTION: 60,
    DAY_VOTE: 60,
    HUNTER_SHOT: 20,
    DEATH_ANNOUNCE: 6,
  },

  // Le mentaliste voit le résultat du vote X sec avant la fin
  MENTALIST_PEEK_BEFORE_END: 30,

  // Nettoyage des parties vides (ms)
  EMPTY_GAME_TTL: 60_000,
  RECONNECT_GRACE: 90_000,
};

export const PHASES = {
  LOBBY: 'LOBBY',
  ROLE_REVEAL: 'ROLE_REVEAL',
  NIGHT: 'NIGHT',
  DAY_ANNOUNCE: 'DAY_ANNOUNCE',
  MAYOR_ELECTION: 'MAYOR_ELECTION',
  DAY_DISCUSSION: 'DAY_DISCUSSION',
  DAY_VOTE: 'DAY_VOTE',
  HUNTER_SHOT: 'HUNTER_SHOT',
  ENDED: 'ENDED',
};

export const TEAMS = {
  VILLAGE: 'VILLAGE',
  WOLVES: 'WOLVES',
  SOLO: 'SOLO',
};
