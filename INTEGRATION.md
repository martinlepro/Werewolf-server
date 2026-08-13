# Intégration lobby

- `public/index.html` provient du menu HTML fourni, complété par un panneau **Serveur en direct**.
- Le panneau reçoit `lobbyStats` via Socket.IO et utilise `/api/lobby-stats` en fallback/polling toutes les 4 secondes.
- Le serveur expose `/api/lobby-stats`, sert `public/` et `public/images/`, et diffuse les statistiques à la connexion, à la création, à la jonction, à la déconnexion et périodiquement.
- Les parties affichées sont les parties en phase `LOBBY` et publiques (`options.public !== false`), avec code, nom, hôte, joueurs/max, phase et indicateur de mot de passe.
- Les PNG du thème médiéval sombre sont dans `public/images/` avec les noms demandés.
