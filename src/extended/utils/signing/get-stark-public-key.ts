import { ec as starkEc } from "starknet";

import { fromHexString, type HexString } from "../hex";

export const getStarkPublicKey = (privateKey: HexString) => {
  return fromHexString(starkEc.starkCurve.getStarkKey(privateKey) as HexString);
};
