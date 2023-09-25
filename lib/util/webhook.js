import process from 'node:process'
import got from 'got'

const {MATTERMOST_WEBHOOK_URL} = process.env

export async function sendMessage(text) {
  if (!MATTERMOST_WEBHOOK_URL) {
    return
  }

  await got.post(MATTERMOST_WEBHOOK_URL, {json: {text}})
}
