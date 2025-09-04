import { config } from 'dotenv';
import { ExchangeApiCredentials, ExchangeName } from '../types/index';

config();

export const exchangeConfigs: Record<ExchangeName, ExchangeApiCredentials> = {
  vest: {
    apiKey: process.env.VEST_API_KEY!,
    secretKey: process.env.VEST_SECRET_KEY!,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  hyperliquid: {
    apiKey: process.env.HYPERLIQUID_API_KEY!,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  orderly: {
    apiKey: process.env.ORDERLY_API_KEY!,
    secretKey: process.env.ORDERLY_SECRET_KEY!,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  extended: {
    apiKey: process.env.EXTENDED_API_KEY!,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  paradex: {
    apiKey: process.env.PARADEX_API_KEY!,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  backpack: {
    apiKey: process.env.BACKPACK_API_KEY!,
    sandbox: process.env.NODE_ENV !== 'production',
  },
  hibachi: {
    apiKey: process.env.HIBACHI_API_KEY!,
    sandbox: process.env.NODE_ENV !== 'production',
  },
};

export const exchangeEndpoints = {
  vest: {
    baseUrl: process.env.NODE_ENV === 'production' 
      // ? 'https://api.vest.exchange' 
      // : 'https://testnet-api.vest.exchange',
      ? 'https://serverprod.vest.exchange/v2'
      : 'https://server-mmdev.vestdev.exchange/v2',
    websocket: process.env.NODE_ENV === 'production'
      ? 'wss://ws.vest.exchange'
      : 'wss://testnet-ws.vest.exchange',
  },
  hyperliquid: {
    baseUrl: 'https://api.hyperliquid.xyz',
    websocket: 'wss://api.hyperliquid.xyz/ws',
  },
  orderly: {
    baseUrl: process.env.NODE_ENV === 'production'
      ? 'https://api-evm.orderly.org'
      : 'https://testnet-api-evm.orderly.org',
    websocket: process.env.NODE_ENV === 'production'
      ? 'wss://ws-evm.orderly.org'
      : 'wss://testnet-ws-evm.orderly.org',
  },
  extended: {
    baseUrl: 'https://api.woo.org',
    websocket: 'wss://wss.woo.org/ws/stream',
  },
  paradex: {
    baseUrl: process.env.NODE_ENV === 'production'
      ? 'https://api.paradex.trade'
      : 'https://api.testnet.paradex.trade',
    websocket: process.env.NODE_ENV === 'production'
      ? 'wss://ws.paradex.trade'
      : 'wss://ws.testnet.paradex.trade',
  },
  backpack: {
    baseUrl: 'https://api.backpack.exchange',
    websocket: 'wss://ws.backpack.exchange',
  },
  hibachi: {
    baseUrl: 'https://api.hibachi.finance',
    websocket: 'wss://ws.hibachi.finance',
  },
};

export const supportedTokens = {
  vest: ['BTC', 'ETH', 'SOL', 'ARB', 'OP'],
  hyperliquid: ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB'],
  orderly: ['BTC', 'ETH', 'SOL', 'AVAX', 'MATIC'],
  extended: ['BTC', 'ETH', 'SOL', 'AVAX'],
  paradex: ['BTC', 'ETH', 'SOL'],
  backpack: ['BTC', 'ETH', 'SOL'],
  hibachi: ['BTC', 'ETH', 'SOL'],
};

export const validateExchangeConfig = (exchangeName: ExchangeName): void => {
  const config = exchangeConfigs[exchangeName];
  if (!config.apiKey) {
    throw new Error(`Missing API key for ${exchangeName} exchange`);
  }
  
  if (['vest', 'orderly'].includes(exchangeName) && !config.secretKey) {
    throw new Error(`Missing secret key for ${exchangeName} exchange`);
  }
};