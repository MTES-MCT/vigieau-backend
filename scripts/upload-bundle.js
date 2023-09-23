#!/usr/bin/env node
import 'dotenv/config.js'

import process from 'node:process'
import path from 'node:path'
import {createGzip} from 'node:zlib'
import {Buffer} from 'node:buffer'

import tarFs from 'tar-fs'
import {S3} from '@aws-sdk/client-s3'
import {Upload} from '@aws-sdk/lib-storage'

const region = process.env.S3_REGION
const endpoint = process.env.S3_ENDPOINT
const accessKeyId = process.env.S3_ACCESS_KEY
const secretAccessKey = process.env.S3_SECRET_KEY
const bucket = process.env.S3_BUCKET
const prefix = process.env.S3_PREFIX || ''
const vhost = process.env.S3_VHOST

const today = (new Date()).toISOString().slice(0, 10)
const archiveKey = `${prefix}vigieau-${today}.tar.gz`
const archiveUrl = `${vhost}${archiveKey}`
const latestKey = `${prefix}vigieau-latest`
const dataPath = path.resolve('./data')

const entriesToStore = [
  'zones.json',
  'zones.geojson',
  'regles-gestion.json',
  'maps/metropole.png',
  'maps/guadeloupe.png',
  'maps/guyane.png',
  'maps/martinique.png',
  'maps/mayotte.png',
  'maps/reunion.png'
]

const client = new S3({
  region,
  endpoint,
  s3BucketEndpoint: true,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
})

await uploadObject(
  archiveKey,
  tarFs.pack(dataPath, {entries: entriesToStore}).pipe(createGzip())
)

await uploadObject(
  latestKey,
  Buffer.from(archiveUrl)
)

/* Helper functions */

async function uploadObject(key, body) {
  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ACL: 'public-read'
    }
  })

  await upload.done()
}
