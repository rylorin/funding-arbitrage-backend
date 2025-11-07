import { getRandomInt } from "./get-random-int";

export const generateNonce = () => {
  // https://github.com/starkware-libs/starkware-crypto-utils/blob/dev/src/js/signature.ts#L327
  return getRandomInt(0, 2 ** 31 - 1);
};
