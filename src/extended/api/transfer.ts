import { type Transfer } from "../models/transfer";
import { axiosClient } from "./axios";
import { TransferResponseSchema } from "./transfer.schema";

export const transfer = async (transfer: Transfer) => {
  const { data } = await axiosClient.post<unknown>("/api/v1/user/transfer", transfer);

  return TransferResponseSchema.parse(data).data;
};
