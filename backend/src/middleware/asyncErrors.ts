/**
 * Express 4 does not catch a rejected promise from an async route handler: the
 * request just hangs. This passes any such rejection to next(err), so the
 * central error handler answers it, the same as a thrown error.
 *
 * Imported once, before any router is built.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require('express/lib/router/layer');

const original = Layer.prototype.handle_request;
if (!Layer.prototype.__iinvtyAsync) {
  Layer.prototype.__iinvtyAsync = true;
  Layer.prototype.handle_request = function handleRequest(req: unknown, res: unknown, next: (err?: unknown) => void) {
    const fn = this.handle;
    if (fn.length > 3) return original.call(this, req, res, next); // error-handling middleware
    try {
      const result = fn(req, res, next);
      if (result && typeof result.then === 'function') result.then(undefined, next);
    } catch (err) {
      next(err);
    }
  };
}

export {};
