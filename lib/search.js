import {readFile} from 'node:fs/promises'
import path from 'node:path'

import LMDB from 'lmdb'
import Pbf from 'pbf'
import geobuf from 'geobuf'
import Flatbush from 'flatbush'
import {booleanPointInPolygon} from '@turf/turf'

const dbPath = path.resolve('./sup.mdb')
const rtreePath = path.resolve('./sup.rtree')

const db = LMDB.open(dbPath, {keyEncoding: 'uint32', encoding: 'binary', readOnly: true})
const rtreeBuffer = await readFile(rtreePath)
const rtree = Flatbush.from(rtreeBuffer.buffer)

export function search({lon, lat}) {
  return rtree.search(lon, lat, lon, lat)
    .map(idx => {
      console.log('Found!')
      const buffer = db.getBinary(idx)
      return geobuf.decode(new Pbf(buffer))
    })
    .filter(feature => booleanPointInPolygon([lon, lat], feature))
    .map(feature => feature.properties)
}
