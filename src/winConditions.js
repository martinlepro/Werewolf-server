import { TEAMS } from './config.js';
import { getRole } from './roles.js';

export function checkWin(game) {
  const alive = game.alivePlayers();

  if (alive.length === 0) {
    return { over: true, winner: null, reason: 'Personne n\'a survécu.' };
  }

  // Couple d'amoureux seuls survivants et de camps opposés
  if (game.lovers.length === 2 && alive.length === 2) {
    const [a, b] = game.lovers;
    if (alive.every(p => a === p.id || b === p.id)) {
      return { over: true, winner: 'LOVERS', winnerIds: [a, b],
               reason: 'Les Amoureux ont survécu à tous les autres.' };
    }
  }

  // Loup Blanc dernier debout
  const whiteWolf = alive.find(p => p.role === 'WHITE_WOLF');
  if (whiteWolf && alive.length === 1) {
    return { over: true, winner: TEAMS.SOLO, winnerIds: [whiteWolf.id],
             reason: 'Le Loup Blanc est le dernier survivant.' };
  }

  const wolves = alive.filter(p => getRole(p.role).isWolf && p.role !== 'WHITE_WOLF');
  const others = alive.filter(p => !getRole(p.role).isWolf);

  if (wolves.length === 0 && !whiteWolf) {
    return { over: true, winner: TEAMS.VILLAGE,
             reason: 'Tous les Loups-Garous ont été éliminés.' };
  }

  if (wolves.length >= others.length && !whiteWolf) {
    return { over: true, winner: TEAMS.WOLVES,
             reason: 'Les Loups-Garous sont trop nombreux.' };
  }

  return { over: false };
}
