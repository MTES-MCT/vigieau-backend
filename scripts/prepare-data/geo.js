import gdal from 'gdal-async'

const zonesDs = gdal.open('./data/all_zones.shp.zip')
const zonesLayer = zonesDs.layers.get(0)
const communesDs = gdal.open('./data/communes-50m.geojson')
const communesLayer = communesDs.layers.get(0)

const zonesFeaturesIndex = new Map()

for (const zoneFeature of zonesLayer.features) {
  const idZone = zoneFeature.fields.get('id_zone').toString()
  zonesFeaturesIndex.set(idZone, zoneFeature)
}

const communesFeaturesByDep = new Map()

for (const communeFeature of communesLayer.features) {
  const departement = communeFeature.fields.get('departement')

  if (!communesFeaturesByDep.has(departement)) {
    communesFeaturesByDep.set(departement, [])
  }

  communesFeaturesByDep.get(departement).push(communeFeature)
}

const communesAreaCache = new Map()

function getCommuneArea(feature) {
  const code = feature.fields.get('code')

  if (!communesAreaCache.has(code)) {
    const area = feature.getGeometry().getArea()
    communesAreaCache.set(code, area)
  }

  return communesAreaCache.get(code)
}

export function computeCommunes(zone) {
  const zoneGeometry = getZoneGeometry(zone.idZone)

  if (!zoneGeometry) {
    return
  }

  const {departement} = zone
  const communesFeatures = communesFeaturesByDep.get(departement)

  return communesFeatures
    .filter(feature => {
      try {
        const intersectionGeom = feature.getGeometry().intersection(zoneGeometry)

        if (!intersectionGeom) {
          return false
        }

        const area = intersectionGeom.getArea()
        return area > getCommuneArea(feature) * 0.1 // On garde si plus de 10% de la surface de la commune est couverte
      } catch {
        return feature.getGeometry().intersects(zoneGeometry)
      }
    })
    .map(feature => feature.fields.get('code'))
}

export function getZoneGeometry(idZone, convertToGeoJSON = false) {
  const zoneFeature = zonesFeaturesIndex.get(idZone)

  if (!zoneFeature) {
    console.log(`Contour de la zone ${idZone} non trouvé`)
    return
  }

  const zoneGeometry = zoneFeature.getGeometry()

  if (!zoneGeometry) {
    console.log('No geometry for id ' + idZone)
    return
  }

  return convertToGeoJSON ? zoneGeometry.toObject() : zoneGeometry
}

export function destroyContext() {
  zonesDs.close()
  communesDs.close()
}
