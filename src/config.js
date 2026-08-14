// =============================================================================
// src/config.js — Configuration globale + normalisation des pseudonymes
// =============================================================================

/**
 * Table d'homoglyphes : caractères visuellement identiques à des lettres
 * latines, utilisés dans les attaques IDN / usurpation d'identité.
 * Exemple : "аdmin" avec un а cyrillique (U+0430) ressemble à "admin".
 */
const HOMOGLYPHS = new Map(Object.entries({
  // --- Cyrillique ---
  'а': 'a', 'А': 'a', 'ᴀ': 'a',
  'в': 'b', 'В': 'b', 'Ь': 'b', 'ь': 'b', 'Б': 'b',
  'с': 'c', 'С': 'c', 'ϲ': 'c', 'ς': 'c',
  'ԁ': 'd', 'Ԁ': 'd',
  'е': 'e', 'Е': 'e', 'ё': 'e', 'Ё': 'e', 'є': 'e', 'Є': 'e', 'ҽ': 'e',
  'ғ': 'f', 'Ғ': 'f',
  'ԍ': 'g', 'ɡ': 'g',
  'н': 'h', 'Н': 'h', 'һ': 'h', 'Һ': 'h',
  'і': 'i', 'І': 'i', 'ї': 'i', 'Ї': 'i', 'ı': 'i', 'ɪ': 'i',
  'ј': 'j', 'Ј': 'j',
  'к': 'k', 'К': 'k',
  'ӏ': 'l', 'Ӏ': 'l', 'ⅼ': 'l',
  'м': 'm', 'М': 'm',
  'н̈': 'n', 'ո': 'n', 'ռ': 'n',
  'о': 'o', 'О': 'o', 'ө': 'o', 'Ө': 'o', 'ᴏ': 'o', 'ο': 'o', 'Ο': 'o',
  'р': 'p', 'Р': 'p', 'ρ': 'p', 'Ρ': 'p',
  'ԛ': 'q',
  'г': 'r', 'Г': 'r', 'ʀ': 'r',
  'ѕ': 's', 'Ѕ': 's', 'ș': 's',
  'т': 't', 'Т': 't', 'τ': 't',
  'υ': 'u', 'ս': 'u', 'ᴜ': 'u',
  'ѵ': 'v', 'Ѵ': 'v', 'ν': 'v',
  'ԝ': 'w', 'ᴡ': 'w', 'ω': 'w',
  'х': 'x', 'Х': 'x', 'χ': 'x',
  'у': 'y', 'У': 'y', 'ү': 'y', 'Ү': 'y', 'γ': 'y',
  'ᴢ': 'z', 'ζ': 'z',

  // --- Grec ---
  'α': 'a', 'Α': 'a', 'Β': 'b', 'β': 'b', 'Ε': 'e', 'ε': 'e',
  'Η': 'h', 'η': 'n', 'Ι': 'i', 'ι': 'i', 'Κ': 'k', 'κ': 'k',
  'Μ': 'm', 'µ': 'u', 'Ν': 'n', 'Τ': 't', 'Χ': 'x', 'Υ': 'y',
  'σ': 'o', 'Ζ': 'z',

  // --- Ponctuation / séparateurs exotiques ---
  '․': '.', '‧': '.', '。': '.', '｡': '.',
  '－': '-', '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-',
  '＿': '_', '﹍': '_',
  '＠': '@', '﹫': '@',
  '／': '/', '∕': '/', '⁄': '/',
  '：': ':', '˸': ':',
}));

/** Substitutions "leetspeak" : 4dm1n → admin, $upp0rt → support */
const LEET = new Map(Object.entries({
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a',
  '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b',
  '9': 'g', '6': 'g', '2': 'z', '£': 'e', '€': 'e', '¡': 'i',
}));

/** Caractères invisibles / de contrôle interdits dans un pseudo. */
export const INVISIBLE_RE =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFC]/gu;

/**
 * Normalisation d'affichage.
 * NFKC + suppression des caractères invisibles + espaces compactés.
 * C'est cette valeur qui est stockée et affichée aux joueurs.
 */
export function normalizeNickname(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE_RE, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Forme canonique agressive, utilisée UNIQUEMENT pour la comparaison
 * avec les listes noires et pour la détection de doublons.
 *
 * Pipeline : NFKC → invisibles → minuscules → homoglyphes → NFD (retrait des
 * accents) → leetspeak → suppression des non-alphanumériques.
 *
 *   "Âd-m1n"     → "admin"
 *   "аdmin"      → "admin"   (cyrillique)
 *   "_ADMIN_"    → "admin"
 *   "4dm!n"      → "admin"
 */
export function canonicalizeNickname(value) {
  let s = String(value ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE_RE, '')
    .toLowerCase();

  s = [...s].map(ch => HOMOGLYPHS.get(ch) ?? ch).join('');

  // Retrait des diacritiques : é → e, ñ → n
  s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');

  s = [...s].map(ch => LEET.get(ch) ?? ch).join('');

  // On ne garde que [a-z0-9]
  return s.replace(/[^a-z0-9]/g, '');
}

/**
 * Réduit les répétitions de caractères : "aaadmiiin" → "admin".
 * Appliqué après canonicalizeNickname().
 */
export function squashRepeats(value) {
  return String(value ?? '').replace(/(.)\1+/g, '$1');
}

// -----------------------------------------------------------------------------
// Configuration du jeu
// -----------------------------------------------------------------------------

export const CONFIG = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 20,
  CODE_LENGTH: 10,

  // Contraintes de pseudonyme
  NICKNAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 20,
    /** Nombre minimum de caractères alphanumériques après canonicalisation. */
    MIN_ALNUM: 2,
  },

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
