function errorHandler(err, req, res, _next) {
  if (err.isJoi) {
    return res
      .status(400)
      .send({
        code: 400,
        message: 'Requête incorrecte',
        details: err.details
      })
  }

  res.status(err.statusCode || 500).send({
    code: err.statusCode || 500,
    message: err.message,
    arretes: err.arretes,
    niveauAlerte: err.niveauAlerte
  })
}

export default errorHandler
