// =============================================================================
// src/nicknameGuard.js — Blocage des pseudonymes interdits
// =============================================================================
import {
  CONFIG,
  INVISIBLE_RE,
  normalizeNickname,
  canonicalizeNickname,
  squashRepeats,
} from './config.js';

// -----------------------------------------------------------------------------
// 1. Identifiants système et techniques
// -----------------------------------------------------------------------------
const SYSTEM_NAMES = [
  'admin', 'admins', 'administrator', 'administrateur', 'administration',
  'root', 'superuser', 'sysadmin', 'sysop', 'operator', 'op',
  'guest', 'invite', 'anonymous', 'anonyme', 'user', 'users', 'utilisateur',
  'system', 'systeme', 'daemon', 'bin', 'sys', 'nobody', 'www', 'wwwdata',
  'localhost', '127001', '0000', 'broadcasthost', 'gateway', 'router',
  'master', 'slave',
  'test', 'tests', 'testing', 'demo', 'beta', 'alpha', 'staging', 'sandbox',
  'null', 'undefined', 'nan', 'nil', 'void', 'none', 'empty',
];

// -----------------------------------------------------------------------------
// 2. Personnel et support (risque d'hameçonnage)
// -----------------------------------------------------------------------------
const STAFF_NAMES = [
  'support', 'help', 'helpdesk', 'aide', 'assistance', 'sav',
  'moderator', 'moderators', 'mod', 'mods', 'moderateur', 'moderateurs',
  'moderation', 'modo', 'modos',
  'staff', 'team', 'equipe', 'crew', 'officiel', 'official', 'verified',
  'contact', 'info', 'infos', 'feedback', 'noreply', 'mailerdaemon',
  'webmaster', 'postmaster', 'hostmaster', 'listmaster',
  'billing', 'facturation', 'sales', 'vente', 'ventes', 'payment', 'paiement',
  'security', 'securite', 'abuse', 'privacy', 'confidentialite', 'rgpd',
  'bot', 'server', 'serveur', 'systemmessage', 'gamemaster', 'mj',
  'wolfy', 'werewolf', 'loupgarou',
];

// -----------------------------------------------------------------------------
// 3. Routes applicatives et mots réservés
// -----------------------------------------------------------------------------
const ROUTE_NAMES = [
  'login', 'logout', 'signin', 'signout', 'connexion', 'deconnexion',
  'register', 'signup', 'inscription', 'join', 'auth', 'oauth', 'sso', 'token',
  'api', 'v1', 'v2', 'v3', 'graphql', 'rest', 'rpc', 'ws', 'wss',
  'socket', 'socketio', 'sse', 'webhook', 'webhooks', 'callback',
  'home', 'index', 'dashboard', 'panel', 'profile', 'profil',
  'account', 'accounts', 'compte', 'comptes',
  'settings', 'config', 'configuration', 'preferences', 'options', 'parametres',
  'download', 'downloads', 'upload', 'uploads', 'media', 'files',
  'static', 'assets', 'images', 'img', 'css', 'js', 'fonts', 'public',
  'search', 'find', 'explore', 'tags', 'tag', 'discover',
  'blog', 'news', 'press', 'about', 'apropos', 'faq', 'legal',
  'terms', 'cgu', 'cgv', 'mentionslegales', 'cookies',
  'status', 'health', 'healthz', 'metrics', 'ping', 'debug', 'trace',
  'lobby', 'game', 'games', 'partie', 'parties', 'room', 'rooms',
];

// -----------------------------------------------------------------------------
// 4. Termes SQL / injections
// -----------------------------------------------------------------------------
const INJECTION_WORDS = [
  'select', 'insert', 'update', 'delete', 'drop', 'truncate', 'alter',
  'union', 'where', 'having', 'exec', 'execute', 'declare', 'sleep',
  'benchmark', 'waitfor', 'xpath', 'information_schema', 'sysobjects',
  'script', 'javascript', 'vbscript', 'onerror', 'onload', 'onclick',
  'iframe', 'srcdoc', 'eval', 'alert', 'prompt', 'document', 'cookie',
];

