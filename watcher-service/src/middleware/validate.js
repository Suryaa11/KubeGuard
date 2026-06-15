function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    })

    if (error) {
      error.isJoi = true
      return next(error)
    }

    req[property] = value
    next()
  }
}

module.exports = validate
