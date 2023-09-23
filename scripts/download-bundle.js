#!/usr/bin/env node
import 'dotenv/config.js'

import process from 'node:process'
import path from 'node:path'
import {createGunzip} from 'node:zlib'
import {finished} from 'node:stream/promises'

import got from 'got'
import tarFs from 'tar-fs'

const BUNDLE_RESOLVER_URL = process.env.BUNDLE_RESOLVER_URL || 'https://vigieau-data.s3.gra.io.cloud.ovh.net/vigieau-latest'

const bundleUrl = await got(BUNDLE_RESOLVER_URL).text()
const dataPath = path.resolve('./data')

const extract = tarFs.extract(dataPath)
got.stream(bundleUrl).pipe(createGunzip()).pipe(extract)
await finished(extract)
