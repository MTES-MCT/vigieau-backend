import 'dotenv/config.js'

import {search, closeDb} from './lib/search.js'

const minLat = 42.2306
const maxLat = 50.6999

const minLon = -5.1967
const maxLon = 8.1597

function getRandomLocation() {
  const lon = minLon + (Math.random() * (maxLon - minLon))
  const lat = minLat + (Math.random() * (maxLat - minLat))
  return [lon, lat]
}

console.time('lookup 100k items')

for (let i = 0; i < 100_000; i++) {
  const [lon, lat] = getRandomLocation()
  if (i % 1000 === 0) {
    console.log(i)
  }

  search({lon, lat})
}

console.timeEnd('lookup 100k items')

await closeDb()
