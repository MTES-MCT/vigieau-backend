import 'dotenv/config.js'

import process from 'node:process'

import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import createError from 'http-errors'
import {omit} from 'lodash-es'
import {expressjwt} from 'express-jwt'
import TTLCache from '@isaacs/ttlcache'

import mongo from './lib/util/mongo.js'
import w from './lib/util/w.js'
import errorHandler from './lib/util/error-handler.js'

import {
  searchZonesByLonLat,
  searchZonesByCommune,
  getZone,
  computeZoneApplicable,
  searchDepartements
} from './lib/search.js'
import {getReglesGestion} from './lib/regles-gestion.js'
import {getCommune, normalizeCodeCommune} from './lib/cog.js'
import {PROFILES} from './lib/shared.js'
import {
  subscribe,
  deleteSubscriptionById,
  deleteSubscriptionByEmail,
  getSubscriptionsByEmail
} from './lib/subscriptions.js'
import {computeUsagersZones} from './lib/csv.js'
import {getStatistics} from './lib/statistics.js'

await mongo.connect()

const app = express()
const JWT_OPTIONS = {secret: process.env.JWT_SECRET, algorithms: ['HS256']}

if (process.env.NODE_ENV === 'production') {
  app.enable('trust proxy')
}

app.use(cors({origin: true}))

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.use('/maps', express.static('./data/maps'))

app.use((req, res, next) => {
  if (!req.query.profil) {
    req.profil = 'particulier'
    return next()
  }

  if (req.query.profil && !PROFILES.has(req.query.profil)) {
    throw createError(400, 'Profil inconnu')
  }

  req.profil = req.query.profil
  next()
})

function formatZone(zone, profil) {
  return {
    ...omit(zone, ['profils', 'communes']),
    ...zone.profils[profil]
  }
}

app.get('/zones/:idZone', (w((req, res) => {
  const zone = getZone(req.params.idZone)

  if (!zone) {
    throw createError(404, 'Aucune zone d’alerte en vigueur ne correspond à cet identifiant')
  }

  res.send(formatZone(zone, req.profil))
})))

app.get('/zones', w((req, res) => {
  if (req.query.lon && req.query.lat) {
    const lon = Number.parseFloat(req.query.lon)
    const lat = Number.parseFloat(req.query.lat)

    if (Number.isNaN(lon) || Number.isNaN(lat) || lon <= -180 || lon >= 180 || lat <= -85 || lat >= 85) {
      throw createError(400, 'lon/lat are not valid')
    }

    const zones = searchZonesByLonLat({lon, lat})
    return res.send(zones.map(z => formatZone(z, req.profil)))
  }

  if (req.query.commune) {
    const zones = searchZonesByCommune(req.query.commune)

    if (zones.length === 0) {
      throw createError(404, 'Aucune zone d’alerte en vigueur sur cette commune.')
    }

    return res.send(zones.map(z => formatZone(z, req.profil)))
  }

  throw createError(400, 'Les paramètres lon/lat ou commune sont requis')
}))

app.get('/departements/:codeDepartement', w((req, res) => {
  const reglesGestion = getReglesGestion(req.params.codeDepartement)

  if (!reglesGestion) {
    throw createError(404, 'Département non présent dans la base de données')
  }

  res.send(reglesGestion)
}))

app.get('/departements', w((req, res) => {
  res.send(searchDepartements())
}))

app.get('/reglementation', w((req, res) => {
  let lon
  let lat

  if (!req.query.commune) {
    throw createError(400, 'La paramètre commune est requis')
  }

  if (req.query.commune === '13055') {
    throw createError(409, 'Veuillez renseigner une adresse pour préciser la réglementation applicable')
  }

  const codeCommune = normalizeCodeCommune(req.query.commune)

  if (!getCommune(codeCommune)) {
    throw createError(400, 'Commune invalide')
  }

  if (req.query.lon && req.query.lat) {
    lon = Number.parseFloat(req.query.lon)
    lat = Number.parseFloat(req.query.lat)

    if (Number.isNaN(lon) || Number.isNaN(lat) || lon <= -180 || lon >= 180 || lat <= -85 || lat >= 85) {
      throw createError(400, 'Coordonnées non valides')
    }
  }

  const zone = computeZoneApplicable({lon, lat, codeCommune})
  res.send(formatZone(zone, req.profil))
}))

async function subscribeHandler(req, res) {
  const status = await subscribe(req.body, req.ip)

  res.status(202).send({
    code: 202,
    message: status === 'created' ? 'Inscription prise en compte' : 'Inscription mise à jour'
  })
}

app.post('/subscribe', express.json(), w(subscribeHandler))
app.post('/subscriptions', express.json(), w(subscribeHandler))

app.get('/subscriptions', expressjwt(JWT_OPTIONS), w(async (req, res) => {
  res.send(await getSubscriptionsByEmail(req.auth.email))
}))

app.delete('/subscriptions/all', expressjwt(JWT_OPTIONS), w(async (req, res) => {
  await deleteSubscriptionByEmail(req.auth.email)
  res.status(204).send()
}))

app.delete('/subscriptions/:id', expressjwt(JWT_OPTIONS), w(async (req, res) => {
  await deleteSubscriptionById(req.params.id, req.auth.email)
  res.status(204).send()
}))

const cache = new TTLCache({ttl: 5 * 60 * 1000}) // 5 minutes

app.get('/data/usagers-zones.csv', w(async (req, res) => {
  if (!cache.has('usagers-zones.csv')) {
    cache.set('usagers-zones.csv', await computeUsagersZones())
  }

  res.type('text/csv').send(cache.get('usagers-zones.csv'))
}))

app.get('/statistics', w(async (req, res) => {
  if (!cache.has('statistics.json')) {
    cache.set('statistics.json', await getStatistics())
  }

  res.send(cache.get('statistics.json'))
}))

app.use(errorHandler)

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Start listening on port ${PORT}`)
})
