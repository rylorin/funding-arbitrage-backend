export const CONSTANTS = {
  // Time constants
  HOURS_PER_DAY: 24,
  HOURS_PER_YEAR: 8760,
  FUNDING_INTERVAL_HOURS: 8,
  FUNDINGS_PER_YEAR: 1095, // 8760 / 8

  // Default thresholds
  DEFAULT_APR_THRESHOLD: 10,
  DEFAULT_PNL_THRESHOLD: -5,
  DEFAULT_TIMEOUT_HOURS: 168, // 7 days

  // Risk management
  MAX_POSITION_SIZE: 100000,
  MIN_POSITION_SIZE: 10,
  MAX_POSITIONS_PER_USER: 50,
  
  // Rate limiting
  DEFAULT_RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  DEFAULT_RATE_LIMIT_MAX: 100,

  // WebSocket
  WEBSOCKET_PING_INTERVAL: 25000,
  WEBSOCKET_PING_TIMEOUT: 60000,

  // Job intervals (in milliseconds)
  FUNDING_RATE_UPDATE_INTERVAL: 60 * 1000, // 1 minute
  POSITION_MONITOR_INTERVAL: 30 * 1000, // 30 seconds
  AUTO_CLOSE_CHECK_INTERVAL: 60 * 1000, // 1 minute

  // Database
  DATA_RETENTION_DAYS: 90,
  CLEANUP_INTERVAL_HOURS: 24,

  // Exchange specific
  EXCHANGE_TIMEOUT: 10000, // 10 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second

  // Validation
  MIN_FUNDING_RATE: -0.01, // -1%
  MAX_FUNDING_RATE: 0.01, // 1%
  MIN_APR: -1000, // -1000%
  MAX_APR: 1000, // 1000%

  // Opportunity detection
  MIN_VIABLE_APR: 5,
  MIN_OPPORTUNITY_CONFIDENCE: 60,
  MAX_OPPORTUNITIES_RETURNED: 50,

  // Precision
  PRICE_DECIMALS: 8,
  PNL_DECIMALS: 8,
  RATE_DECIMALS: 12,
  PERCENTAGE_DECIMALS: 2,

  // Exchange fees (as percentages)
  EXCHANGE_FEES: {
    vest: {
      maker: 0.02, // 0.02%
      taker: 0.05, // 0.05%
    },
    hyperliquid: {
      maker: 0.02,
      taker: 0.05,
    },
    orderly: {
      maker: 0.02,
      taker: 0.05,
    },
    extended: {
      maker: 0.02,
      taker: 0.05,
    },
    paradex: {
      maker: 0.02,
      taker: 0.05,
    },
    backpack: {
      maker: 0.02,
      taker: 0.05,
    },
    hibachi: {
      maker: 0.02,
      taker: 0.05,
    },
  },

  // Status codes
  STATUS_CODES: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500,
  },

  // Error messages
  ERROR_MESSAGES: {
    INVALID_TOKEN: 'Invalid or expired authentication token',
    INSUFFICIENT_BALANCE: 'Insufficient balance for this operation',
    POSITION_NOT_FOUND: 'Position not found',
    EXCHANGE_UNAVAILABLE: 'Exchange is currently unavailable',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded, please try again later',
    VALIDATION_ERROR: 'Validation error in request data',
    INTERNAL_ERROR: 'Internal server error',
  },

  // Success messages
  SUCCESS_MESSAGES: {
    POSITION_CREATED: 'Position created successfully',
    POSITION_UPDATED: 'Position updated successfully',
    POSITION_CLOSED: 'Position closed successfully',
    SETTINGS_UPDATED: 'Settings updated successfully',
    AUTH_SUCCESS: 'Authentication successful',
  },

  // Supported tokens and exchanges
  SUPPORTED_TOKENS: ['BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'ARB', 'OP'] as const,
  SUPPORTED_EXCHANGES: ['vest', 'hyperliquid', 'orderly', 'extended', 'paradex', 'backpack', 'hibachi'] as const,

  // Token configurations
  TOKEN_CONFIG: {
    BTC: {
      minSize: 0.001,
      maxSize: 10,
      pricePrecision: 2,
    },
    ETH: {
      minSize: 0.01,
      maxSize: 100,
      pricePrecision: 2,
    },
    SOL: {
      minSize: 0.1,
      maxSize: 1000,
      pricePrecision: 3,
    },
    AVAX: {
      minSize: 0.1,
      maxSize: 1000,
      pricePrecision: 3,
    },
    MATIC: {
      minSize: 1,
      maxSize: 10000,
      pricePrecision: 4,
    },
    ARB: {
      minSize: 1,
      maxSize: 10000,
      pricePrecision: 4,
    },
    OP: {
      minSize: 1,
      maxSize: 10000,
      pricePrecision: 4,
    },
  },

  // Risk tolerance settings
  RISK_TOLERANCE: {
    low: {
      maxPositionsPerUser: 10,
      maxSizeMultiplier: 0.5,
      minConfidence: 80,
    },
    medium: {
      maxPositionsPerUser: 25,
      maxSizeMultiplier: 1.0,
      minConfidence: 60,
    },
    high: {
      maxPositionsPerUser: 50,
      maxSizeMultiplier: 2.0,
      minConfidence: 40,
    },
  },

  // Environment
  NODE_ENVIRONMENTS: ['development', 'test', 'production'] as const,
  
  // Logging levels
  LOG_LEVELS: ['error', 'warn', 'info', 'debug'] as const,
} as const;

// Type exports for constants
export type SupportedToken = typeof CONSTANTS.SUPPORTED_TOKENS[number];
export type SupportedExchange = typeof CONSTANTS.SUPPORTED_EXCHANGES[number];
export type NodeEnvironment = typeof CONSTANTS.NODE_ENVIRONMENTS[number];
export type LogLevel = typeof CONSTANTS.LOG_LEVELS[number];
export type RiskTolerance = keyof typeof CONSTANTS.RISK_TOLERANCE;

export default CONSTANTS;