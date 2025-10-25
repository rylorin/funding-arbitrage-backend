import { config } from "dotenv";
import { ExchangeConfig, ExchangeName } from "../types/index";

config();

export const exchangeConfigs: Record<ExchangeName, ExchangeConfig> = {
  vest: {
    apiKey: process.env.VEST_API_KEY!,
    secretKey: process.env.VEST_SECRET_KEY!,
    sandbox: process.env.NODE_ENV !== "production",
    fundingFrequency: 1, // in hours
  },
  hyperliquid: {
    apiKey: process.env.HYPERLIQUID_API_KEY!,
    sandbox: process.env.NODE_ENV !== "production",
    fundingFrequency: 1, // in hours
  },
  orderly: {
    apiKey: process.env.ORDERLY_API_KEY!,
    secretKey: process.env.ORDERLY_SECRET_KEY!,
    sandbox: process.env.NODE_ENV !== "production",
    fundingFrequency: 8, // in hours
  },
  extended: {
    apiKey: process.env.EXTENDED_API_KEY!,
    sandbox: process.env.NODE_ENV !== "production",
    fundingFrequency: 1, // in hours
  },
  paradex: {
    apiKey: process.env.PARADEX_API_KEY!,
    sandbox: process.env.NODE_ENV !== "production",
    fundingFrequency: 1, // in hours
  },
  backpack: {
    apiKey: process.env.BACKPACK_API_KEY!,
    sandbox: process.env.NODE_ENV !== "production",
    fundingFrequency: 1, // in hours
  },
  hibachi: {
    apiKey: process.env.HIBACHI_API_KEY!,
    sandbox: process.env.NODE_ENV !== "production",
    fundingFrequency: 1, // in hours
  },
};

export const exchangeEndpoints = {
  vest: {
    baseUrl:
      process.env.NODE_ENV === "production"
        ? "https://server-prod.hz.vestmarkets.com/v2"
        : "https://server-dev.hz.vestmarkets.com/v2",
    websocket:
      process.env.NODE_ENV === "production"
        ? "wss://ws.vest.exchange"
        : "wss://ws.vest.exchange",
    // : 'wss://testnet-ws.vest.exchange',
  },
  hyperliquid: {
    baseUrl: "https://api.hyperliquid.xyz",
    websocket: "wss://api.hyperliquid.xyz/ws",
  },
  orderly: {
    baseUrl:
      process.env.NODE_ENV === "production"
        ? "https://api.orderly.org"
        : "https://api.orderly.org",
    // : 'https://testnet-api.orderly.org',
    websocket:
      process.env.NODE_ENV === "production"
        ? "wss://ws-evm.orderly.org"
        : "wss://ws-evm.orderly.org",
    // : 'wss://testnet-ws-evm.orderly.org',
  },
  extended: {
    baseUrl: "https://api.starknet.extended.exchange",
    websocket: "wss://api.starknet.extended.exchange/ws",
  },
  paradex: {
    baseUrl:
      process.env.NODE_ENV === "production"
        ? "https://api.paradex.trade"
        : "https://api.paradex.trade",
    // : 'https://api.testnet.paradex.trade',
    websocket:
      process.env.NODE_ENV === "production"
        ? "wss://ws.paradex.trade"
        : "wss://ws.paradex.trade",
    // : 'wss://ws.testnet.paradex.trade',
  },
  backpack: {
    baseUrl: "https://api.backpack.exchange",
    websocket: "wss://ws.backpack.exchange",
  },
  hibachi: {
    baseUrl: "https://api.hibachi.finance",
    websocket: "wss://ws.hibachi.finance",
  },
};

export const validateExchangeConfig = (exchangeName: ExchangeName): void => {
  const config = exchangeConfigs[exchangeName];
  if (!config.apiKey) {
    throw new Error(`Missing API key for ${exchangeName} exchange`);
  }

  if (["vest", "orderly"].includes(exchangeName) && !config.secretKey) {
    throw new Error(`Missing secret key for ${exchangeName} exchange`);
  }
};
