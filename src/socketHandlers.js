import { PHASES, normalizeNickname } from './config.js';
import { getRole } from './roles.js';

export function registerHandlers(io, manager) {
  const broadcastLobbyStats = () => io.emit('lobbyStats', manager.lobbyStats());
  io.on('connection', (socket) => {
    broadcastLobbyStats();
    socket.on('requestLobbyStats', () => socket.emit('lobbyStats', manager.lobbyStats()));
    let playerId = null;

    const err = (msg) => {
      socket.emit('errorMsg', { message: String(msg) });
    };

    // ---- Identification ----
    socket.on('identify', (data = {}) => {
      const { id, name } = data;

      if (!id) {
        return err('Identifiant joueur invalide');
      }

      playerId = String(id);
      socket.join(`p:${playerId}`);

      socket.data.name = normalizeNickname(
        name ?? 'Joueur'
      ).slice(0, 20);

      socket.emit('identified', {
        id: playerId,
        name: socket.data.name,
      });
    });

    const requireIdentity = () => {
      if (!playerId) {
        err('Tu dois d’abord renseigner ton pseudo');
        return false;
      }

      return true;
    };

    const requireGame = () => {
      if (!requireIdentity()) return null;

      const g = manager.gameOf(playerId);

      if (!g) {
        err('Aucune partie en cours');
        return null;
      }

      return g;
    };

    const requireAlive = (g) => {
      const p = g.getPlayer(playerId);

      if (!p) {
        err('Joueur introuvable');
        return null;
      }

      if (!p.alive) {
        err('Action réservée aux vivants');
        return null;
      }

      return p;
    };

    // ---- Création d'une partie ----
    socket.on('createGame', (opts = {}, cb) => {
      try {
        if (!requireIdentity()) {
          return cb?.({
            ok: false,
            error: 'Tu dois d’abord renseigner ton pseudo',
          });
        }

        if (!socket.data.name || socket.data.name.length < 2) {
          return cb?.({
            ok: false,
            error: 'Pseudo invalide',
          });
        }

        const g = manager.create(
          playerId,
          socket.data.name,
          opts && typeof opts === 'object' ? opts : {}
        );

        socket.join(`g:${g.code}`);

        const response = {
          ok: true,
          code: g.code,
          playerId,
          name: socket.data.name,
          isHost: true,
        };

        socket.emit('gameCreated', response);
        cb?.(response);

        // Envoie immédiatement la liste des joueurs au lobby
        g.pushState();
        broadcastLobbyStats();
      } catch (e) {
        cb?.({
          ok: false,
          error: e?.message || 'Impossible de créer la partie',
        });
      }
    });

    // ---- Rejoindre une partie ----
socket.on('joinGame', async (data = {}, cb) => {
  try {
    if (!requireIdentity()) {
      return cb?.({
        ok: false,
        error: 'Tu dois d’abord renseigner ton pseudo',
      });
    }

    const code = String(data.code ?? '')
      .trim()
      .toUpperCase();

    if (!code) {
      return cb?.({
        ok: false,
        error: 'Code de partie manquant',
      });
    }

    if (!socket.data.name || socket.data.name.length < 2) {
      return cb?.({
        ok: false,
        error: 'Pseudo invalide',
      });
    }

    const g = manager.join(
      code,
      playerId,
      socket.data.name
    );

    // Attendre que le joueur rejoigne réellement la room
    await socket.join(`g:${g.code}`);

    const player = g.getPlayer(playerId);

    if (!player) {
      throw new Error("Le joueur n'a pas été ajouté à la partie");
    }

    if (player.role && getRole(player.role)?.isWolf) {
      await socket.join(`w:${g.code}`);
    }

    const response = {
      ok: true,
      code: g.code,
      playerId,
      name: player.name,
      isHost: g.hostId === playerId,
    };

    socket.emit('joined', response);
    cb?.(response);

    // Laisse le client afficher le lobby, puis actualise la liste
    setTimeout(() => {
      g.pushState();
      broadcastLobbyStats();
    }, 0);
  } catch (e) {
    console.error('Erreur joinGame :', e);

    cb?.({
      ok: false,
      error: e?.message || 'Impossible de rejoindre la partie',
    });
  }
});
    // ---- Lancer la partie ----
    socket.on('startGame', () => {
      const g = requireGame();
      if (!g) return;

      if (g.hostId !== playerId) {
        return err("Seul l'hôte peut lancer la partie");
      }

      try {
        g.start();

        // Rattache les loups à leur canal privé
        for (const p of g.allPlayers()) {
          if (p.role && getRole(p.role)?.isWolf) {
            io.in(`p:${p.id}`).socketsJoin(`w:${g.code}`);
          }
        }

        g.pushState();
      } catch (e) {
        err(e?.message || 'Impossible de lancer la partie');
      }
    });

    // ---- Actions de nuit ----
    socket.on('nightAction', ({ action, target, targets, extra } = {}) => {
      const g = requireGame();
      if (!g) return;

      if (g.phase !== PHASES.NIGHT) {
        return err("Ce n'est pas la nuit");
      }

      const p = requireAlive(g);
      if (!p) return;

      const def = getRole(p.role);

      const validTarget = (id) => {
        const targetPlayer = g.getPlayer(id);
        return Boolean(targetPlayer?.alive);
      };

      switch (action) {
        case 'WOLF_VOTE': {
          if (!def?.isWolf) return err('Action réservée aux loups');
          if (!validTarget(target)) return err('Cible invalide');

          const targetPlayer = g.getPlayer(target);

          if (getRole(targetPlayer.role)?.isWolf) {
            return err('Tu ne peux pas viser un allié');
          }

          g.wolfVotes ??= new Map();
          g.wolfVotes.set(playerId, target);
          g.nightActions.WOLVES = {
            target: g.tally(g.wolfVotes),
          };

          io.to(`w:${g.code}`).emit(
            'wolfVotes',
            Object.fromEntries(g.wolfVotes)
          );
          break;
        }

        case 'SEER_LOOK': {
          if (p.role !== 'SEER') return err('Action interdite');
          if (!validTarget(target) || target === playerId) {
            return err('Cible invalide');
          }

          g.nightActions.SEER = { target };
          break;
        }

        case 'GUARD_PROTECT': {
          if (p.role !== 'GUARD') return err('Action interdite');
          if (!validTarget(target)) return err('Cible invalide');
          if (p.lastGuarded === target) {
            return err('Cette personne était déjà protégée la nuit dernière');
          }

          p.lastGuarded = target;
          g.nightActions.GUARD = { target };
          break;
        }

        case 'WITCH_HEAL': {
          if (p.role !== 'WITCH') return err('Action interdite');
          if ((g.roleUses.WITCH?.heal ?? 0) <= 0) {
            return err('Potion de soin épuisée');
          }

          g.nightActions.WITCH = {
            ...g.nightActions.WITCH,
            heal: true,
          };
          break;
        }

        case 'WITCH_POISON': {
          if (p.role !== 'WITCH') return err('Action interdite');
          if ((g.roleUses.WITCH?.poison ?? 0) <= 0) {
            return err('Potion de poison épuisée');
          }
          if (!validTarget(target)) return err('Cible invalide');

          g.nightActions.WITCH = {
            ...g.nightActions.WITCH,
            poison: target,
          };
          break;
        }

        case 'CUPID_LINK': {
          if (p.role !== 'CUPID') return err('Action interdite');
          if (g.nightNumber !== 1) {
            return err('Action disponible uniquement la première nuit');
          }
          if (!Array.isArray(targets) || targets.length !== 2) {
            return err('Deux cibles sont requises');
          }
          if (
            !targets.every(validTarget) ||
            targets[0] === targets[1]
          ) {
            return err('Cibles invalides');
          }

          g.nightActions.CUPID = { targets };
          break;
        }

        case 'BLACK_WOLF_INFECT': {
          if (p.role !== 'BLACK_WOLF') return err('Action interdite');
          if ((g.roleUses.BLACK_WOLF?.infect ?? 0) <= 0) {
            return err('Pouvoir déjà utilisé');
          }

          g.nightActions.BLACK_WOLF = { infect: true };
          break;
        }

        case 'WHITE_WOLF_KILL': {
          if (p.role !== 'WHITE_WOLF') return err('Action interdite');
          if (g.nightNumber % 2 !== 0) {
            return err('Le pouvoir n’est pas disponible cette nuit');
          }
          if (!validTarget(target)) return err('Cible invalide');
          if (!getRole(g.getPlayer(target).role)?.isWolf) {
            return err('La cible doit être un loup');
          }

          g.nightActions.WHITE_WOLF = { target };
          break;
        }

        default:
          return err('Action inconnue');
      }

      socket.emit('actionAck', {
        action,
        target,
        targets,
        extra,
      });
    });

    // ---- Votes de jour ----
    socket.on('vote', ({ target } = {}) => {
      const g = requireGame();
      if (!g) return;

      if (
        ![
          PHASES.DAY_VOTE,
          PHASES.MAYOR_ELECTION,
        ].includes(g.phase)
      ) {
        return err('Ce n’est pas une phase de vote');
      }

      const p = requireAlive(g);
      if (!p) return;

      if (
        target !== null &&
        !g.getPlayer(target)?.alive
      ) {
        return err('Cible invalide');
      }

      g.votes.set(playerId, target);

      g.broadcast('voteUpdate', {
        voterId: playerId,
        targetId: target,
        total: g.votes.size,
        needed: g.alivePlayers().length,
      });

      if (g.votes.size >= g.alivePlayers().length) {
        g.skipPhase();
      }
    });

    // ---- Tir du chasseur ----
    socket.on('hunterShot', ({ target } = {}) => {
      const g = requireGame();
      if (!g) return;

      if (g.phase !== PHASES.HUNTER_SHOT) {
        return err('Ce n’est pas le moment');
      }

      if (g.pendingHunter !== playerId) {
        return err('Action interdite');
      }

      if (!g.getPlayer(target)?.alive) {
        return err('Cible invalide');
      }

      g.kill(target, 'HUNTER');

      g.broadcast('hunterShot', {
        shooterId: playerId,
        targetId: target,
      });

      g.skipPhase();
    });

    // ---- Chat ----
    socket.on('chat', ({ text, channel } = {}) => {
      const g = requireGame();
      if (!g) return;

      const p = g.getPlayer(playerId);
      if (!p) return err('Joueur introuvable');

      const msg = String(text ?? '')
        .trim()
        .slice(0, 300);

      if (!msg) return;

      const currentChannel = channel || 'PUBLIC';

      const payload = {
        from: p.name,
        fromId: playerId,
        text: msg,
        at: Date.now(),
        channel: currentChannel,
      };

      if (currentChannel === 'WOLVES') {
        if (!getRole(p.role)?.isWolf || !p.alive) {
          return err('Canal réservé aux loups vivants');
        }

        if (g.phase !== PHASES.NIGHT) {
          return err('Le canal des loups est disponible uniquement la nuit');
        }

        io.to(`w:${g.code}`).emit('chat', payload);

        // La Petite Fille espionne les loups
        g.alivePlayers()
          .filter((x) => getRole(x.role)?.spiesWolves)
          .forEach((x) => {
            io.to(`p:${x.id}`).emit('chat', {
              ...payload,
              from: '???',
              fromId: null,
              spied: true,
            });
          });

        return;
      }

      if (currentChannel === 'LOVERS') {
        if (!g.lovers?.includes(playerId)) {
          return err('Canal réservé aux amoureux');
        }

        g.lovers.forEach((id) => {
          io.to(`p:${id}`).emit('chat', payload);
        });

        return;
      }

      if (currentChannel === 'DEAD') {
        if (p.alive) {
          return err('Canal réservé aux morts');
        }

        g.allPlayers()
          .filter((x) => !x.alive)
          .forEach((x) => {
            io.to(`p:${x.id}`).emit('chat', payload);
          });

        return;
      }

      // Canal public
      if (!p.alive) {
        return err('Les morts ne peuvent pas parler au village');
      }

      if (
        ![
          PHASES.DAY_DISCUSSION,
          PHASES.DAY_VOTE,
          PHASES.MAYOR_ELECTION,
        ].includes(g.phase)
      ) {
        return err('Le village dort');
      }

      g.broadcast('chat', payload);
    });

    // ---- Déconnexion ----
    socket.on('disconnect', () => {
      if (playerId) {
        manager.leave(playerId);
        broadcastLobbyStats();
      }
    });
  });
}
