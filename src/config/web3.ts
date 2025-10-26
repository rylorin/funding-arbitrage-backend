import { JsonRpcProvider, AlchemyProvider } from "ethers";
import { config } from "dotenv";

config();

export const web3Config = {
  alchemyApiKey: process.env.ALCHEMY_API_KEY!,
  ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: "7d",
  challengeExpiresIn: 5 * 60 * 1000, // 5 minutes
};

export const getProvider = (): JsonRpcProvider => {
  if (process.env.ALCHEMY_API_KEY) {
    return new AlchemyProvider("mainnet", process.env.ALCHEMY_API_KEY);
  }

  if (process.env.ETHEREUM_RPC_URL) {
    return new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  }

  throw new Error("No Ethereum provider configured. Set ALCHEMY_API_KEY or ETHEREUM_RPC_URL");
};

export const validateEnvironmentVariables = (): void => {
  const required = ["JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (!process.env.ALCHEMY_API_KEY && !process.env.ETHEREUM_RPC_URL) {
    throw new Error("Either ALCHEMY_API_KEY or ETHEREUM_RPC_URL must be set");
  }
};
