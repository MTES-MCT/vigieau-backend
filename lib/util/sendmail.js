import process from 'node:process'
import Brevo from '@getbrevo/brevo'

import {getCommune} from '../cog.js'
import {createToken} from './jwt.js'

const {
  BREVO_API_KEY,
  NODE_ENV,
  WEBSITE_URL,
  EMAIL_NOTIFICATIONS_ENABLED,
  EMAIL_NOTIFICATIONS_DEV_RECIPIENT
} = process.env

const defaultClient = Brevo.ApiClient.instance

const apiKey = defaultClient.authentications['api-key']
apiKey.apiKey = process.env.BREVO_API_KEY

if (!WEBSITE_URL) {
  throw new Error('WEBSITE_URL is required')
}

const apiInstance = new Brevo.TransactionalEmailsApi()

export async function sendMail(templateId, to, params) {
  if (!BREVO_API_KEY) {
    if (NODE_ENV === 'production') {
      throw new Error('BREVO_API_KEY is required')
    } else {
      return
    }
  }

  const sendSmtpEmail = new Brevo.SendSmtpEmail()
  sendSmtpEmail.templateId = templateId
  sendSmtpEmail.to = [{email: to}]
  sendSmtpEmail.params = params

  return apiInstance.sendTransacEmail(sendSmtpEmail)
}

export function computeUnsubscribeUrl(email) {
  const token = createToken({email})
  return `${WEBSITE_URL}/abonnements?token=${token}`
}

function getTemplateId(niveauAlerte) {
  if (niveauAlerte === 'Aucun') {
    return 32
  }

  if (niveauAlerte === 'Vigilance') {
    return 30
  }

  return 31
}

export async function sendSituationUpdate({email, niveauAlerte, codeCommune, libelleLocalisation}) {
  if (EMAIL_NOTIFICATIONS_ENABLED === '1') {
    const recipient = EMAIL_NOTIFICATIONS_DEV_RECIPIENT || email

    return sendMail(
      getTemplateId(niveauAlerte),
      recipient,
      {
        address: libelleLocalisation,
        city: getCommune(codeCommune).nom,
        unsubscribeUrl: computeUnsubscribeUrl(email),
        niveaugravite: niveauAlerte
      }
    )
  }
}
