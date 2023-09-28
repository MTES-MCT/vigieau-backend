import process from 'node:process'
import Brevo from '@getbrevo/brevo'

import {createToken} from './jwt.js'

const {BREVO_API_KEY, NODE_ENV, WEBSITE_URL} = process.env

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
