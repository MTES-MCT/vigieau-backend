import {readFile, writeFile} from 'node:fs/promises'
import Papa from 'papaparse'
import gdal from 'gdal-async'

async function readCsv(filePath) {
  const data = await readFile(filePath, {encoding: 'utf8'})
  return Papa.parse(data, {skipEmptyLines: true, header: true}).data
}

async function readZonesRows() {
  const rows = await readCsv('./data/zones_historiques.csv')

  return rows.map(row => ({
    idZone: row.id_zone,
    type: row.type_zone,
    nom: row.nom_zone,
    departement: row.code_departement
  }))
}

const rows = await readZonesRows()

const zonesDs = gdal.open('./data/all_zones.shp.zip')
const zonesLayer = zonesDs.layers.get(0)
const communesDs = gdal.open('./data/communes-50m.geojson')
const communesLayer = communesDs.layers.get(0)

const zonesFeaturesIndex = new Map()

const wgs84 = gdal.SpatialReference.fromProj4('+init=epsg:4326')
const transformation = new gdal.CoordinateTransformation(zonesLayer.srs, wgs84)

for (const zoneFeature of zonesLayer.features) {
  const idZone = zoneFeature.fields.get('id_zone').toString()
  zonesFeaturesIndex.set(idZone, zoneFeature)
}

const communesFeaturesByDep = new Map()

for (const communeFeature of communesLayer.features) {
  const departement = communeFeature.fields.get('departement')

  if (departement <= '95') {
    if (!communesFeaturesByDep.has(departement)) {
      communesFeaturesByDep.set(departement, [])
    }

    communesFeaturesByDep.get(departement).push(communeFeature)
  }
}

const MIN_AREA_SIZE_IN_SQ_DEGREES = 0.000_090_42 // 10ha

for (const zone of rows) {
  const zoneFeature = zonesFeaturesIndex.get(zone.idZone)
  const {departement} = zone

  if (departement <= '95') {
    const zoneGeometry = zoneFeature.getGeometry()

    if (!zoneGeometry) {
      console.log('No geometry for id ' + zone.idZone)
      continue
    }

    zoneGeometry.transform(transformation)

    const communesFeatures = communesFeaturesByDep.get(departement)

    zone.communesConcernees = communesFeatures
      .filter(feature => {
        try {
          const intersectionGeom = feature.getGeometry().intersection(zoneGeometry)

          if (!intersectionGeom) {
            return false
          }

          const area = intersectionGeom.getArea()
          return area > MIN_AREA_SIZE_IN_SQ_DEGREES
        } catch {
          return feature.getGeometry().intersects(zoneGeometry)
        }
      })
      .map(feature => feature.fields.get('code'))
  }
}

await writeFile('./data/zones.json', JSON.stringify(rows))
