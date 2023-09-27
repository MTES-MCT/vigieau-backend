import {readFile} from 'node:fs/promises'

export async function getStatistics() {
  return JSON.parse(await readFile(
    './data/statistics.json',
    {encoding: 'utf8'}
  ))
}
