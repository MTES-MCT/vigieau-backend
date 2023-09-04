export function validatePayload(payload, schema) {
  const {error, value} = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    throw error
  }

  return value
}
