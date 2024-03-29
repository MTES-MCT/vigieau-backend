import {readFile} from 'node:fs/promises'

import Flatbush from 'flatbush'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import computeBbox from '@turf/bbox'
import {keyBy, max} from 'lodash-es'
import createError from 'http-errors'
import {getCommune, getDepartements} from './cog.js'
import {getReglesGestion} from './regles-gestion.js'
import {getTypePrio, computeZoneScore, getNiveauInversed, getNiveau} from './shared.js'

async function readJson(filePath) {
  const data = await readFile(filePath, {encoding: 'utf8'})
  return JSON.parse(data)
}

const zones = await readJson('./data/zones.json')
const zonesIndex = keyBy(zones, 'idZone')
const zonesCommunesIndex = {}

for (const zone of zones) {
  for (const commune of zone.communes) {
    if (!zonesCommunesIndex[commune]) {
      zonesCommunesIndex[commune] = []
    }

    zonesCommunesIndex[commune].push(zone)
  }
}

const zonesFeatureCollection = await readJson('./data/zones.geojson')
const zonesFeatures = zonesFeatureCollection.features

const rtree = new Flatbush(zonesFeatures.length)

for (const feature of zonesFeatures) {
  const bbox = computeBbox(feature)
  rtree.add(...bbox)
}

rtree.finish()

const departements = getDepartements().map(d => {
  const depZones = zones.filter(z => z.departement === d.code)
  return {
    code: d.code,
    nom: d.nom,
    region: d.region?.nom,
    niveauGraviteMax: depZones.length > 0 ? getNiveauInversed(max(depZones.map(z => getNiveau(z.niveauAlerte)))) : null
  }
})

export function searchZonesByLonLat({lon, lat}, allowMultiple = false) {
  const zones = rtree.search(lon, lat, lon, lat)
    .map(idx => zonesFeatures[idx])
    .filter(feature => booleanPointInPolygon([lon, lat], feature))
    .map(feature => zonesIndex[feature.properties.idZone])

  const sup = zones.filter(z => z.type === 'SUP')
  const sou = zones.filter(z => z.type === 'SOU')

  if (sup.length <= 1 && sou.length <= 1) {
    return zones
  }

  if (!allowMultiple) {
    throw createError(500, 'Un problème avec les données ne permet pas de répondre à votre demande')
  }

  return zones
}

export function searchZonesByCommune(commune, allowMultiple = false) {
  const zones = zonesCommunesIndex[commune]

  if (!zones) {
    return []
  }

  const sup = zones.filter(z => z.type === 'SUP')
  const sou = zones.filter(z => z.type === 'SOU')

  if (sup.length <= 1 && sou.length <= 1) {
    return zones
  }

  if (!allowMultiple) {
    throw createError(409, 'La commune comporte plusieurs zones d’alerte de même type.')
  }

  return zones
}

export function computeZoneApplicable({lon, lat, codeCommune}) {
  const commune = getCommune(codeCommune)
  const codeDepartement = commune.departement

  const reglesGestion = getReglesGestion(codeDepartement)

  if (!reglesGestion) {
    throw createError(404, 'Les données pour ce département ne sont pas disponibles')
  }

  const hasLonLat = lon !== undefined && lat !== undefined

  let lonLatZones
  const intersectingZones = new Set()

  if (hasLonLat) {
    lonLatZones = searchZonesByLonLat({lon, lat}, true)

    for (const zone of lonLatZones) {
      intersectingZones.add(zone.idZone)
    }
  }

  const {affichageRestrictionSiSuperpositionTypeZone, appliqueNiveauGraviteMaxSiPlusieursTypeZoneMemeCommune} = reglesGestion

  const communeZones = searchZonesByCommune(codeCommune, true)

  const typePrio = getTypePrio(affichageRestrictionSiSuperpositionTypeZone)

  if (!hasLonLat && communeZones.filter(z => !typePrio || z.type === typePrio).length > 1) {
    throw createError(409, 'Veuillez renseigner une adresse pour préciser la réglementation applicable')
  }

  const zones = appliqueNiveauGraviteMaxSiPlusieursTypeZoneMemeCommune
    ? communeZones
    : (lonLatZones || communeZones)

  const maxScore = max(zones.map(z => computeZoneScore(z, intersectingZones.has(z.idZone), typePrio)))
  const zonesWithMaxScore = (zones).filter(z => computeZoneScore(z, intersectingZones.has(z.idZone), typePrio) === maxScore)

  if (zonesWithMaxScore.length === 0) {
    throw createError(404, 'Aucune zone d’alerte en vigueur pour la requête donnée')
  }

  if (zonesWithMaxScore.length === 1) {
    return zonesWithMaxScore[0]
  }

  if (zonesWithMaxScore.length > 1 && !hasLonLat) {
    throw createError(409, 'Veuillez renseigner une adresse pour préciser la réglementation applicable')
  }

  throw createError(500, 'Un problème avec les données ne permet pas de répondre à votre demande')
}

export function getZone(idZone) {
  return zonesIndex[idZone]
}

export function searchDepartements() {
  return departements
}

export function computeNiveauxAlerte({lon, lat, commune, profil, typesZones}) {
  const hasLonLat = lon || lat

  if (profil === 'particulier') {
    try {
      const zone = computeZoneApplicable({lon, lat, codeCommune: commune})
      return {particulier: zone.niveauAlerte, zones: [zone.idZone]}
    } catch (error) {
      if (error.message === 'Aucune zone d’alerte en vigueur pour la requête donnée') {
        return {particulier: 'Aucun', zones: []}
      }

      throw error
    }
  } else {
    const zones = hasLonLat
      ? searchZonesByLonLat({lon, lat, codeCommune: commune})
      : searchZonesByCommune(commune)

    const sup = zones.find(z => z.type === 'SUP')
    const sou = zones.find(z => z.type === 'SOU')

    const result = {zones: []}

    if (typesZones.includes('SUP')) {
      if (sup) {
        result.sup = sup.niveauAlerte
        result.zones.push(sup.idZone)
      } else {
        result.sup = 'Aucun'
      }
    }

    if (typesZones.includes('SOU')) {
      if (sou) {
        result.sou = sou.niveauAlerte
        result.zones.push(sou.idZone)
      } else {
        result.sou = 'Aucun'
      }
    }

    return result
  }
}
