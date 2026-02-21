import mongoose from 'mongoose'
import { config } from '../config'
import { logger } from '../utils/logger'

export async function connectDatabase(): Promise<void> {
  try {
    mongoose.set('strictQuery', true)

    await mongoose.connect(config.db.uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })

    logger.info('MongoDB connected successfully')

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error')
    })

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...')
    })

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected')
    })
  } catch (err) {
    logger.error({ err }, 'Failed to connect to MongoDB')
    process.exit(1)
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect()
  logger.info('MongoDB disconnected gracefully')
}
