/* eslint-disable camelcase */
import Papa from 'papaparse'
import mongo from './util/mongo.js'
import {computeNiveauxAlerte} from './search.js'

export async function computeUsagersZones() {
  const zonesCount = new Map()

  function incrZone(idZone) {
    zonesCount.set(idZone, (zonesCount.get(idZone) ?? 0) + 1)
  }

  for await (const subscription of mongo.db.collection('subscriptions').find({})) {
    const {lon, lat, commune, profil, typesZones} = subscription

    try {
      const {zones} = computeNiveauxAlerte({lon, lat, commune, profil, typesZones})

      for (const zone of zones) {
        incrZone(zone)
      }
    } catch {
      // Do nothing
    }
  }

  return Papa.unparse(
    [...zonesCount].map(([idZone, count]) => ({id_zone: idZone, nb_usagers: count}))
  )
}
