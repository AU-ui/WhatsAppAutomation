import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { config } from '../config'

const { combine, timestamp, printf, colorize, errors } = winston.format

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
  // When logger is called with only an object (no string), message becomes '[object Object]'
  const msg = (message === '[object Object]' && metaStr)
    ? metaStr.trim()
    : (stack || message)
  return `${timestamp} [${level}]: ${msg}${message === '[object Object]' ? '' : metaStr}`
})

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
  }),
]

if (config.server.nodeEnv === 'production') {
  transports.push(
    new DailyRotateFile({
      dirname: config.log.dir,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      format: combine(timestamp(), errors({ stack: true }), logFormat),
    })
  )
}

export const logger = winston.createLogger({
  level: config.log.level,
  format: combine(errors({ stack: true }), timestamp()),
  transports,
})
