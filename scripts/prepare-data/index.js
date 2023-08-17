/* eslint comma-dangle: off, unicorn/switch-case-braces: off */
import 'dotenv/config.js'

import process from 'node:process'
import {readFile, writeFile} from 'node:fs/promises'
import Papa from 'papaparse'
import {chain, keyBy, groupBy, pick, omit, sortBy} from 'lodash-es'
import hashObj from 'hash-obj'

import {destroyContext, computeCommunes, getZoneGeometry} from './geo.js'

const PROPLUVIA_DATA_URL = process.env.PROPLUVIA_DATA_URL || 'https://propluvia-data.s3.gra.io.cloud.ovh.net'

const today = (new Date()).toISOString().slice(0, 10)

const usagesParticuliers = new Set([
  'Alimentation des fontaines publiques et privées d’ornement',
  'Arrosage des espaces verts',
  // 'Arrosage des golfs(Conformément à l\'accord cadre golf et environnement 2019-2024',
  'Arrosage des pelouses, massifs fleuris',
  // 'ICPE soumises à un APC relatif à la sécheresse',
  // 'Installations de production d\'électricité d\'origine nucléaire, hydraulique, et thermique à flamme',
  // 'Irrigation dans le cadre de la gestion collective (OUGC)',
  'Navigation fluviale',
  'Lavage de véhicules chez les particuliers',
  'Lavage de véhicules par des professionnels',
  'Nettoyage des façades, toitures, trottoirs et autres surfaces imperméabilisées',
  'Prélèvement en canaux ',
  // 'Piscines ouvertes au public',
  'Remplissage et vidange de piscines privées (de plus d\'1 m3)',
  'Remplissage / vidange des plans d\'eau',
  'Arrosage des jardins potagers',
  // 'Irrigation par aspersion des cultures',
  'Travaux en cours d’eau',
  // 'Arrosage des terrains de sport',
  // 'Usage ICPE non soumis à un APC relatif à la sécheresse',
  'Abreuvement des animaux',
  // 'Irrigation des cultures par système d’irrigation localisée'
])

const PROFILES = ['particulier', 'entreprise', 'collectivite', 'exploitation']

async function readCsv(filePath) {
  const data = await readFile(filePath, {encoding: 'utf8'})
  return Papa.parse(data, {skipEmptyLines: true, header: true}).data
}

async function readUsagesGuideSecheresse() {
  const rows = await readCsv('./data/restriction_guide_secheresse.csv')

  const profiles = {}

  for (const profile of PROFILES) {
    const result = {
      vigilance: [],
      alerte: [],
      alerteRenforcee: [],
      crise: []
    }

    for (const row of rows) {
      if (!row[`concerne_${profile}`].includes('True')) {
        continue
      }

      const usageBase = {
        thematique: row.thematique ? row.thematique.trim() : 'Autre',
        usage: row.usage.trim(),
        niveauRestriction: 'Interdiction sauf exception',
      }

      result.vigilance.push({...usageBase, details: row.vigilance.trim().replace(/\r\n/g, '\n')})
      result.alerte.push({...usageBase, details: row.alerte.trim().replace(/\r\n/g, '\n')})
      result.alerteRenforcee.push({...usageBase, details: row.alerte_renforcee.trim().replace(/\r\n/g, '\n')})
      result.crise.push({...usageBase, details: row.crise.trim().replace(/\r\n/g, '\n')})
    }

    profiles[profile] = result
  }

  return profiles
}

const usagesGuideSecheresse = await readUsagesGuideSecheresse()

async function readReglesGestion() {
  const rows = await readCsv('./data/regles_gestion.csv')
  return rows.map(row => ({
    code: row.code_departement,
    nom: row.nom_departement,
    estValide: row.est_valide === 'True',
    affichageRestrictionSiSuperpositionTypeZone: row.affichage_restriction_si_superposition_type_zone,
    appliqueNiveauGraviteMaxSiPlusieursTypeZoneMemeCommune: row.applique_niveau_gravite_max_si_plusieurs_type_zone_meme_commune === 'True',
    arDifferentAc: row.arrete_cadre_different_restriction === 'True'
  }))
}

const reglesGestion = await readReglesGestion()
const reglesGestionIndex = keyBy(reglesGestion, 'code')

await writeFile('./data/regles-gestion.json', JSON.stringify(reglesGestion))

const departementsActifs = new Set(reglesGestion.map(rg => rg.code))

