// src/nicknameGuard.js
// Validation des pseudonymes : anti-usurpation, anti-phishing, anti-injection.

// ---------------------------------------------------------------------------
// 1. Listes noires (exactes)
// ---------------------------------------------------------------------------

/** 1. Identifiants système et techniques */
const SYSTEM_NAMES = [
  'admin', 'admins', 'administrator', 'administrateur', 'administration',
  'root', 'superuser', 'super-user', 'sysadmin', 'sysop', 'operator',
  'guest', 'invite', 'anonymous', 'anonyme', 'user', 'users', 'utilisateur',
  'system', 'systeme', 'daemon', 'bin', 'sys', 'nobody', 'www', 'www-data',
  'localhost', '127.0.0.1', '0.0.0.0', '::1', 'broadcasthost',
  'master', 'slave', 'main',
  'test', 'tests', 'testing', 'demo', 'beta', 'alpha', 'staging', 'dev',
  'null', 'undefined', 'nan', 'none', 'nil', 'void', 'false', 'true',
];

/** 2. Personnel et support (risque d'hameçonnage) */
const STAFF_NAMES = [
  'support', 'help', 'helpdesk', 'aide', 'assistance',
  'moderator', 'moderators', 'mod', 'mods', 'moderateur', 'moderation',
  'staff', 'team', 'equipe', 'crew', 'officiel', 'official',
  'contact', 'info', 'infos', 'feedback', 'noreply', 'no-reply',
  'webmaster', 'postmaster', 'hostmaster', 'mailer-daemon',
  'billing', 'facturation', 'sales', 'vente', 'ventes', 'paiement', 'payment',
  'security', 'securite', 'abuse', 'privacy', 'confidentialite',
  'wolfy', 'loupgarou', 'loup-garou', 'werewolf', 'bot', 'server', 'serveur',
];

/** 3. Routes applicatives et mots réservés */
const ROUTE_NAMES = [
  'login', 'logout', 'signin', 'signout', 'connexion', 'deconnexion',
  'register', 'signup', 'inscription', 'join', 'auth', 'oauth', 'sso',
  'api', 'v1', 'v2', 'v3', 'graphql', 'rest', 'ws', 'socket', 'socket.io',
  'home', 'index', 'dashboard', 'panel', 'profile', 'profil', 'account', 'compte',
  'settings', 'config', 'configuration', 'preferences', 'options', 'parametres',
  'download', 'downloads', 'upload', 'uploads', 'media', 'static', 'assets',
  'images', 'img', 'css', 'js', 'fonts', 'public',
  'search', 'find', 'explore', 'tags', 'tag',
  'blog', 'news', 'press', 'about', 'faq', 'legal', 'terms', 'cgu', 'cgv',
  'status', 'health', 'healthz', 'metrics', 'debug',
  'game', 'games', 'lobby', 'partie', 'parties', 'shop', 'boutique',
  'leaderboard', 'classement', 'notifications',
];

/** 4a. Mots-clés SQL / scripting interdits (mot entier) */
const INJECTION_WORDS = [
  'select', 'insert', 'update', 'delete', 'drop', 'truncate', 'alter',
  'create', 'union', 'where', 'from', 'table', 'database', 'exec',
  'execute', 'declare', 'xp_cmdshell', 'sleep', 'benchmark',
  'script', 'javascript', 'vbscript', 'onerror', 'onload', 'iframe',
  'eval', 'alert', 'document', 'window', 'cookie', 'prototype', 'constructor',
  '__proto__',
];

