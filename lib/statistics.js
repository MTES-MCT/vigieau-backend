import mongo from './util/mongo.js'

export async function getStatistics() {
  const statistics = await mongo.db.collection('statistics').find().sort({date: 1}).toArray()
  const last30Days = statistics.slice(-30)
  const statsToReturn = {
    subscriptions: 0,
    profileRepartition: {},
    departementRepartition: {},
    regionRepartition: {},
    statsByDay: []
  }
  for (const stat of last30Days) {
    for (const profile in stat.profileRepartition) {
      if (Object.hasOwn(stat.profileRepartition, profile)) {
        statsToReturn.profileRepartition[profile] = statsToReturn.profileRepartition[profile]
          ? statsToReturn.profileRepartition[profile] + stat.profileRepartition[profile]
          : stat.profileRepartition[profile]
      }
    }

    for (const departement in stat.departementRepartition) {
      if (Object.hasOwn(stat.departementRepartition, departement)) {
        statsToReturn.departementRepartition[departement] = statsToReturn.departementRepartition[departement]
          ? statsToReturn.departementRepartition[departement] + stat.departementRepartition[departement]
          : stat.departementRepartition[departement]
      }
    }

    for (const region in stat.regionRepartition) {
      if (Object.hasOwn(stat.regionRepartition, region)) {
        statsToReturn.regionRepartition[region] = statsToReturn.regionRepartition[region]
          ? statsToReturn.regionRepartition[region] + stat.regionRepartition[region]
          : stat.regionRepartition[region]
      }
    }
  }

  statsToReturn.subscriptions = statistics.reduce((accumulator, object) => accumulator + object.subscriptions, 0)

  statsToReturn.statsByDay = statistics.map(s => {
    const statsLight = {}
    statsLight.date = s.date
    statsLight.visits = s.visits
    statsLight.arreteDownloads = s.arreteDownloads
    statsLight.restrictionsSearch = s.restrictionsSearch
    return statsLight
  })

  return statsToReturn
}
