function errorHandler(err, req, res, _next) {
  res.status(err.statusCode || 500).send({
    code: err.statusCode || 500,
    message: err.message,
    arretes: err.arretes,
    niveauAlerte: err.niveauAlerte
  })
}

export default errorHandler