/** 4b. Motifs d'attaque (recherchés n'importe où dans la chaîne) */
const INJECTION_PATTERNS = [
  /<[^>]*>/,                       // toute balise HTML
  /<\s*\/?\s*script/i,             // <script>, </script
  /javascript\s*:/i,               // javascript:
  /data\s*:/i,                     // data: URI
  /vbscript\s*:/i,
  /on[a-z]+\s*=/i,                 // onerror=, onclick=
  /&#x?[0-9a-f]+;?/i,              // entités HTML encodées
  /%[0-9a-f]{2}/i,                 // URL-encoding
  /\\u[0-9a-f]{4}/i,               // échappement unicode littéral
  /(^|[\s;])or\s+1\s*=\s*1/i,      // OR 1=1
  /(^|[\s;])and\s+1\s*=\s*1/i,
  /--\s|\/\*|\*\//,                // commentaires SQL
  /\bunion\b[\s\S]*\bselect\b/i,
  /['"`;]/,                         // quotes et point-virgule
  /[{}[\]<>$|\\^~]/,                // méta-caractères divers
  /\.\.\//,                         // path traversal
  /\0/,                             // NUL byte
];

// ---------------------------------------------------------------------------
// 5. Profanités (base FR/EN — à compléter par LDNOOBW, voir §6)
// ---------------------------------------------------------------------------
// En production : charger un JSON généré depuis
// https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
// et fusionner via `registerProfanities()`.
const PROFANITIES = new Set([
  // FR
  'connard', 'connasse', 'salope', 'salaud', 'enculé', 'encule', 'pute',
  'putain', 'batard', 'batarde', 'pd', 'pede', 'tapette', 'nique', 'niquer',
  'ntm', 'tarlouze', 'bouffon', 'negre', 'bougnoule', 'youpin', 'pedophile',
  'violeur', 'nazi', 'hitler',
  // EN
  'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'cunt', 'asshole', 'dick',
  'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'rape',
  'rapist', 'pedo', 'pedophile', 'kys',
]);

/** Permet d'injecter une liste externe (LDNOOBW, badwords…) au démarrage. */
export function registerProfanities(words = []) {
  for (const w of words) {
    const k = canonicalize(String(w));
    if (k) PROFANITIES.add(k);
  }
}

// ---------------------------------------------------------------------------
// Homoglyphes : cyrillique / grec / lookalikes → latin
// ---------------------------------------------------------------------------
const HOMOGLYPHS = {
  // Cyrillique
  'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'н': 'h', 'к': 'k', 'м': 'm',
  'о': 'o', 'р': 'p', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
  'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'ν': 'v', 'ѡ': 'w', ' z': 'z',
  // Grec
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'μ': 'm', 'ο': 'o',
  'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'γ': 'y', 'ζ': 'z', 'η': 'n',
  // Leetspeak / symboles
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't',
  '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'l', '+': 't',
  '£': 'l', '€': 'e', '¡': 'i',
};

/** Caractères invisibles / de contrôle / formatage à rejeter. */
const INVISIBLE_RE =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3000\uFE00-\uFE0F\uFEFF\uFFF9-\uFFFB]/u;

/** Espaces "exotiques" tolérés mais normalisés en espace simple. */
const EXOTIC_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u205F\u3000]/gu;

// ---------------------------------------------------------------------------
// Canonisation : NFKC → minuscules → sans accents → homoglyphes → alphanum
// ---------------------------------------------------------------------------
export function canonicalize(value) {
  let s = String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, ''); // Âdmin → admin

  s = [...s].map((ch) => HOMOGLYPHS[ch] ?? ch).join('');

  // Supprime tout ce qui n'est pas [a-z0-9] pour neutraliser a-d-m-i-n, a.d.m.i.n…
  return s.replace(/[^a-z0-9]+/gu, '');
}

/** Réduit les répétitions : aaadmiiin → admin */
const squash = (s) => s.replace(/(.)\1{1,}/gu, '$1');

// ---------------------------------------------------------------------------
// Ensembles pré-canonisés
// ---------------------------------------------------------------------------
const RESERVED = new Set();
for (const list of [SYSTEM_NAMES, STAFF_NAMES, ROUTE_NAMES, INJECTION_WORDS]) {
  for (const w of list) {
    const k = canonicalize(w);
    if (k) RESERVED.add(k);
  }
}

const PROFANITY_KEYS = () => [...PROFANITIES].map(canonicalize).filter(Boolean);

// ---------------------------------------------------------------------------
// Règles de forme
// ---------------------------------------------------------------------------
const MIN_LEN = 3;
const MAX_LEN = 20;
/** Lettres (accents permis), chiffres, espace, - _ . */
const ALLOWED_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*[\p{L}\p{N}]$/u;

class NicknameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NicknameError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Validation principale
// ---------------------------------------------------------------------------
/**
 * @param {string} raw pseudo saisi par l'utilisateur
 * @returns {{ ok: true, value: string, key: string } | { ok: false, code: string, message: string }}
 */
export function checkNickname(raw) {
  const fail = (code, message) => ({ ok: false, code, message });

  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return fail('INVALID', 'Pseudo invalide');
  }

  // 1) Normalisation Unicode NFKC + espaces
  let value = String(raw).normalize('NFKC').replace(EXOTIC_SPACE_RE, ' ');

  // 2) Caractères invisibles / de contrôle → rejet immédiat
  if (INVISIBLE_RE.test(value)) {
    return fail('INVISIBLE_CHARS', 'Le pseudo contient des caractères invisibles interdits');
  }

  value = value.replace(/\s+/gu, ' ').trim();

  // 3) Vide / uniquement des espaces
  if (!value) return fail('EMPTY', 'Le pseudo ne peut pas être vide');

  // 4) Longueur
  if ([...value].length < MIN_LEN) {
    return fail('TOO_SHORT', `Le pseudo doit contenir au moins ${MIN_LEN} caractères`);
  }
  if ([...value].length > MAX_LEN) {
    return fail('TOO_LONG', `Le pseudo ne peut pas dépasser ${MAX_LEN} caractères`);
  }

  // 5) Motifs d'injection (SQL / XSS / traversal)
  for (const re of INJECTION_PATTERNS) {
    if (re.test(value)) {
      return fail('MALICIOUS_PATTERN', 'Le pseudo contient des caractères ou motifs interdits');
    }
  }

  // 6) Jeu de caractères autorisé
  if (!ALLOWED_RE.test(value)) {
    return fail(
      'CHARSET',
      'Le pseudo ne peut contenir que des lettres, chiffres, espaces, points, tirets et underscores'
    );
  }

  // 7) Mélange d'alphabets (latin + cyrillique/grec) = tentative d'homoglyphe
  const hasLatin = /\p{Script=Latin}/u.test(value);
  const hasOther = /\p{Script=Cyrillic}|\p{Script=Greek}/u.test(value);
  if (hasLatin && hasOther) {
    return fail('MIXED_SCRIPTS', 'Le pseudo ne peut pas mélanger plusieurs alphabets');
  }

  // 8) Réservés (après canonisation + anti-répétition)
  const key = canonicalize(value);
  if (!key) return fail('CHARSET', 'Le pseudo doit contenir au moins une lettre ou un chiffre');

  const squashed = squash(key);
  if (RESERVED.has(key) || RESERVED.has(squashed)) {
    return fail('RESERVED', 'Ce pseudo est réservé et ne peut pas être utilisé');
  }

  // 8b) Réservé "enrobé" : xX_admin_Xx, admin123, official-support…
  for (const word of RESERVED) {
    if (word.length < 4) continue; // évite les faux positifs (bin, sys, api…)
    if (key.includes(word)) {
      return fail('RESERVED', 'Ce pseudo contient un terme réservé');
    }
  }

  // 9) Profanités (sous-chaîne sur la forme canonisée)
  for (const bad of PROFANITY_KEYS()) {
    if (bad.length < 3) continue;
    if (key.includes(bad) || squashed.includes(bad)) {
      return fail('PROFANITY', 'Ce pseudo contient un terme inapproprié');
    }
  }

  // 10) Pseudo purement numérique ou ressemblant à une IP
  if (/^\d+$/.test(value) || /^\d{1,3}([.-]\d{1,3}){3}$/.test(value)) {
    return fail('RESERVED', 'Ce format de pseudo n’est pas autorisé');
  }

  return { ok: true, value, key };
}

/** Variante levant une exception (pratique côté handlers existants). */
export function assertNickname(raw) {
  const res = checkNickname(raw);
  if (!res.ok) throw new NicknameError(res.code, res.message);
  return res.value;
}

export { NicknameError, MIN_LEN, MAX_LEN };