/** Motifs bruts testés sur la chaîne AVANT canonicalisation. */
const INJECTION_PATTERNS = [
  /<[^>]*>/,                                  // balises HTML
  /<\s*\/?\s*(script|iframe|img|svg|body|a)\b/i,
  /(javascript|vbscript|data)\s*:/i,          // schémas dangereux
  /\bon[a-z]{3,20}\s*=/i,                     // onerror=, onload=
  /&#x?[0-9a-f]{2,6};?/i,                     // entités HTML numériques
  /%[0-9a-f]{2}/i,                            // URL-encoding
  /\\u[0-9a-f]{4}/i,                          // échappement unicode
  /(\bor\b|\band\b)\s+['"`]?\d+['"`]?\s*=\s*['"`]?\d+/i, // OR 1=1
  /(--|#|\/\*|\*\/)/,                         // commentaires SQL
  /;\s*(drop|delete|insert|update|select)\b/i,
  /\b(union\s+(all\s+)?select)\b/i,
  /[{}$]\s*\{/,                               // template injection ${}
  /\$\w+\s*:/,                                // opérateurs NoSQL ($where:)
  /\.\.[\/\\]/,                               // path traversal
  /[\/\\]{2,}/,                               // // ou \\
];

// -----------------------------------------------------------------------------
// Construction des index
// -----------------------------------------------------------------------------

/** Correspondance EXACTE uniquement (mots courts ou trop génériques). */
const EXACT_ONLY = new Set();

/** Correspondance par SOUS-CHAÎNE (mots longs et sans ambiguïté). */
const SUBSTRING_MATCH = new Set();

/**
 * Mots génériques susceptibles de générer des faux positifs
 * (« Steamy » contient « team »). On les teste en exact uniquement.
 */
const GENERIC_WORDS = new Set([
  'team', 'main', 'info', 'infos', 'join', 'news', 'find', 'tag', 'tags',
  'home', 'user', 'users', 'game', 'games', 'room', 'rooms', 'help', 'aide',
  'mod', 'mods', 'op', 'bin', 'sys', 'www', 'js', 'css', 'img', 'ws',
  'test', 'demo', 'beta', 'alpha', 'null', 'none', 'void', 'nil', 'nan',
  'about', 'legal', 'terms', 'press', 'blog', 'media', 'files', 'public',
  'ping', 'status', 'health', 'search', 'explore', 'discover', 'options',
  'sav', 'mj', 'crew', 'bot', 'op', 'sso', 'rest', 'rpc', 'v1', 'v2', 'v3',
]);

function indexWord(raw) {
  const key = canonicalizeNickname(raw);
  if (!key) return;
  if (GENERIC_WORDS.has(key) || key.length < 5) {
    EXACT_ONLY.add(key);
  } else {
    SUBSTRING_MATCH.add(key);
  }
}

[
  ...SYSTEM_NAMES,
  ...STAFF_NAMES,
  ...ROUTE_NAMES,
  ...INJECTION_WORDS,
].forEach(indexWord);

// -----------------------------------------------------------------------------
// 5. Grossièretés (alimentées par profanityLoader.js)
// -----------------------------------------------------------------------------

/** Grossièretés en correspondance exacte (mots courts, risque de faux positif). */
const PROFANITY_EXACT = new Set();
/** Grossièretés en correspondance par sous-chaîne (mots ≥ 5 caractères). */
const PROFANITY_SUBSTRING = new Set();

/**
 * Enregistre une liste de mots grossiers dans l'index.
 * Appelée par `loadProfanities()` (src/profanityLoader.js).
 * @param {Iterable<string>} words
 * @returns {number} nombre de mots effectivement ajoutés
 */
export function registerProfanities(words) {
  let added = 0;
  for (const word of words ?? []) {
    const key = canonicalizeNickname(word);
    if (!key || key.length < 3) continue;
    const target = key.length >= 5 ? PROFANITY_SUBSTRING : PROFANITY_EXACT;
    if (!target.has(key)) { target.add(key); added++; }
  }
  return added;
}

/** Retire un mot de l'index (utile pour corriger un faux positif). */
export function unregisterProfanity(word) {
  const key = canonicalizeNickname(word);
  PROFANITY_EXACT.delete(key);
  PROFANITY_SUBSTRING.delete(key);
}

/** Statistiques de l'index (diagnostic / logs de démarrage). */
export function guardStats() {
  return {
    reservedExact: EXACT_ONLY.size,
    reservedSubstring: SUBSTRING_MATCH.size,
    profanityExact: PROFANITY_EXACT.size,
    profanitySubstring: PROFANITY_SUBSTRING.size,
  };
}

// -----------------------------------------------------------------------------
// Détection de scripts mixés (attaque IDN)
// -----------------------------------------------------------------------------

const SCRIPT_TESTS = [
  ['latin',    /\p{Script=Latin}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['greek',    /\p{Script=Greek}/u],
  ['arabic',   /\p{Script=Arabic}/u],
  ['hebrew',   /\p{Script=Hebrew}/u],
  ['han',      /\p{Script=Han}/u],
  ['hiragana', /\p{Script=Hiragana}/u],
  ['katakana', /\p{Script=Katakana}/u],
  ['hangul',   /\p{Script=Hangul}/u],
];

/**
 * Un pseudo mélangeant plusieurs alphabets est presque toujours
 * une tentative d'usurpation ("аdmin" latin + cyrillique).
 * Exception tolérée : japonais (Han + Hiragana + Katakana).
 */
function detectMixedScripts(value) {
  const found = SCRIPT_TESTS
    .filter(([, re]) => re.test(value))
    .map(([name]) => name);

  if (found.length <= 1) return null;

  const japanese = new Set(['han', 'hiragana', 'katakana']);
  if (found.every(s => japanese.has(s))) return null;

  return found;
}

// -----------------------------------------------------------------------------
// Validation principale
// -----------------------------------------------------------------------------

/**
 * Codes d'erreur possibles :
 *  EMPTY, TOO_SHORT, TOO_LONG, NOT_ENOUGH_ALNUM, INVISIBLE_CHARS,
 *  MIXED_SCRIPTS, INJECTION, RESERVED, PROFANITY
 */
export class NicknameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NicknameError';
    this.code = code;
  }
}

/**
 * Analyse un pseudo sans lever d'exception.
 * @param {string} raw
 * @returns {{ok:boolean, code?:string, message?:string, name?:string, key?:string}}
 */
export function inspectNickname(raw) {
  const original = String(raw ?? '');

  // -- a. Caractères invisibles bruts ---------------------------------------
  if (INVISIBLE_RE.test(original)) {
    INVISIBLE_RE.lastIndex = 0;
    return {
      ok: false,
      code: 'INVISIBLE_CHARS',
      message: 'Le pseudo contient des caractères invisibles interdits',
    };
  }
  INVISIBLE_RE.lastIndex = 0;

  // -- b. Injections (testées sur la chaîne brute) --------------------------
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(original)) {
      return {
        ok: false,
        code: 'INJECTION',
        message: 'Le pseudo contient des caractères ou motifs interdits',
      };
    }
  }

  // -- c. Normalisation d'affichage -----------------------------------------
  const name = normalizeNickname(original);
  const { MIN_LENGTH, MAX_LENGTH, MIN_ALNUM } = CONFIG.NICKNAME;

  if (!name) {
    return { ok: false, code: 'EMPTY', message: 'Le pseudo ne peut pas être vide' };
  }
  if (name.length < MIN_LENGTH) {
    return {
      ok: false,
      code: 'TOO_SHORT',
      message: `Le pseudo doit contenir au moins ${MIN_LENGTH} caractères`,
    };
  }
  if (name.length > MAX_LENGTH) {
    return {
      ok: false,
      code: 'TOO_LONG',
      message: `Le pseudo ne doit pas dépasser ${MAX_LENGTH} caractères`,
    };
  }

  // -- d. Scripts mixés ------------------------------------------------------
  if (detectMixedScripts(name)) {
    return {
      ok: false,
      code: 'MIXED_SCRIPTS',
      message: 'Le pseudo mélange plusieurs alphabets, ce qui est interdit',
    };
  }

  // -- e. Canonicalisation ---------------------------------------------------
  const key = canonicalizeNickname(name);

  if (key.length < MIN_ALNUM) {
    return {
      ok: false,
      code: 'NOT_ENOUGH_ALNUM',
      message: `Le pseudo doit contenir au moins ${MIN_ALNUM} lettres ou chiffres`,
    };
  }

  const squashed = squashRepeats(key);
  const variants = key === squashed ? [key] : [key, squashed];

  // -- f. Termes réservés ----------------------------------------------------
  for (const variant of variants) {
    if (EXACT_ONLY.has(variant)) {
      return {
        ok: false,
        code: 'RESERVED',
        message: 'Ce pseudo est réservé par le système',
      };
    }
    for (const word of SUBSTRING_MATCH) {
      if (variant.includes(word)) {
        return {
          ok: false,
          code: 'RESERVED',
          message: 'Ce pseudo est réservé par le système',
        };
      }
    }
  }

  // -- g. Grossièretés -------------------------------------------------------
  for (const variant of variants) {
    if (PROFANITY_EXACT.has(variant)) {
      return {
        ok: false,
        code: 'PROFANITY',
        message: 'Ce pseudo contient des termes interdits',
      };
    }
    for (const word of PROFANITY_SUBSTRING) {
      if (variant.includes(word)) {
        return {
          ok: false,
          code: 'PROFANITY',
          message: 'Ce pseudo contient des termes interdits',
        };
      }
    }
  }

  return { ok: true, name, key };
}

/**
 * Valide un pseudo et lève une `NicknameError` si invalide.
 * @param {string} raw
 * @returns {{name:string, key:string}} pseudo normalisé + clé canonique
 * @throws {NicknameError}
 */
export function assertValidNickname(raw) {
  const result = inspectNickname(raw);
  if (!result.ok) throw new NicknameError(result.code, result.message);
  return { name: result.name, key: result.key };
}

/** Raccourci booléen. */
export function isNicknameAllowed(raw) {
  return inspectNickname(raw).ok;
}

/**
 * Génère un pseudo de repli sûr (« Villageois 4821 »).
 * Utile quand un client envoie un nom invalide sur un flux non bloquant.
 */
export function fallbackNickname() {
  return `Villageois ${Math.floor(1000 + Math.random() * 9000)}`;
}
