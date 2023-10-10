import process from 'node:process'
import jwt from 'jsonwebtoken'

const {JWT_SECRET} = process.env

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required')
}

export function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {algorithm: 'HS256'})
}
