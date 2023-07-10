import path from 'node:path'
import {keyBy, maxBy} from 'lodash-es'
import mbgl from '@maplibre/maplibre-gl-native'
import sharp from 'sharp'
import {getCommuneGeometry} from './geo.js'
import {getCommunes} from '../../lib/cog.js'
import {getTypePrio, computeZoneScore, getNiveau} from '../../lib/util.js'

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
          '#D7D7D7',
          1,
          '#009081',
          2,
          '#c3992a',
          3,
          '#ce614a',
          4,
          '#e1000f',
          '#000'
        ]
      }
    }
  ]
}

const ZONES = {
  metropole: {
    center: [2.35, 46.5],
    zoom: 4.5
  },
  guadeloupe: {
    center: [-61.4, 16.17],
    zoom: 8.7
  },
  martinique: {
    center: [-61.02, 14.64],
    zoom: 9.3
  },
  guyane: {
    center: [-53.2, 3.95],
    zoom: 6.5
  },
  reunion: {
    center: [55.53, -21.13],
    zoom: 9
  },
  mayotte: {
    center: [45.15, -12.82],
    zoom: 9.8
  }
}

const options = {
  request(req, callback) {
    callback()
  },
  ratio: 2
}

function writeFileLog(filename, err) {
  if (err) {
    console.error(err)
    console.log(`Error pendant le traitement del’image ${filename}`)
  } else {
    console.log(`Image ${filename} enregistrée avec succès`)
  }
}

async function generateMaps(geojson, outputPath) {
  style.sources = {
    communes: {
      type: 'geojson',
      data: geojson
    }
  }

  console.log('Génération des cartes en cours…')
  await Promise.all(Object.keys(ZONES).map(async zone => {
    const map = new mbgl.Map(options)

    const renderOptions = ZONES[zone]
    map.load(style)

    await map.render(renderOptions, async (err, buffer) => {
      if (err) {
        throw err
      }

      map.release()

      const image = sharp(buffer, {
        raw: {
          width: 1024,
          height: 1024,
          channels: 4
        }
      }).resize(2000, 2000)

      const webp = image.toFormat('webp', {quality: 100})
      const webpName = `carte-${zone}.webp`
      webp.toFile(path.join(outputPath, webpName), err => writeFileLog(webpName, err))
    })
  }))
}

export async function computeMaps(zones, reglesGestion, outputPath) {
  const zonesCommunesIndex = {}
  const reglesGestionByDepartement = keyBy(reglesGestion, 'code')

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
    const rg = reglesGestionByDepartement[codeDepartement]

    if (!rg) {
      continue
    }

    const geometry = getCommuneGeometry(commune.code, true)

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

  await generateMaps(geojson, outputPath)
}
