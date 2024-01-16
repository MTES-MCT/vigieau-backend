#!/usr/bin/env node
import 'dotenv/config.js'
import process from 'node:process'

import got from 'got'

import {getDepartements} from '../lib/cog.js'
import mongo from '../lib/util/mongo.js'

const matomoUrl = `${process.env.MATOMO_URL}/?module=API&token_auth=${process.env.MATOMO_API_KEY}&format=JSON&idSite=${process.env.MATOMO_ID_SITE}&period=day`
const oldMatomoUrl = `${process.env.OLD_MATOMO_URL}/?module=API&token_auth=${process.env.OLD_MATOMO_API_KEY}&format=JSON&idSite=${process.env.OLD_MATOMO_ID_SITE}&period=day`

async function computeStatistics() {
  const lastStat = await mongo.db.collection('statistics')
    .find()
    .sort({date: -1})
    .limit(1)
    .toArray()
  const lastStateDate = lastStat[0]?.date ?? new Date('2023-07-11')
  const matomoDate = `date=${generateDateString(lastStateDate)},today`
  const subscriptions = await mongo.db.collection('subscriptions')
    .find()
    .project({_created: 1})
    .toArray()
  const [
    visitsByDay,
    oldVisitsByDay,
    restrictionsSearchsByDay,
    oldRestrictionsSearchsByDay,
    arreteDownloadsByDay,
    oldArreteDownloadsByDay,
    arreteCadreDownloadsByDay,
    oldArreteCadreDownloadsByDay,
    profileRepartitionByDay,
    oldProfileRepartitionByDay,
    departementRepartitionByDay,
    oldDepartementRepartitionByDay
  ]
    = await Promise.all([
      got(`${matomoUrl}&method=VisitsSummary.getVisits&${matomoDate}`).json(),
      got(`${oldMatomoUrl}&method=VisitsSummary.getVisits&${matomoDate}`).json(),
      got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=1&${matomoDate}`).json(),
      got(`${oldMatomoUrl}&method=Events.getActionFromCategoryId&idSubtable=1&${matomoDate}`).json(),
      got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=2&${matomoDate}`).json(),
      got(`${oldMatomoUrl}&method=Events.getActionFromCategoryId&idSubtable=2&${matomoDate}`).json(),
      got(`${matomoUrl}&method=Events.getActionFromCategoryId&idSubtable=3&${matomoDate}`).json(),
      got(`${oldMatomoUrl}&method=Events.getActionFromCategoryId&idSubtable=3&${matomoDate}`).json(),
      got(`${matomoUrl}&method=Events.getNameFromActionId&idSubtable=1&${matomoDate}`).json(),
      got(`${oldMatomoUrl}&method=Events.getNameFromActionId&idSubtable=1&${matomoDate}`).json(),
      got(`${matomoUrl}&method=Events.getNameFromActionId&idSubtable=2&${matomoDate}`).json(),
      got(`${oldMatomoUrl}&method=Events.getNameFromActionId&idSubtable=2&${matomoDate}`).json()
    ])

  const statsToSave = []
  for (const d = lastStateDate; d < new Date(); d.setDate(d.getDate() + 1)) {
    const stat = {date: new Date(d)}
    const day = generateDateString(d)

    stat.visits = (visitsByDay[day] ?? 0) + (oldVisitsByDay[day] ?? 0)

    let restrictionsSearch = restrictionsSearchsByDay[day]
    restrictionsSearch = restrictionsSearch?.find(matomoEvent => matomoEvent.label === 'CODE INSEE')?.nb_events
    let oldRestrictionsSearch = oldRestrictionsSearchsByDay[day]
    oldRestrictionsSearch = oldRestrictionsSearch?.find(matomoEvent => matomoEvent.label === 'CODE INSEE')?.nb_events
    stat.restrictionsSearch = (restrictionsSearch ?? 0) + (oldRestrictionsSearch ?? 0)

    let arreteDownloads = 0
    if (arreteDownloadsByDay[day] && arreteDownloadsByDay[day][0]?.nb_events) {
      arreteDownloads += arreteDownloadsByDay[day][0].nb_events
    }

    if (arreteCadreDownloadsByDay[day] && arreteCadreDownloadsByDay[day][0]?.nb_events) {
      arreteDownloads += arreteCadreDownloadsByDay[day][0].nb_events
    }

    let oldArreteDownloads = 0
    if (oldArreteDownloadsByDay[day] && oldArreteDownloadsByDay[day][0]?.nb_events) {
      oldArreteDownloads += oldArreteDownloadsByDay[day][0].nb_events
    }

    if (oldArreteCadreDownloadsByDay[day] && oldArreteCadreDownloadsByDay[day][0]?.nb_events) {
      oldArreteDownloads += oldArreteCadreDownloadsByDay[day][0].nb_events
    }

    stat.arreteDownloads = arreteDownloads + oldArreteDownloads

    const profileRepartitionTmp = {
      particulier: 0,
      exploitation: 0,
      entreprise: 0,
      collectivite: 0
    }
    if (profileRepartitionByDay[day]) {
      for (const profile in profileRepartitionTmp) {
        if (Object.hasOwn(profileRepartitionTmp, profile)) {
          const event = profileRepartitionByDay[day].find(matomoEvent => matomoEvent.label === profile)
          profileRepartitionTmp[profile] += event ? Number(event.nb_events) : 0
        }
      }
    }

    if (oldProfileRepartitionByDay[day]) {
      for (const profile in profileRepartitionTmp) {
        if (Object.hasOwn(profileRepartitionTmp, profile)) {
          const event = oldProfileRepartitionByDay[day].find(matomoEvent => matomoEvent.label === profile)
          profileRepartitionTmp[profile] += event ? Number(event.nb_events) : 0
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
      regionRepartitionTmp[dep.region.code] = 0
    }

    if (departementRepartitionByDay[day]) {
      for (const matomoEvent of departementRepartitionByDay[day]) {
        if (Object.prototype.hasOwnProperty.call(departementRepartitionTmp, matomoEvent.label)) {
          departementRepartitionTmp[matomoEvent.label] += Number(matomoEvent.nb_events)
          regionRepartitionTmp[departements.find(d => d.code === matomoEvent.label).region.code] += Number(matomoEvent.nb_events)
        }
      }
    }

    if (oldDepartementRepartitionByDay[day]) {
      for (const matomoEvent of oldDepartementRepartitionByDay[day]) {
        if (Object.prototype.hasOwnProperty.call(departementRepartitionTmp, matomoEvent.label)) {
          departementRepartitionTmp[matomoEvent.label] += Number(matomoEvent.nb_events)
          regionRepartitionTmp[departements.find(d => d.code === matomoEvent.label).region.code] += Number(matomoEvent.nb_events)
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
