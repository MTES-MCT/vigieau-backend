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
