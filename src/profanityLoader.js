// =============================================================================
// src/profanityLoader.js — Chargement des dictionnaires de grossièretés
// =============================================================================
//
// Sources supportées (toutes optionnelles, cumulables) :
//   1. Fichiers .txt / .json dans data/ldnoobw/  (un mot par ligne)
//   2. Le paquet npm `bad-words` s'il est installé
//   3. Une liste de secours intégrée (FR + EN)
//
// Usage dans server.js :
//   import { loadProfanities } from './src/profanityLoader.js';
//   await loadProfanities();
// =============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import { registerProfanities, guardStats } from './nicknameGuard.js';

/** Répertoire par défaut des dictionnaires. */
export const DEFAULT_PROFANITY_DIR = path.resolve(process.cwd(), 'data', 'ldnoobw');

/**
 * Liste de secours minimale, utilisée si aucun dictionnaire externe
 * n'est disponible. Volontairement courte : les listes complètes
 * doivent venir de LDNOOBW ou de `bad-words`.
 */
const BUILTIN_FALLBACK = [
  // FR
  'connard', 'connasse', 'salope', 'salaud', 'enculer', 'encule',
  'pute', 'putain', 'batard', 'pd', 'tapette', 'negre', 'bougnoule',
  'youpin', 'sale arabe', 'nique ta mere', 'ntm', 'fdp', 'ta gueule',
  'branleur', 'couille', 'bite', 'chatte', 'foutre', 'merde',
  // EN
  'fuck', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
  'asshole', 'bastard', 'cunt', 'dick', 'pussy', 'whore', 'slut',
  'nigger', 'nigga', 'faggot', 'retard', 'rape', 'rapist',
  // Haine / extrémisme
  'hitler', 'nazi', 'nazis', 'gestapo', 'kkk', 'heilhitler', '1488',
  'holocaust', 'genocide', 'isis', 'daesh',
];

/**
 * Extrait les mots d'un contenu texte ou JSON.
 * @param {string} raw
 * @param {string} ext
 * @returns {string[]}
 */
function parseWordFile(raw, ext) {
  if (ext === '.json') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
      if (parsed && typeof parsed === 'object') {
        return Object.values(parsed).flat().map(String);
      }
      return [];
    } catch {
      return [];
    }
  }

  return raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
}

/**
 * Charge tous les dictionnaires disponibles dans le garde-fou.
 *
 * @param {object}   [opts]
 * @param {string}   [opts.dir]        Répertoire des dictionnaires.
 * @param {string[]} [opts.languages]  Filtre par code langue (['fr','en']).
 *                                     Par défaut : tous les fichiers trouvés.
 * @param {boolean}  [opts.useBadWords=true]  Tenter d'importer `bad-words`.
 * @param {boolean}  [opts.useFallback=true]  Charger la liste intégrée.
 * @param {string[]} [opts.extra=[]]   Mots supplémentaires ad hoc.
 * @param {boolean}  [opts.silent=false] Ne rien écrire dans la console.
 * @returns {Promise<{total:number, sources:object[], stats:object}>}
 */
export async function loadProfanities(opts = {}) {
  const {
    dir = DEFAULT_PROFANITY_DIR,
    languages = null,
    useBadWords = true,
    useFallback = true,
    extra = [],
    silent = false,
  } = opts;

  const sources = [];
  let total = 0;

  const log = (...args) => { if (!silent) console.log(...args); };

  // --- 1. Fichiers locaux ---------------------------------------------------
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== '.txt' && ext !== '.json') continue;

      const lang = path.basename(entry.name, ext).toLowerCase();
      if (languages && !languages.includes(lang)) continue;

      try {
        const raw = await fs.readFile(path.join(dir, entry.name), 'utf8');
        const words = parseWordFile(raw, ext);
        const added = registerProfanities(words);
        total += added;
        sources.push({ type: 'file', name: entry.name, parsed: words.length, added });
      } catch (error) {
        sources.push({ type: 'file', name: entry.name, error: error.message });
      }
    }
  } catch {
    // Répertoire absent : ce n'est pas une erreur bloquante.
    sources.push({ type: 'dir', name: dir, skipped: 'introuvable' });
  }

  // --- 2. Paquet npm `bad-words` (optionnel) --------------------------------
  if (useBadWords) {
    try {
      const mod = await import('bad-words');
      const Filter = mod.Filter ?? mod.default?.Filter ?? mod.default;
      const filter = new Filter();
      const words = filter.list ?? filter.words ?? [];
      const added = registerProfanities(words);
      total += added;
      sources.push({ type: 'npm', name: 'bad-words', parsed: words.length, added });
    } catch {
      sources.push({ type: 'npm', name: 'bad-words', skipped: 'non installé' });
    }
  }

  // --- 3. Liste de secours intégrée -----------------------------------------
  if (useFallback) {
    const added = registerProfanities(BUILTIN_FALLBACK);
    total += added;
    sources.push({
      type: 'builtin',
      name: 'fallback',
      parsed: BUILTIN_FALLBACK.length,
      added,
    });
  }

  // --- 4. Mots supplémentaires ----------------------------------------------
  if (extra.length) {
    const added = registerProfanities(extra);
    total += added;
    sources.push({ type: 'extra', name: 'opts.extra', parsed: extra.length, added });
  }

  const stats = guardStats();

  log(`[nicknameGuard] ${total} termes chargés depuis ${sources.length} source(s).`);
  log(`[nicknameGuard] Index :`, stats);

  return { total, sources, stats };
}

/**
 * Rechargement à chaud (ex. via une route admin ou un signal SIGHUP).
 * Note : `registerProfanities` étant additif, cela n'efface pas l'ancien index.
 */
export async function reloadProfanities(opts = {}) {
  return loadProfanities({ ...opts, useFallback: false, useBadWords: false });
}

export { BUILTIN_FALLBACK };
