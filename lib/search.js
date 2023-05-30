import {readFile} from 'node:fs/promises'

import Flatbush from 'flatbush'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import computeBbox from '@turf/bbox'
import {keyBy} from 'lodash-es'
import createError from 'http-errors'

async function readJson(filePath) {
  const data = await readFile(filePath, {encoding: 'utf8'})
  return JSON.parse(data)
}

const zones = await readJson('./data/zones.json')
const zonesIndex = keyBy(zones, 'idZone')
const zonesFeatureCollection = await readJson('./data/zones.geojson')
const zonesFeatures = zonesFeatureCollection.features

const rtree = new Flatbush(zonesFeatures.length)

for (const feature of zonesFeatures) {
  const bbox = computeBbox(feature)
  rtree.add(...bbox)
}

rtree.finish()

function createConflictError(niveauAlerte, arretes) {
  const error = createError(409, 'Impossible de calculer les règles simplifiées. Veuillez consulter les arrêtés.')
  error.niveauAlerte = niveauAlerte
  error.arretes = arretes
  return error
}

export function searchZone({lon, lat}) {
  const zones = rtree.search(lon, lat, lon, lat)
    .map(idx => zonesFeatures[idx])
    .filter(feature => booleanPointInPolygon([lon, lat], feature))
    .map(feature => zonesIndex[feature.properties.idZone])

  if (zones.length === 0) {
    throw createError(404, 'Aucune zone de restriction en vigueur à cet endroit.')
  }

  const zonesUsages = zones.filter(z => z.usages.length > 0)

  if (zonesUsages.length === 1) {
    return zonesUsages[0]
  }

  const arretes = zones.map(z => z.arrete.idArrete)

  /* Le code suivant pourrait être factorisé mais étant donné la probabilité élevée que des règles
   * spécifiques soient mises en place cela n'est pas jugé utile */

  const crise = zonesUsages.filter(z => z.niveauAlerte === 'Crise')

  if (crise.length === 1) {
    return crise[0]
  }

  if (crise.length > 1) {
    throw createConflictError('Crise', arretes)
  }

  const alerteRenforcee = zonesUsages.filter(z => z.niveauAlerte === 'Alerte renforcée')

  if (alerteRenforcee.length === 1) {
    return alerteRenforcee[0]
  }

  if (alerteRenforcee.length > 1) {
    throw createConflictError('Alerte renforcée', arretes)
  }

  const alerte = zonesUsages.filter(z => z.niveauAlerte === 'Alerte')

  if (alerte.length === 1) {
    return alerte[0]
  }

  if (alerte.length > 1) {
    throw createConflictError('Alerte', arretes)
  }

  const vigilance = zonesUsages.filter(z => z.niveauAlerte === 'Alerte')

  if (vigilance.length === 1) {
    return vigilance[0]
  }

  if (vigilance.length > 1) {
    throw createConflictError('Vigilance', arretes)
  }

  // Si on a que des zones sans restrictions d’usage associé (au sens de l’outil) et qu’on est en vigilance, on affiche n’importe quel zone
  if (zones.every(z => z.niveauAlerte === 'Vigilance')) {
    return zones[0]
  }

  throw new Error('Trou dans la raquette')
}
