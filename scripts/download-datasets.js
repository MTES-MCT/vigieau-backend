import {mkdir, writeFile} from 'node:fs/promises'
import got from 'got'

await mkdir('./data', {recursive: true})

await downloadFile(
  'https://propluvia-data.s3.gra.io.cloud.ovh.net/shp/all_zones.shp.zip',
  'all_zones.shp.zip'
)

await downloadFile(
  'https://propluvia-data.s3.gra.io.cloud.ovh.net/csv/zones_historiques.csv',
  'zones_historiques.csv'
)

await downloadFile(
  'https://propluvia-data.s3.gra.io.cloud.ovh.net/csv/arretes.csv',
  'arretes.csv'
)

await downloadFile(
  'https://propluvia-data.s3.gra.io.cloud.ovh.net/csv/restrictions.csv',
  'restrictions.csv'
)

async function downloadFile(url, name) {
  const data = await got(url).buffer()
  await writeFile(`./data/${name}`, data)
}
