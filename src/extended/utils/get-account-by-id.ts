import { type AccountInfo } from "../api/account-info.schema";
import { checkRequired } from "./check-required";
import { type Long } from "./number";

export const getAccountById = (accounts: AccountInfo[], accountId: Long) => {
  const account = accounts.find((account) => account.accountId.eq(accountId));

  return checkRequired(account, "account");
};