async function readZones() {
  const rows = await readCsv('./data/zones.csv')

  return rows
    .map(row => ({
      idZone: row.id_zone,
      type: row.type_zone,
      nom: row.nom_zone,
      departement: row.code_departement
    }))
    .filter(z => departementsActifs.has(z.departement))
}

const zonesIndex = keyBy(await readZones(), 'idZone')
const zonesAlerteInfos = new Map()

async function readArretes() {
  const rows = await readCsv('./data/arretes.csv')

  return chain(rows)
    .filter(r => r.id_zone)
    .map(row => ({
      idArrete: Number.parseInt(row.id_arrete, 10).toString(),
      idZone: Number.parseInt(row.id_zone, 10).toString(),
      dateDebutValidite: row.debut_validite_arrete?.slice(0, 10),
      dateFinValidite: row.fin_validite_arrete?.slice(0, 10),
      niveauAlerte: row.nom_niveau,
      statut: row.statut_arrete,
      cheminFichier: row.chemin_fichier ? `${PROPLUVIA_DATA_URL}/pdf/${row.chemin_fichier}` : undefined,
      cheminFichierArreteCadre: row.chemin_fichier_arrete_cadre ? `${PROPLUVIA_DATA_URL}/pdf/${row.chemin_fichier_arrete_cadre}` : undefined
    }))
    .filter(arrete => arrete.dateDebutValidite <= today && (!arrete.dateFinValidite || arrete.dateFinValidite >= today))
    .groupBy('idArrete')
    .map(arreteZones => {
      const {idArrete, dateDebutValidite, dateFinValidite, cheminFichier, cheminFichierArreteCadre, statut} = arreteZones[0]

      const zonesAlertes = arreteZones
        .map(({idZone, niveauAlerte}) => ({idZone, niveauAlerte}))
        .filter(({idZone}) => zonesIndex[idZone]) // On vérifie que la zone est dans notre liste

      for (const zoneAlerte of zonesAlertes) {
        if (zonesAlerteInfos.has(zoneAlerte.idZone)) {
          const current = zonesAlerteInfos.get(zoneAlerte.idZone)

          // Dans le cas où on a plusieurs arrêtés en vigueur pour une même zone, on en choisit qu'un et on privilégie celui de statut Publié
          if (current.statut === statut || statut === 'Terminé') {
            continue
          }
        }

        zonesAlerteInfos.set(zoneAlerte.idZone, {idArrete, statut, niveauAlerte: zoneAlerte.niveauAlerte})
      }

      return {
        idArrete,
        dateDebutValidite,
        dateFinValidite,
        statut,
        zonesAlertes,
        cheminFichier,
        cheminFichierArreteCadre
      }
    })
    .filter(arrete => arrete.zonesAlertes.length > 0) // On élimine les arrêtés sans zones acceptées
    .value()
}

const arretes = await readArretes()
const arretesIndex = keyBy(arretes, 'idArrete')

function parseDetails(details) {
  if (details) {
    return details.replace(/\r\s\r\s/g, '\n').replace(/\r\s/g, '\n')
  }
}

function parseHeure(heure) {
  if (heure) {
    return `${heure.slice(0, -2).padStart(2, '0')}:00`
  }
}

const PROFILE_RESTRICTIONS_FILTER = {
  particulier: r => r.concerneParticulier && usagesParticuliers.has(r.usage),
  entreprise: r => r.concerneEntreprise,
  exploitation: r => r.concerneExploitation,
  collectivite: r => r.concerneCollectivite
}

async function readRestrictions() {
  const rows = await readCsv('./data/restrictions.csv')

  return rows
    .filter(r => r.id_zone && r.nom_usage).map(row => ({
      idArrete: Number.parseInt(row.id_arrete, 10).toString(),
      idZone: Number.parseInt(row.id_zone, 10).toString(),
      concerneParticulier: row.concerne_particulier === 'True',
      concerneEntreprise: row.concerne_entreprise === 'True',
      concerneCollectivite: row.concerne_collectivite === 'True',
      concerneExploitation: row.concerne_exploitation === 'True',
      concerneEauPotable: row.concerne_eau_potable === 'True',
      niveauRestriction: row.nom_niveau_restriction,
      thematique: row.nom_thematique,
      usage: row.nom_usage,
      usagePersonnalise: row.nom_usage_personnalise || undefined,
      details: parseDetails(row.niveau_alerte_restriction_texte),
      heureDebut: parseHeure(row.heure_debut),
      heureFin: parseHeure(row.heure_fin),
      operateurLogiqueOu: row.est_operateur_logique_ou === 'True'
    }))
    .filter(r => !['Pas de restriction', 'Sensibilisation'].includes(r.niveauRestriction))
    .filter(r => arretesIndex[r.idArrete])
    .filter(r => zonesAlerteInfos.get(r.idZone).idArrete === r.idArrete)
    .filter(r => {
      if (r.niveauRestriction !== 'Interdiction sur plage horaire') {
        return true
      }

      return r.heureDebut && r.heureFin
    })
}

