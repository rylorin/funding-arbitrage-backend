import { axiosClient } from "./api/axios";
import { HexString } from "./utils/hex";

export const init = async () => {
  // dotenv.config({ path: [".env.local"] });

  // invariant(process.env.API_HOST, "API_HOST is not set");
  // invariant(process.env.API_KEY, "API_KEY is not set");
  // invariant(process.env.STARK_PRIVATE_KEY, "STARK_PRIVATE_KEY is not set");
  // invariant(process.env.VAULT_ID, "VAULT_ID is not set");
  // invariant(isHexString(process.env.STARK_PRIVATE_KEY), "STARK_PRIVATE_KEY must be a hex string");

  // setHost(process.env.API_HOST);
  // setApiKey(process.env.API_KEY);

  return {
    apiKey: axiosClient.config.get("apiKey") as string,
    starkPrivateKey: axiosClient.config.get("starkPrivateKey") as HexString,
    vaultId: axiosClient.config.get("vaultId") as string,
  };
};
