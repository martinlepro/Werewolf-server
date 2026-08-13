# Loup-Garou — serveur + client

## Installation

Node.js 18+ est recommandé. Depuis ce dossier :

```bash
npm install
npm start
```

Le serveur écoute sur `http://localhost:3000` (ou sur la valeur de `PORT`). La landing page est servie par `/`. Le lobby original est servi par `/play` et par `/play/:gameId` (liens de partie partageables). Les statistiques du lobby sont disponibles par `/api/lobby-stats`.