const restrictions = await readRestrictions()
const restrictionsByZone = groupBy(restrictions, 'idZone')

function restrictionsToUsages(restrictions) {
  return chain(restrictions)
    .groupBy(r => r.usagePersonnalise || r.usage)
    .map(restrictionsUsage => {
      const usage = restrictionsUsage[0].usagePersonnalise || restrictionsUsage[0].usage

      if (restrictionsUsage.length === 1) {
        return {
          thematique: restrictionsUsage[0].thematique,
          usage,
          niveauRestriction: restrictionsUsage[0].niveauRestriction,
          details: restrictionsUsage[0].details,
          heureDebut: restrictionsUsage[0].heureDebut,
          heureFin: restrictionsUsage[0].heureFin
        }
      }

      const plageHoraire = restrictionsUsage.find(r => r.niveauRestriction === 'Interdiction sur plage horaire')
      const interdictionException = restrictionsUsage.find(r => r.niveauRestriction === 'Interdiction sauf exception')

      if (restrictionsUsage.length > 2) {
        return {
          thematique: restrictionsUsage[0].thematique,
          usage,
          erreur: 'Consulter l’arrêté'
        }
      }

      if (restrictionsUsage.length === 2 && plageHoraire && interdictionException) {
        return {
          thematique: interdictionException.thematique,
          usage,
          niveauRestriction: interdictionException.niveauRestriction,
          details: interdictionException.details,
          heureDebut: plageHoraire.heureDebut,
          heureFin: plageHoraire.heureFin
        }
      }

      return {
        thematique: restrictionsUsage[0].thematique,
        usage,
        erreur: 'Consulter l’arrêté'
      }
    })
    .value()
}

function signUsages(usages) {
  return hashObj(sortBy(usages, 'usage'), {algorithm: 'md5'}).slice(0, 9)
}

function buildUsagesByProfile(restrictions, useGuideSecheresse = false, niveauAlerte) {
  const profiles = {}

  for (const profile of PROFILES) {
    profiles[profile] = {}

    profiles[profile].usages = useGuideSecheresse
      ? usagesGuideSecheresse[profile][niveauAlerte]
      : restrictionsToUsages(restrictions.filter(r => PROFILE_RESTRICTIONS_FILTER[profile](r)))

    profiles[profile].usagesHash = profiles[profile].usages.length > 0
      ? signUsages(profiles[profile].usages)
      : null
  }

  return profiles
}

function niveauRestrictionToKey(niveauRestriction) {
  if (niveauRestriction === 'Vigilance') {
    return 'vigilance'
  }

  if (niveauRestriction === 'Alerte') {
    return 'alerte'
  }

  if (niveauRestriction === 'Alerte renforcée') {
    return 'alerteRenforcee'
  }

  if (niveauRestriction === 'Crise') {
    return 'crise'
  }
}

const zones = [...zonesAlerteInfos.keys()]
  .map(idZone => {
    const zone = zonesIndex[idZone]
    const {idArrete, niveauAlerte} = zonesAlerteInfos.get(idZone)
    const arrete = arretesIndex[idArrete]
    zone.arrete = pick(arrete, ['idArrete', 'dateDebutValidite', 'dateFinValidite', 'cheminFichier', 'cheminFichierArreteCadre'])
    zone.niveauAlerte = niveauAlerte

    if (reglesGestionIndex[zone.departement].estValide) {
      zone.profils = buildUsagesByProfile(restrictionsByZone[idZone] || [], false)
    } else {
      zone.profils = buildUsagesByProfile(null, true, niveauRestrictionToKey(niveauAlerte))
      zone.usagesGuideSecheresse = true
    }

    zone.communes = computeCommunes(zone)
    return zone
  })

await writeFile('./data/zones.json', JSON.stringify(zones))
console.log(`Écriture de ${zones.length} zones`)

const featureCollection = {
  type: 'FeatureCollection',
  features: zones.map(zone => ({
    type: 'Feature',
    properties: omit(zone, ['profils', 'communes', 'arrete']),
    geometry: getZoneGeometry(zone.idZone, true)
  }))
}

await writeFile('./data/zones.geojson', JSON.stringify(featureCollection))

destroyContext()
