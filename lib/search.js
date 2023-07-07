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

export function searchZonesByLonLat({lon, lat}) {
  return rtree.search(lon, lat, lon, lat)
    .map(idx => zonesFeatures[idx])
    .filter(feature => booleanPointInPolygon([lon, lat], feature))
    .map(feature => zonesIndex[feature.properties.idZone])
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
