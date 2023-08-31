import 'dotenv/config.js'

import process from 'node:process'
import {mkdir, writeFile} from 'node:fs/promises'
import got from 'got'

const PROPLUVIA_DATA_URL = process.env.PROPLUVIA_DATA_URL || 'https://propluvia-data.s3.gra.io.cloud.ovh.net'

await mkdir('./data', {recursive: true})

await downloadFile(
  `${PROPLUVIA_DATA_URL}/shp/all_zones.shp.zip`,
  'all_zones.shp.zip'
)

await downloadFile(
  `${PROPLUVIA_DATA_URL}/csv/zones.csv`,
  'zones.csv'
)

await downloadFile(
  `${PROPLUVIA_DATA_URL}/csv/arretes.csv`,
  'arretes.csv'
)

await downloadFile(
  `${PROPLUVIA_DATA_URL}/csv/restrictions.csv`,
  'restrictions.csv'
)

await downloadFile(
  `${PROPLUVIA_DATA_URL}/csv/regles_gestion.csv`,
  'regles_gestion.csv'
)

await downloadFile(
  `${PROPLUVIA_DATA_URL}/csv/restriction_guide_secheresse.csv`,
  'restriction_guide_secheresse.csv'
)

await downloadFile(
  'http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2023/geojson/communes-50m.geojson',
  'communes-50m.geojson'
)

await downloadFile(
  'http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2023/geojson/communes-1000m.geojson',
  'communes-1000m.geojson'
)

await downloadFile(
  'https://static.data.gouv.fr/resources/departements-et-leurs-regions/20190815-175403/departements-region.json',
  'departements.json'
)

async function downloadFile(url, name) {
  const data = await got(url, {decompress: true}).buffer()
  await writeFile(`./data/${name}`, data)
}
