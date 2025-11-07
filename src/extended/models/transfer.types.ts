import { type AccountInfo } from "../api/account-info.schema";
import { type StarknetDomain } from "../api/starknet.schema";
import { type HexString } from "../utils/hex";

export type SettlementSignature = { r: string; s: string };
export type TransferContext = {
  accounts: AccountInfo[];
  collateralId: HexString;
  collateralResolution: number;
  starkPrivateKey: HexString;
  starknetDomain: StarknetDomain;
};
