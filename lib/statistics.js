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
    for (const [profile, value] of Object.entries(stat.profileRepartition)) {
      statsToReturn.profileRepartition[profile] = statsToReturn.profileRepartition[profile]
        ? statsToReturn.profileRepartition[profile] + value
        : value
    }

    for (const [departement, value] of Object.entries(stat.departementRepartition)) {
      statsToReturn.departementRepartition[departement] = statsToReturn.departementRepartition[departement]
        ? statsToReturn.departementRepartition[departement] + value
        : value
    }

    for (const [region, value] of Object.entries(stat.regionRepartition)) {
      statsToReturn.regionRepartition[region] = statsToReturn.regionRepartition[region]
        ? statsToReturn.regionRepartition[region] + value
        : value
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
