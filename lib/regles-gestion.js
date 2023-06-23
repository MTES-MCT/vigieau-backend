import {readFile} from 'node:fs/promises'
import {keyBy} from 'lodash-es'

const data = await readFile('./data/regles-gestion.json', {encoding: 'utf8'})
const reglesGestion = JSON.parse(data)

const reglesGestionByDepartement = keyBy(reglesGestion, 'code')

export function getReglesGestion(codeDepartement) {
  return reglesGestionByDepartement[codeDepartement]
}
