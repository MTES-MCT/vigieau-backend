import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {keyBy} from 'lodash-es'

const require = createRequire(import.meta.url)

async function getCommunes() {
  const data = await readFile(
    require.resolve('@etalab/decoupage-administratif/data/communes.json'),
    {encoding: 'utf8'}
  )

  return JSON.parse(data)
    .filter(c => ['commune-actuelle', 'arrondissement-municipal'].includes(c.type))
    .filter(c => !['75056', '13055', '69123'].includes(c.code))
}

const communes = await getCommunes()
const communesIndex = keyBy(communes, 'code')

export function getCommune(codeCommune) {
  return communesIndex[codeCommune]
}

export function normalizeCodeCommune(codeCommune) {
  if (codeCommune === '75056') {
    return '75101'
  }

  if (codeCommune === '13055') {
    return '13201'
  }

  if (codeCommune === '69123') {
    return '69381'
  }

  return codeCommune
}
