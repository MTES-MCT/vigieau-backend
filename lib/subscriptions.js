import Joi from 'joi'
import got from 'got'
import createError from 'http-errors'
import hashObject from 'hash-obj'
import {pick} from 'lodash-es'

import mongo, {ObjectId} from './util/mongo.js'
import {validatePayload} from './util/payload.js'

import {getCommune} from './cog.js'
import {PROFILES, ZONE_TYPES} from './shared.js'
import {computeNiveauxAlerte} from './search.js'

export const subscriptionSchema = Joi.object().keys({
  email: Joi.string().lowercase().email().required(),
  profil: Joi.string().valid(...PROFILES).required(),
  typesZones: Joi.array().items(Joi.string().valid(...ZONE_TYPES)).min(1).required(),
  commune: Joi.string().length(5),
  idAdresse: Joi.string(),
  lon: Joi.number().min(-180).max(180),
  lat: Joi.number().min(-90).max(90)
}).xor('commune', 'idAdresse')

export async function subscribe(payload, ipAddress) {
  const subscription = validatePayload(payload, subscriptionSchema)

  subscription.ip = ipAddress

  if (subscription.commune) {
    const commune = getCommune(subscription.commune)

    if (!commune) {
      throw createError(400, 'Code commune inconnu')
    }

    subscription.libelleLocalisation = commune.nom
  }

  if (subscription.idAdresse) {
    if (!('lon' in subscription) || !('lat' in subscription)) {
      throw createError(400, 'lon/lat requis dans le cas d’une inscription à l’adresse')
    }

    const {libelle, commune} = await resolveIdAdresse(subscription.idAdresse)

    subscription.commune = commune
    subscription.libelleLocalisation = libelle
  }

  subscription.typesZones = [...new Set(subscription.typesZones)].sort()

  try {
    subscription.situation = pick(
      computeNiveauxAlerte(subscription),
      ['particulier', 'sou', 'sup']
    )
  } catch {
    subscription.situation = {}
  }

  const paramsHash = hashObject(pick(subscription, ['commune', 'idAdresse'])).slice(0, 7)

  const changes = pick(subscription, 'profil', 'typesZones')
  const baseValues = pick(subscription, 'lon', 'lat', 'libelleLocalisation', 'commune', 'idAdresse', 'ip')

  const {upsertedCount} = await mongo.db.collection('subscriptions').updateOne(
    {email: subscription.email, paramsHash},
    {$set: changes, $setOnInsert: {...baseValues, _created: new Date()}},
    {upsert: true}
  )

  return upsertedCount === 1 ? 'created' : 'updated'
}

export async function resolveIdAdresse(idAdresse) {
  let result

  try {
    result = await got(`https://plateforme.adresse.data.gouv.fr/lookup/${idAdresse}`).json()
  } catch (error) {
    if (error.response?.statusCode === 404) {
      throw createError(400, 'L’adresse renseignée n’existe pas')
    }

    throw createError(500, 'Une erreur inattendue est survenue')
  }

  return {
    libelle: buildLibelle(result),
    commune: result.commune.code
  }
}

function buildLibelle(adresse) {
  if (adresse.type === 'voie' || adresse.type === 'lieu-dit') {
    return `${adresse.nomVoie}, ${adresse.commune.nom}`
  }

  if (adresse.type === 'numero') {
    return `${adresse.numero}${adresse.suffixe || ''}, ${adresse.voie.nomVoie}, ${adresse.commune.nom}`
  }

  throw createError(500, 'Une erreur inattendue est survenue')
}

export function getSubscriptionsByEmail(email) {
  return mongo.db.collection('subscriptions')
    .find({email})
    .project({profil: 1, libelleLocalisation: 1, typesZones: 1})
    .toArray()
}

export function deleteSubscriptionById(id, email) {
  return mongo.db.collection('subscriptions').deleteOne({_id: new ObjectId(id), email})
}

export function deleteSubscriptionByEmail(email) {
  return mongo.db.collection('subscriptions').deleteMany({email})
}
