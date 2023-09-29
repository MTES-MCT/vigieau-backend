#!/usr/bin/env node
import 'dotenv/config.js'
import process from 'node:process'

import got from 'got'

import {getDepartements} from '../lib/cog.js'
import mongo from '../lib/util/mongo.js'

const matomoUrl = `https://stats.data.gouv.fr/?module=API&token_auth=${process.env.MATOMO_API_KEY}&format=JSON&idSite=285&period=day`

async function computeStatistics() {
  const lastStat = await mongo.db.collection('statistics')
    .find()
    .sort({date: -1})
    .limit(1)
    .toArray()
  const lastStateDate = lastStat[0].date ?? new Date('2023-07-11')
  const matomoDate = `date=${generateDateString(lastStateDate)},today`
  const subscriptions = await mongo.db.collection('subscriptions')
    .find()
    .project({_created: 1})
    .toArray()
  const visitsByDay = await got(`${matomoUrl}&method=VisitsSummary.getVisits&${matomoDate}`).json()
  const restrictionsSearchsByDay = await got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=1&${matomoDate}`).json()
  const arreteDownloadsByDay = await got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=2&${matomoDate}`).json()
  const arreteCadreDownloadsByDay = await got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=3&${matomoDate}`).json()
  const profileRepartitionByDay = await got(`${matomoUrl}&method=Events.getName&secondaryDimension=eventCategory&flat=1&${matomoDate}`).json()
  const departementRepartitionByDay = await got(`${matomoUrl}&method=Events.getName&secondaryDimension=eventAction&flat=1&${matomoDate}`).json()

  const statsToSave = []
  for (const d = lastStateDate; d < new Date(); d.setDate(d.getDate() + 1)) {
    const stat = {date: new Date(d)}
    const day = generateDateString(d)

    stat.apiCalls = visitsByDay[day] ?? 0

    let restrictionsSearch = restrictionsSearchsByDay[day]
    restrictionsSearch = restrictionsSearch?.find(matomoEvent => matomoEvent.label === 'CODE INSEE')?.nb_events
    stat.restrictionsSearch = restrictionsSearch ?? 0

    let arreteDownloads = 0
    if (arreteDownloadsByDay[day] && arreteDownloadsByDay[day][0].nb_events) {
      arreteDownloads += arreteDownloadsByDay[day][0].nb_events
    }

    if (arreteCadreDownloadsByDay[day] && arreteCadreDownloadsByDay[day][0].nb_events) {
      arreteDownloads += arreteCadreDownloadsByDay[day][0].nb_events
    }

    stat.arreteDownloads = arreteDownloads

    const profileRepartitionTmp = {
      particulier: 0,
      exploitation: 0,
      entreprise: 0,
      collectivite: 0
    }
    if (profileRepartitionByDay[day]) {
      for (const profile in profileRepartitionTmp) {
        if (Object.hasOwn(profileRepartitionTmp, profile)) {
          const event = profileRepartitionByDay[day].find(matomoEvent => matomoEvent.Events_EventName === profile)
          profileRepartitionTmp[profile] += event ? event.nb_events : 0
        }
      }
    }

    stat.profileRepartition = profileRepartitionTmp

    const departementRepartitionTmp = {}
    const regionRepartitionTmp = {}
    const departements = getDepartements()
    for (const code of departements.map(d => d.code)) {
      departementRepartitionTmp[code] = 0
    }

    for (const dep of departements) {
      regionRepartitionTmp[dep.region.nom] = 0
    }

    if (departementRepartitionByDay[day]) {
      for (const matomoEvent of departementRepartitionByDay[day]) {
        if (matomoEvent.Events_EventAction === 'CODE DEPARTEMENT') {
          departementRepartitionTmp[matomoEvent.Events_EventName] += matomoEvent.nb_events
          regionRepartitionTmp[departements.find(d => d.code === matomoEvent.Events_EventName).region.nom] += matomoEvent.nb_events
        }
      }
    }

    stat.departementRepartition = departementRepartitionTmp
    stat.regionRepartition = regionRepartitionTmp

    stat.subscriptions = subscriptions.filter(s => s._created.toDateString() === d.toDateString()).length

    statsToSave.push({
      updateOne: {
        filter: {date: stat.date},
        update: {$set: stat},
        upsert: true
      }
    })
  }

  await mongo.db.collection('statistics').bulkWrite(statsToSave)
}

function generateDateString(date) {
  const year = date.toLocaleString('default', {year: 'numeric'})
  const month = date.toLocaleString('default', {month: '2-digit'})
  const day = date.toLocaleString('default', {day: '2-digit'})

  return [year, month, day].join('-')
}

await mongo.connect()
await computeStatistics()
await mongo.disconnect()
