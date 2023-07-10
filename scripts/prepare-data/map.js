import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {keyBy, maxBy} from 'lodash-es'
import {getCommuneGeometry} from './geo.js'
import {getCommunes} from '../../lib/cog.js'
import {getTypePrio, computeZoneScore, getNiveau} from '../../lib/util.js'

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

  await writeFile(path.join(outputPath, 'niveaux-alerte-communes.geojson'), JSON.stringify({
    type: 'FeatureCollection',
    features
  }))
}
