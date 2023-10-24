#!/usr/bin/env node
import 'dotenv/config.js'
import mongo from '../lib/util/mongo.js'
import {computeNiveauxAlerte} from '../lib/search.js'
import {sendMessage} from '../lib/util/webhook.js'
import {sendSituationUpdate} from '../lib/util/sendmail.js'

await mongo.connect()

const stats = {
  Aucun: 0,
  Vigilance: 0,
  Alerte: 0,
  'Alerte renforcée': 0,
  Crise: 0,
  'Pas de changement': 0,
  'En erreur': 0
}

async function updateSituation(subscription) {
  const {_id, email, lon, lat, commune, profil, typesZones, libelleLocalisation} = subscription
  let situationUpdated = false

  try {
    const {particulier, sou, sup} = computeNiveauxAlerte({lon, lat, commune, profil, typesZones})

    if (profil === 'particulier') {
      if (subscription?.situation?.particulier !== particulier) {
        stats[particulier]++

        await sendSituationUpdate({
          email,
          niveauAlerte: particulier,
          codeCommune: commune,
          libelleLocalisation
        })

        situationUpdated = true
      }
    } else {
      if (sou && subscription?.situation?.sou !== sou) {
        stats[sou]++

        await sendSituationUpdate({
          email,
          niveauAlerte: sou,
          codeCommune: commune,
          libelleLocalisation
        })

        situationUpdated = true
      }

      if (sup && subscription?.situation?.sup !== sup) {
        stats[sup]++

        await sendSituationUpdate({
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

for await (const subscription of mongo.db.collection('subscriptions').find({})) {
  await updateSituation(subscription)
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

const message = sentences.join('\n')
await sendMessage(message)

await mongo.disconnect()
