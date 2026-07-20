const fs = require('fs');
const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// In production the Electron main process passes down a per-user-data
// log directory via ELECTRON_LOG_DIR (see electron/main.js). Outside of
// Electron (plain `npm start` on a dev machine) fall back to a local
// ./logs folder next to the backend.
const LOG_DIR = process.env.ELECTRON_LOG_DIR || path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'backend.log');

let writeStreamFailed = false;

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    return true;
  } catch (error) {
    return false;
  }
}

function rotateIfNeeded() {
  try {
    const MAX_BYTES = 5 * 1024 * 1024; // 5MB
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_BYTES) {
      const rotatedPath = path.join(LOG_DIR, `backend.${Date.now()}.log`);
      fs.renameSync(LOG_FILE, rotatedPath);
    }
  } catch (error) {
    // Rotation failing is not fatal — just keep appending.
  }
}

function writeLine(line) {
  if (writeStreamFailed) return;
  try {
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (error) {
    writeStreamFailed = true;
  }
}

function formatLine(level, message) {
  return `[${new Date().toISOString()}] [${level}] ${message}`;
}

// Strips things that should never end up in a log file: tokens, passwords,
// connection strings with credentials. Best-effort, not a substitute for
// callers being careful about what they log.
function redact(message) {
  if (typeof message !== 'string') {
    try {
      message = JSON.stringify(message);
    } catch (error) {
      message = String(message);
    }
  }
  return message
    .replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb$1://***:***@')
    .replace(/(Bearer\s+)[A-Za-z0-9\-_.]+/gi, '$1***')
    .replace(/("password"\s*:\s*")[^"]*(")/gi, '$1***$2');
}

if (IS_PRODUCTION) {
  ensureLogDir();
}

const logger = {
  info(message) {
    const line = formatLine('INFO', redact(message));
    if (!IS_PRODUCTION) console.log(line);
    writeLine(line);
  },
  warn(message) {
    const line = formatLine('WARN', redact(message));
    if (!IS_PRODUCTION) console.warn(line);
    writeLine(line);
  },
  error(message) {
    const line = formatLine('ERROR', redact(message));
    if (!IS_PRODUCTION) console.error(line);
    writeLine(line);
  },
  logFilePath: LOG_FILE
};

module.exports = logger;
