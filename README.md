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

## API

Ce service expose plusieurs points d’entrée d’API dont la liste suivante est publiquement accessible et stabilisée :

### Récupérer la réglementation applicable à une localisation

La localisation peut se faire à la coordonnée géographique ou au code commune (INSEE).

Pour obtenir des coordonnées à partir d’une adresse ou d’un nom de lieu-dit ou d’une commune, nous recommandons d’utiliser l’[API Adresse](https://adresse.data.gouv.fr/api-doc/adresse).

Pour recherche une commune par auto-complétion ou à partir d’un code postal, nous recommandons d’utiliser l’[API Géo Découpage administratif](https://geo.api.gouv.fr/decoupage-administratif/communes).

`GET /reglementation`

#### Paramètres de la requête

| Nom du paramètre | Description |
| --- | --- |
| `lon`, `lat` | Coordonnées WGS-84 du lieu dont on veut récupérer la réglementation applicable |
| `commune` | Code INSEE de la commune de rattachement (obligatoire) |
| `profil` | Catégorie d’usager à prendre en compte pour la liste des restrictions en vigueur (`particulier`, `exploitation`, `collectivite`, `entreprise`). Par défaut l’appel est réalisé pour `particulier`. |

#### Exemple de requête

https://api.vigieau.gouv.fr/reglementation?lon=3.16265&lat=43.37829&commune=34148&profil=exploitation

#### Exemple de réponse

```json
{
  "idZone": "12081",
  "type": "SUP",
  "nom": "Axe Orb soutenu à l'aval du barrage des Monts d'Orb",
  "departement": "34",
  "arrete": {
    "idArrete": "33372",
    "dateDebutValidite": "2023-07-28",
    "dateFinValidite": "2023-11-30",
    "cheminFichier": "https://propluvia-data.s3.gra.io.cloud.ovh.net/pdf/ArretesRestriction/AP_DDTM34-2023-07-14090_restriction_eau_secheresse_28-07-2023.pdf",
    "cheminFichierArreteCadre": "https://propluvia-data.s3.gra.io.cloud.ovh.net/pdf/ArretesCadres/ACD2023_24_Mai_2023_AvecAnnexes.pdf"
  },
  "niveauAlerte": "Alerte renforcée",
  "usages": [
    {
      "thematique": "Nettoyage",
      "usage": "Nettoyage des façades, toitures, trottoirs et autres surfaces imperméabilisées",
      "niveauRestriction": "Interdiction sauf exception",
      "details": "Interdit sauf impératif sanitaire ou sécuritaire, et réalisé par une collectivité ou une entreprise de\nnettoyage professionnel."
    },
    {
      "thematique": "Remplissage vidange",
      "usage": "Remplissage / vidange des plans d'eau",
      "niveauRestriction": "Interdiction sauf exception",
      "details": "Interdit sauf pour les usages commerciaux après accord du service de police de l’eau."
    },
    {
      "thematique": "Travaux en cours d’eau",
      "usage": "Travaux en cours d’eau",
      "niveauRestriction": "Interdiction sauf exception",
      "details": "Report des travaux sauf après déclaration au service de police de l’eau pour les cas suivants :\n- situation d’assec total;\n- pour des raisons de sécurité publique.\nLa réalisation de seuils provisoires est interdite sauf alimentation en eau potable."
    }
  ],
  "usagesHash": "4a10eb239"
}
```
