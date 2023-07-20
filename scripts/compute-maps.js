#!/usr/bin/env node
/* eslint no-await-in-loop: off */
import path from 'node:path'
import {readFile, mkdir} from 'node:fs/promises'
import got from 'got'
import {maxBy} from 'lodash-es'
import mbgl from '@maplibre/maplibre-gl-native'
import sharp from 'sharp'
import {getCommunes} from '../lib/cog.js'
import {getReglesGestion} from '../lib/regles-gestion.js'
import {getTypePrio, computeZoneScore, getNiveau} from '../lib/util.js'

async function readCommunesGeometries() {
  const communesGeometries = new Map()
  const data = await readFile('./data/communes-1000m.geojson', {encoding: 'utf8'})

  for (const communeFeature of JSON.parse(data).features) {
    communesGeometries.set(communeFeature.properties.code, communeFeature.geometry)
  }

  return communesGeometries
}

async function readZones() {
  const data = await readFile('./data/zones.json', {encoding: 'utf8'})
  return JSON.parse(data)
}

const style = {
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {'background-color': '#fff'}
    },
    {
      id: 'commune-alerte',
      type: 'fill',
      source: 'communes',
      paint: {
        'fill-color': [
          'match',
          ['get', 'niveauAlerte'],
          0,
          '#e8edff',
          1,
          '#ffeda0',
          2,
          '#feb24c',
          3,
          '#fc4e2a',
          4,
          '#b10026',
          '#e8edff'
        ]
      }
    },
    {
      id: 'departements-line',
      type: 'line',
      source: 'departements',
      layout: {
        'line-join': 'round',
        visibility: 'visible'
      },
      paint: {
        'line-color': '#fff',
        'line-width': 2
      }
    }
  ]
}

const ZONES = {
  metropole: {
    center: [2.35, 46.5],
    zoom: 6.5,
    size: 2000
  },
  guadeloupe: {
    center: [-61.4, 16.17],
    zoom: 9.1,
    size: 800
  },
  martinique: {
    center: [-61.02, 14.64],
    zoom: 9.7,
    size: 800
  },
  guyane: {
    center: [-53.2, 3.95],
    zoom: 6.9,
    size: 800
  },
  reunion: {
    center: [55.53, -21.13],
    zoom: 9.4,
    size: 800
  },
  mayotte: {
    center: [45.15, -12.82],
    zoom: 10.2,
    size: 800
  }
}

const options = {
  async request(req, callback) {
    try {
      const data = await got(req.url).buffer()
      callback(null, {data})
    } catch (error) {
      callback(error)
    }
  }
}

async function renderMaps(geojson) {
  const mapsPath = path.resolve('./data/maps')
  await mkdir(mapsPath, {recursive: true})

  style.sources = {
    communes: {
      type: 'geojson',
      data: geojson
    },
    departements: {
      type: 'geojson',
      data: 'https://adresse.data.gouv.fr/data/contours-administratifs/latest/geojson/departements-1000m.geojson'
    }
  }

  console.log('Génération des cartes en cours…')

  const map = new mbgl.Map(options)
  map.load(style)

  for (const [zoneName, zone] of Object.entries(ZONES)) {
    const renderOptions = {...zone, height: zone.size, width: zone.size}
    const mapViewBuffer = await renderMapView(map, renderOptions)

    await sharp(mapViewBuffer, {
      raw: {
        width: zone.size,
        height: zone.size,
        channels: 4
      }
    }).png({quality: 100}).toFile(path.join(mapsPath, `${zoneName}.png`))
  }

  map.release()
}

function renderMapView(map, renderOptions) {
  return new Promise((resolve, reject) => {
    map.render(renderOptions, (err, buffer) => {
      if (err) {
        return reject(err)
      }

      resolve(buffer)
    })
  })
}

const communesGeometries = await readCommunesGeometries()

export async function computeMaps() {
  const zones = await readZones()
  const zonesCommunesIndex = {}

  for (const zone of zones) {
    for (const commune of zone.communes) {
      if (!zonesCommunesIndex[commune]) {
        zonesCommunesIndex[commune] = []
      }

      zonesCommunesIndex[commune].push(zone)
    }
  }

  const features = []

  for (const commune of getCommunes()) {
    const codeDepartement = commune.departement
    const rg = getReglesGestion(codeDepartement)

    if (!rg) {
      continue
    }

    const geometry = communesGeometries.get(commune.code)

    const zonesCommune = zonesCommunesIndex[commune.code]

    if (!zonesCommune) {
      features.push({type: 'Feature', geometry, properties: {commune: commune.code, niveauAlerte: 0}})
      continue
    }

    const typePrio = getTypePrio(rg.affichageRestrictionSiSuperpositionTypeZone)
    const maxZone = maxBy(zonesCommune, z => computeZoneScore(z, false, typePrio))

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        commune: commune.code,
        niveauAlerte: getNiveau(maxZone.niveauAlerte) - 1
      }
    })
  }

  const geojson = {
    type: 'FeatureCollection',
    features
  }

  await renderMaps(geojson)
}

await computeMaps()
