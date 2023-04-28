import 'dotenv/config.js'

import {readFile, writeFile, rm} from 'node:fs/promises'
import process from 'node:process'
import path from 'node:path'
import {Buffer} from 'node:buffer'

import got from 'got'
import LMDB from 'lmdb'
import Pbf from 'pbf'
import geobuf from 'geobuf'
import Flatbush from 'flatbush'
import {bbox as computeBbox} from '@turf/turf'

const SUP_GEOJSON_PATH = process.env.SUP_GEOJSON_PATH.startsWith('http')
  ? process.env.SUP_GEOJSON_PATH
  : path.resolve(process.env.SUP_GEOJSON_PATH)

const dbPath = path.resolve('./sup.mdb')
const dbLockPath = path.resolve('./sup.mdb-lock')
const rtreePath = path.resolve('./sup.rtree')

await rm(dbPath, {force: true})
await rm(dbLockPath, {force: true})
await rm(rtreePath, {force: true})

async function readFeatures(geojsonPath) {
  const text = geojsonPath.startsWith('http')
    ? await got(geojsonPath).text()
    : await readFile(geojsonPath, {encoding: 'utf8'})

  return JSON.parse(text).features
}

const db = LMDB.open(dbPath, {keyEncoding: 'uint32', encoding: 'binary'})

const features = await readFeatures(SUP_GEOJSON_PATH)

const rtree = new Flatbush(features.length)

for (const feature of features) {
  const bbox = computeBbox(feature)
  const idx = rtree.add(...bbox)
  const pbf = geobuf.encode(feature, new Pbf())
  db.put(idx, Buffer.from(pbf))
}

await db.flushed

rtree.finish()
await writeFile(rtreePath, Buffer.from(rtree.data))

await db.close()
