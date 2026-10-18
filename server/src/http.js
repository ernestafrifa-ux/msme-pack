// Small helpers shared by the routes: a typed HTTP error and request validation.

class HttpError extends Error {
  constructor(status, message, details, code) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

// Validate req[part] against a zod schema; replaces it with the parsed value.
function validate(schema, part = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      return next(new HttpError(400, 'Please check the highlighted fields.', fields));
    }
    // req.query is a read-only getter in Express 5, so store parsed values separately.
    req.valid = { ...(req.valid || {}), [part]: result.data };
    next();
  };
}

module.exports = { HttpError, validate };
