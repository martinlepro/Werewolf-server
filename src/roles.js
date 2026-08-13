import { TEAMS } from './config.js';

/**
 * wakeOrder : ordre de réveil pendant la nuit (null = pas de réveil actif)
 * firstNightOnly : le rôle n'agit que la nuit 1
 * usesLeft : nombre d'utilisations (null = illimité)
 */
export const ROLES = {
  // ---------- VILLAGE ----------
  VILLAGER: {
    id: 'VILLAGER',
    name: 'Villageois',
    team: TEAMS.VILLAGE,
    wakeOrder: null,
    description: "Sans pouvoir particulier, il doit compter sur son sens de l'observation et sa parole pour démasquer les traîtres.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  SEER: {
    id: 'SEER',
    name: 'Voyante',
    team: TEAMS.VILLAGE,
    wakeOrder: 40,
    description: "Chaque nuit, elle sonde l'âme d'un joueur et découvre son véritable rôle. Une information précieuse, mais qui la met en danger si elle se dévoile trop tôt.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  WITCH: {
    id: 'WITCH',
    name: 'Sorcière',
    team: TEAMS.VILLAGE,
    wakeOrder: 60,
    usesLeft: { heal: 1, poison: 1 },
    description: "Elle possède deux fioles : l'une ramène la victime des loups à la vie, l'autre condamne un joueur de son choix. Chacune ne peut servir qu'une fois.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  GUARD: {
    id: 'GUARD',
    name: 'Garde',
    team: TEAMS.VILLAGE,
    wakeOrder: 20,
    description: "Chaque nuit, il veille sur un joueur et le protège de l'attaque des loups. Il ne peut pas protéger la même personne deux nuits d'affilée.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  HUNTER: {
    id: 'HUNTER',
    name: 'Chasseur',
    team: TEAMS.VILLAGE,
    wakeOrder: null,
    description: "En mourant, il décoche une dernière flèche et emporte un joueur de son choix dans la tombe.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  CUPID: {
    id: 'CUPID',
    name: 'Cupidon',
    team: TEAMS.VILLAGE,
    wakeOrder: 10,
    firstNightOnly: true,
    description: "La première nuit, il lie deux joueurs par un amour indéfectible. Si l'un périt, l'autre le rejoint aussitôt.",
    goal: "Éliminer les Loups-Garous — sauf si son couple prend le dessus.",
  },
  LITTLE_GIRL: {
    id: 'LITTLE_GIRL',
    name: 'Petite Fille',
    team: TEAMS.VILLAGE,
    wakeOrder: null,
    spiesWolves: true,
    description: "Elle entrouvre les yeux pendant le conciliabule des loups et capte des bribes de leurs échanges. Un jeu risqué.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  MENTALIST: {
    id: 'MENTALIST',
    name: 'Mentaliste',
    team: TEAMS.VILLAGE,
    wakeOrder: null,
    description: "Son intuition lui révèle l'issue du vote villageois quelques instants avant qu'il ne se referme.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  GRAVEDIGGER: {
    id: 'GRAVEDIGGER',
    name: 'Fossoyeur',
    team: TEAMS.VILLAGE,
    wakeOrder: null,
    description: "À sa mort, il désigne un joueur et apprend au village si un Loup-Garou se cache dans son entourage immédiat.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  NECROMANCER: {
    id: 'NECROMANCER',
    name: 'Nécromancien',
    team: TEAMS.VILLAGE,
    wakeOrder: 70,
    description: "La nuit, il ouvre un canal vers l'au-delà et converse avec les joueurs éliminés.",
    goal: "Éliminer tous les Loups-Garous.",
  },
  DICTATOR: {
    id: 'DICTATOR',
    name: 'Dictateur',
    team: TEAMS.VILLAGE,
    wakeOrder: null,
    usesLeft: { decree: 1 },
    description: "Une fois dans la partie, il annule le vote et désigne seul le condamné. S'il frappe un loup, il devient Maire ; s'il se trompe, il est exécuté sur-le-champ.",
    goal: "Éliminer tous les Loups-Garous.",
  },

  // ---------- LOUPS ----------
  WEREWOLF: {
    id: 'WEREWOLF',
    name: 'Loup-Garou',
    team: TEAMS.WOLVES,
    wakeOrder: 50,
    isWolf: true,
    description: "Chaque nuit, la meute se concerte et dévore un villageois. Le jour, il se fond dans la foule.",
    goal: "Être en nombre égal ou supérieur aux villageois.",
  },
  BLACK_WOLF: {
    id: 'BLACK_WOLF',
    name: 'Loup Noir',
    team: TEAMS.WOLVES,
    wakeOrder: 50,
    isWolf: true,
    usesLeft: { infect: 1 },
    description: "Il chasse avec la meute et peut, une seule fois, transformer la victime de la nuit en Loup-Garou au lieu de la tuer.",
    goal: "Être en nombre égal ou supérieur aux villageois.",
  },
  TALKATIVE_WOLF: {
    id: 'TALKATIVE_WOLF',
    name: 'Loup Bavard',
    team: TEAMS.WOLVES,
    wakeOrder: 50,
    isWolf: true,
    description: "Chaque jour, un mot lui est imposé. S'il parvient à le glisser dans la discussion sans éveiller les soupçons, il gagne un avantage.",
    goal: "Être en nombre égal ou supérieur aux villageois.",
  },

  // ---------- SOLO ----------
  WHITE_WOLF: {
    id: 'WHITE_WOLF',
    name: 'Loup Blanc',
    team: TEAMS.SOLO,
    wakeOrder: 80,
    isWolf: true,
    everyOtherNight: true,
    description: "Il rôde avec la meute, mais une nuit sur deux il se retourne contre elle et dévore un de ses congénères. Il ne peut triompher qu'en dernier survivant.",
    goal: "Être le seul joueur encore en vie.",
  },
  MERCENARY: {
    id: 'MERCENARY',
    name: 'Mercenaire',
    team: TEAMS.SOLO,
    wakeOrder: null,
    description: "Une cible lui est assignée dès la première nuit. S'il la fait éliminer au premier vote, il remporte la partie immédiatement ; sinon il redevient un simple villageois.",
    goal: "Faire éliminer sa cible le premier jour.",
  },
};

export const WOLF_ROLE_IDS = Object.values(ROLES)
  .filter(r => r.isWolf)
  .map(r => r.id);

export function getRole(id) {
  const r = ROLES[id];
  if (!r) throw new Error(`Rôle inconnu: ${id}`);
  return r;
}

/** Compositions recommandées selon le nombre de joueurs */
export function defaultComposition(n) {
  const c = [];
  const wolves = Math.max(1, Math.floor(n / 4));
  for (let i = 0; i < wolves; i++) {
    c.push(i === 0 && n >= 8 ? 'BLACK_WOLF' : 'WEREWOLF');
  }
  c.push('SEER');
  if (n >= 6) c.push('WITCH');
  if (n >= 7) c.push('HUNTER');
  if (n >= 8) c.push('GUARD');
  if (n >= 9) c.push('CUPID');
  if (n >= 11) c.push('LITTLE_GIRL');
  if (n >= 13) c.push('MENTALIST');
  if (n >= 15) c.push('WHITE_WOLF');
  while (c.length < n) c.push('VILLAGER');
  return c.slice(0, n);
}
