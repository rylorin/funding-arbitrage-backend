# Contexte de Discussion - Funding Arbitrage Backend

## Informations du Projet
- **Répertoire de travail**: `/Users/ronan/Workspace/funding-arbitrage-backend`
- **Repository Git**: Oui (branche `main`)
- **Date**: 2025-10-24

## État Git Actuel
### Fichiers modifiés:
- `.gitignore`
- `README.md`
- `eslint.config.mjs`
- `src/controllers/dashboard.ts`
- `src/models/FundingRate.ts`
- `src/services/ArbitrageService.ts`
- `src/utils/calculations.ts`

### Commits récents:
- `787b27b` - Orderly, Hyperliquid funding rates fix
- `ad60ee7` - fundingFrequency added
- `59aee45` - bug fixing
- `2c64b57` - Bug fixing
- `1f93f7c` - Bug fix

## Architecture du Projet
Le projet semble être un backend pour l'arbitrage de funding rates avec:
- **Contrôleurs**: `src/controllers/dashboard.ts`
- **Modèles**: `src/models/FundingRate.ts`
- **Services**: `src/services/ArbitrageService.ts`
- **Utilitaires**: `src/utils/calculations.ts`

## Contexte de Développement
- Support des exchanges Orderly et Hyperliquid
- Calculs de funding rates et arbitrage
- Tableau de bord avec contrôleurs dédiés
- Corrections récentes de bugs liés aux funding rates

## Notes pour la Reprise
- Le projet est en développement actif avec plusieurs corrections récentes
- Les modifications portent principalement sur les funding rates et l'arbitrage
- Plusieurs fichiers sont en cours de modification (non commitées)

## Commandes Utiles
Pour reprendre le travail:
```bash
cd /Users/ronan/Workspace/funding-arbitrage-backend
git status  # Voir l'état des modifications
npm run typecheck  # Vérifier les types (si disponible)
npm run lint  # Vérifier le linting (si disponible)
```