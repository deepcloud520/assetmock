/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS preload used before compiled workers start. */
// The standalone workers reuse the application model transport and its @ imports.
const Module = require("node:module");
const path = require("node:path");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  const resolved = request.startsWith("@/")
    ? path.resolve(__dirname, "../.local-data/paper-runtime/src", request.slice(2)) : request;
  return original.call(this, resolved, parent, isMain, options);
};
