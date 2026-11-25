# Token Optimizer

Une barre au-dessus de la zone de message de Claude Code (app desktop et terminal) qui montre d'un coup d'œil où en est ta session :

| Indicateur | Ce qu'il mesure |
| --- | --- |
| **qualité** | Score sur 100 : moitié part du dernier tour servie par le cache de prompt, moitié place libre dans le contexte. |
| **contexte** | Part de la fenêtre de contexte utilisée. |
| **cache** | Temps restant avant que le cache de prompt expire. Passé ce délai, le message suivant renvoie tout le contexte au prix fort. |
| **5h** | Part utilisée de ta limite sur 5 heures. |
| **semaine** | Part utilisée de ta limite sur 7 jours. |

Chaque indicateur a un anneau vert, orange ou rouge. Une ligne de statut au-dessus dit « Tout est bon. » ou prévient quand le contexte est presque plein, que le cache expire ou a expiré, ou qu'une limite approche (avec l'heure de remise à zéro pour la limite 5 h).

## Installation

Dans une session Claude Code, à l'invite :

```
/plugin install token-optimizer --marketplace mariushub/token-optimizer
```

Réponds `y` pour ajouter la marketplace, puis choisis la portée (toi seul, ou le projet).

Depuis un terminal :

```bash
claude plugin install token-optimizer --marketplace mariushub/token-optimizer
```

## Réglage

La durée du cache est fixée à 60 minutes, celle des abonnements Claude. Si tes requêtes passent au cache de 5 minutes (dépassement de forfait, clé API), change `CACHE_TTL_MIN` en haut de `hooks/register.tsx`.

## Tests

```bash
claude plugin test .
```

## Licence

MIT
