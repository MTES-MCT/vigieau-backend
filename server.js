import 'dotenv/config.js'

import process from 'node:process'

import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import createError from 'http-errors'
import {omit} from 'lodash-es'

import {searchZonesByLonLat, searchZonesByCommune} from './lib/search.js'
import {getReglesGestion} from './lib/regles-gestion.js'

const app = express()

app.use(cors({origin: true}))

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.get('/zones', w((req, res) => {
  if (req.query.lon && req.query.lat) {
    const lon = Number.parseFloat(req.query.lon)
    const lat = Number.parseFloat(req.query.lat)

    if (Number.isNaN(lon) || Number.isNaN(lat) || lon <= -180 || lon >= 180 || lat <= -85 || lat >= 85) {
      throw createError(400, 'lon/lat are not valid')
    }

    const zones = searchZonesByLonLat({lon, lat})
    return res.send(zones.map(z => omit(z, 'communes')))
  }

  if (req.query.commune) {
    const zones = searchZonesByCommune(req.query.commune)

    if (zones.length === 0) {
      throw createError(404, 'Aucune zone d’alerte en vigueur sur cette commune.')
    }

    return res.send(zones.map(z => omit(z, 'communes')))
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

app.use((err, req, res, _next) => {
  res.status(err.statusCode || 500).send({
    code: err.statusCode || 500,
    message: err.message,
    arretes: err.arretes,
    niveauAlerte: err.niveauAlerte
  })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Start listening on port ${PORT}`)
})

function w(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}
