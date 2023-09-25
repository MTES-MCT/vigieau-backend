#!/usr/bin/env node
import 'dotenv/config.js'

import mongo from '../lib/util/mongo.js'
import {computeNiveauxAlerte} from '../lib/search.js'
import {getCommune} from '../lib/cog.js'
import {sendMessage} from '../lib/util/webhook.js'

await mongo.connect()

const stats = {
  Aucun: 0,
  Vigilance: 0,
  Alerte: 0,
  'Alerte renforcée': 0,
  Crise: 0,
  'Pas de changement': 0,
  'En erreur': 0,
  'Non validé': 0
}

function doNothing() {}

function zoneIsValidated() {
  return true
}

async function notify({email, niveauAlerte, codeCommune, libelleLocalisation}) {
  stats[niveauAlerte]++
  const commune = getCommune(codeCommune).nom
  doNothing({email, libelleLocalisation, commune, niveauAlerte})
}

for await (const subscription of mongo.db.collection('subscriptions').find({})) {
  const {_id, email, lon, lat, commune, profil, typesZones, libelleLocalisation} = subscription
  let situationUpdated = false

  try {
    const {zones, particulier, sou, sup} = computeNiveauxAlerte({lon, lat, commune, profil, typesZones})

    if (zones.some(idZone => !zoneIsValidated(idZone))) {
      stats['Non validé']++
      continue
    }

    if (profil === 'particulier') {
      if (subscription?.situation?.particulier !== particulier) {
        await notify({
          email,
          niveauAlerte: particulier,
          codeCommune: commune,
          libelleLocalisation
        })
        situationUpdated = true
      }
    } else {
      if (sou && subscription?.situation?.sou !== sou) {
        await notify({
          email,
          niveauAlerte: sou,
          codeCommune: commune,
          libelleLocalisation
        })
        situationUpdated = true
      }

      if (sup && subscription?.situation?.sup !== sup) {
        await notify({
          email,
          niveauAlerte: sup,
          codeCommune: commune,
          libelleLocalisation
        })
        situationUpdated = true
      }
    }

    if (situationUpdated) {
      await mongo.db.collection('subscriptions').updateOne(
        {_id},
        {$set: {situation: {particulier, sou, sup}}}
      )
    } else {
      stats['Pas de changement']++
    }
  } catch (error) {
    stats['En erreur']++
    console.log(error)
  }
}

const sentences = []

if (stats.Aucun) {
  sentences.push(`- **${stats.Aucun}** usagers n’ont plus de restrictions 🚰`)
}

if (stats.Vigilance) {
  sentences.push(`- **${stats.Vigilance}** usagers sont passés en **Vigilance** 💧`)
}

if (stats.Alerte) {
  sentences.push(`- **${stats.Alerte}** usagers sont passés en **Alerte** 😬`)
}

if (stats['Alerte renforcée']) {
  sentences.push(`- **${stats['Alerte renforcée']}** usagers sont passés en **Alerte renforcée** 🥵`)
}

if (stats.Crise) {
  sentences.push(`- **${stats.Crise}** usagers sont passés en **Crise** 🔥`)
}

if (stats['Pas de changement']) {
  sentences.push(`- **${stats['Pas de changement']}** usagers n’ont pas de changement 👻`)
}

if (stats['En erreur']) {
  sentences.push(`- **${stats['En erreur']}** usagers sont en erreur 🧨`)
}

if (stats['Non validé']) {
  sentences.push(`- **${stats['Non validé']}** situations non évaluées en attente de validation de leur arrêté 🕵️‍♀️`)
}

const message = sentences.join('\n')
await sendMessage(message)

await mongo.disconnect()
