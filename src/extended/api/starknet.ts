import { axiosClient } from "./axios";
import { StarknetDomainResponseSchema } from "./starknet.schema";

export const getStarknetDomain = async () => {
  const { data } = await axiosClient.get<unknown>("/api/v1/info/starknet");

  return StarknetDomainResponseSchema.parse(data).data;
};
