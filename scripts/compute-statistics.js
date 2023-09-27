#!/usr/bin/env node
import 'dotenv/config.js'
import process from 'node:process'
import {writeFile} from 'node:fs/promises'

import got from 'got'

import {getDepartements} from '../lib/cog.js'
import mongo from '../lib/util/mongo.js'

const matomoUrl = `https://stats.data.gouv.fr/?module=API&token_auth=${process.env.MATOMO_API_KEY}&format=JSON&idSite=285`
const launchDate = 'date=2023-07-10,today'
const statistics = {}

async function computeStatistics() {
  const subscriptions = await mongo.db.collection('subscriptions').count()
  const visitsByWeek = await got(`${matomoUrl}&method=VisitsSummary.getVisits&period=week&${launchDate}`).json()
  const restrictionsSearchsByWeek = await got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=1&period=week&${launchDate}`).json()
  const arreteDownloadsByWeek = await got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=2&period=week&${launchDate}`).json()
  const arreteCadreDownloadsByWeek = await got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=3&period=week&${launchDate}`).json()
  const profileRepartition = await got(`${matomoUrl}&method=Events.getName&secondaryDimension=eventCategory&flat=1&period=day&date=last30`).json()
  const departementRepartition = await got(`${matomoUrl}&method=Events.getName&secondaryDimension=eventAction&flat=1&period=day&date=last30`).json()

  statistics.subscriptions = subscriptions
  statistics.visitsByWeek = visitsByWeek

  for (const week in restrictionsSearchsByWeek) {
    if (Object.hasOwn(restrictionsSearchsByWeek, week)) {
      // On récupère les events de recherche Matomo et on récupère arbitrairement le nombre d'événements de recherches des CODE INSEE
      // (on aurait très bien pu récupérer les CODE DEPARTEMENT)
      restrictionsSearchsByWeek[week] = restrictionsSearchsByWeek[week].find(matomoEvent => matomoEvent.label === 'CODE INSEE').nb_events
    }
  }

  statistics.restrictionsSearchsByWeek = restrictionsSearchsByWeek

  for (const week in arreteDownloadsByWeek) {
    if (Object.hasOwn(arreteDownloadsByWeek, week)) {
      arreteDownloadsByWeek[week] = arreteDownloadsByWeek[week][0].nb_events
    }
  }

  // Ajout des téléchargements des arrêtés cadres
  for (const week in arreteCadreDownloadsByWeek) {
    if (Object.hasOwn(arreteCadreDownloadsByWeek, week)) {
      arreteDownloadsByWeek[week] += arreteCadreDownloadsByWeek[week][0].nb_events
    }
  }

  statistics.arreteDownloadsByWeek = arreteDownloadsByWeek

  const profileRepartitionTmp = {
    particulier: 0,
    exploitation: 0,
    entreprise: 0,
    collectivite: 0
  }

  for (const day in profileRepartition) {
    if (Object.hasOwn(profileRepartition, day)) {
      for (const profile in profileRepartitionTmp) {
        if (Object.hasOwn(profileRepartitionTmp, profile)) {
          const event = profileRepartition[day].find(matomoEvent => matomoEvent.Events_EventName === profile)
          profileRepartitionTmp[profile] += event ? event.nb_events : 0
        }
      }
    }
  }

  statistics.profileRepartition = profileRepartitionTmp

  const departementRepartitionTmp = {}
  const regionRepartitionTmp = {}
  const departements = getDepartements()
  for (const code of departements.map(d => d.code)) {
    departementRepartitionTmp[code] = 0
  }

  for (const dep of departements) {
    regionRepartitionTmp[dep.region.nom] = 0
  }

  for (const day in departementRepartition) {
    if (Object.hasOwn(departementRepartition, day)) {
      for (const matomoEvent of departementRepartition[day]) {
        if (matomoEvent.Events_EventAction === 'CODE DEPARTEMENT') {
          departementRepartitionTmp[matomoEvent.Events_EventName] += matomoEvent.nb_events
          regionRepartitionTmp[departements.find(d => d.code === matomoEvent.Events_EventName).region.nom] += matomoEvent.nb_events
        }
      }
    }
  }

  statistics.departementRepartition = departementRepartitionTmp
  statistics.regionRepartition = regionRepartitionTmp
  statistics.updatedAt = new Date()

  await writeFile('./data/statistics.json', JSON.stringify(statistics), 'utf8')
}

await mongo.connect()
await computeStatistics()
await mongo.disconnect()
