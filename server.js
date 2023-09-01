import 'dotenv/config.js'

import process from 'node:process'

import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import createError from 'http-errors'
import {omit} from 'lodash-es'

import mongo from './lib/util/mongo.js'
import w from './lib/util/w.js'
import errorHandler from './lib/util/error-handler.js'

import {searchZonesByLonLat, searchZonesByCommune, computeZoneApplicable} from './lib/search.js'
import {getReglesGestion} from './lib/regles-gestion.js'
import {getCommune, normalizeCodeCommune} from './lib/cog.js'
import {PROFILES} from './lib/shared.js'

await mongo.connect()

const app = express()

app.use(cors({origin: true}))

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.use('/maps', express.static('./data/maps'))

app.use((req, res, next) => {
  if (!req.query.profil) {
    req.profil = 'particulier'
    next()
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

app.use(errorHandler)

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Start listening on port ${PORT}`)
})
