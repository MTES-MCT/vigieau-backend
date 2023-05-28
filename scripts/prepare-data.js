/* eslint comma-dangle: off */
import {readFile, writeFile} from 'node:fs/promises'
import Papa from 'papaparse'
import {chain, keyBy, groupBy} from 'lodash-es'

const today = (new Date()).toISOString().slice(0, 10)

const departementsPilotes = new Set(['06', '13', '30', '70'])

const usagesParticuliers = new Set([
  'Alimentation des fontaines publiques et privées d’ornement',
  // 'Arrosage des espaces verts',
  // 'Arrosage des golfs(Conformément à l\'accord cadre golf et environnement 2019-2024',
  'Arrosage des pelouses, massifs fleuris',
  // 'ICPE soumises à un APC relatif à la sécheresse',
  // 'Installations de production d\'électricité d\'origine nucléaire, hydraulique, et thermique à flamme',
  // 'Irrigation dans le cadre de la gestion collective (OUGC)',
  // 'Navigation fluviale',
  'Lavage de véhicules chez les particuliers',
  'Lavage de véhicules par des professionnels',
  'Nettoyage des façades, toitures, trottoirs et autres surfaces imperméabilisées',
  // 'Prélèvement en canaux ',
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

async function readCsv(filePath) {
  const data = await readFile(filePath, {encoding: 'utf8'})
  return Papa.parse(data, {skipEmptyLines: true, header: true}).data
}

async function readZones() {
  const rows = await readCsv('./data/zones_historiques.csv')

  return rows
    .map(row => ({
      idZone: row.id_zone,
      type: row.type_zone,
      nom: row.nom_zone,
      departement: row.code_departement
    }))
    .filter(z => departementsPilotes.has(z.departement))
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
      statut: row.statut_arrete
    }))
    .filter(arrete => arrete.dateDebutValidite <= today && arrete.dateFinValidite >= today)
    .groupBy('idArrete')
    .map(arreteZones => {
      const {idArrete, dateDebutValidite, dateFinValidite, statut} = arreteZones[0]

      const zonesAlertes = arreteZones
        .map(({idZone, niveauAlerte}) => ({idZone, niveauAlerte}))
        .filter(({idZone}) => zonesIndex[idZone]) // On vérifie que la zone est dans notre liste

      for (const zoneAlerte of zonesAlertes) {
        zonesAlerteInfos.set(zoneAlerte.idZone, {idArrete, niveauAlerte: zoneAlerte.niveauAlerte})
      }

      return {
        idArrete,
        dateDebutValidite,
        dateFinValidite,
        statut,
        zonesAlertes
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
    .filter(r => r.concerneEauPotable)
    .filter(r => r.concerneParticulier)
    .filter(r => usagesParticuliers.has(r.usage))
    .filter(r => !['Pas de restriction', 'Sensibilisation'].includes(r.niveauRestriction))
    .filter(r => arretesIndex[r.idArrete])
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

const zones = [...zonesAlerteInfos.keys()]
  .map(idZone => {
    const zone = zonesIndex[idZone]
    const {idArrete, niveauAlerte} = zonesAlerteInfos.get(idZone)
    zone.idArrete = idArrete
    zone.niveauAlerte = niveauAlerte
    zone.usages = restrictionsByZone[idZone] ? restrictionsToUsages(restrictionsByZone[idZone]) : []
    return zone
  })

await writeFile('./data/arretes.json', JSON.stringify(arretes))
console.log(`Écriture de ${arretes.length} arrêtés`)

await writeFile('./data/zones.json', JSON.stringify(zones))
console.log(`Écriture de ${zones.length} zones`)
