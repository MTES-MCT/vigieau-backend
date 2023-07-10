# API Sécheresse

API permettent de retourner les restrictions en vigueur en lien avec la politique de préservation de la ressource en eau.

Elle se base sur les données Propluvia Privé.

## Pré-requis

- Node.js 18.12 ou supérieur
- Yarn

## Utilisation

```bash
# Installation des dépendances
yarn

# Téléchargement des données sources
yarn download-datasets

# Préparation des données
yarn prepare-data

# Génération des cartes de suivi
yarn compute-maps

# Démarrage du serveur de l'API
yarn start
```
