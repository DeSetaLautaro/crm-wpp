const levels = { error: 0, warn: 1, info: 2, debug: 3 };

function log(level, msg, meta = {}) {
  const timestamp = new Date().toISOString();
  const hasMeta = meta && Object.keys(meta).length > 0;
  if (hasMeta) {
    console[level](JSON.stringify({
      timestamp,
      level,
      message: msg,
      ...meta
    }));
  } else {
    console[level](`[${timestamp}] ${level.toUpperCase()}: ${msg}`);
  }
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta)
};
