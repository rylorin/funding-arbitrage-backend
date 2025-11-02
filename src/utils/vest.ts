import { ethers } from "ethers";

export function generateOrderSignature(
  order: {
    time: number;
    nonce: number;
    symbol: string;
    isBuy: boolean;
    size: string;
    orderType: string;
    limitPrice: string;
    reduceOnly: boolean;
    timeInForce?: string;
  },
  privateKey: string,
): string {
  const { time, nonce, orderType, symbol, isBuy, size, limitPrice, reduceOnly } = order;

  // Encode the parameters using ethers ABI encoding
  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "string", "string", "bool", "string", "string", "bool"],
    [time, nonce, orderType, symbol, isBuy, size, limitPrice, reduceOnly],
  );

  // Hash the encoded data with keccak256
  const args = ethers.keccak256(encodedData);
  // console.log("Args Hash:", args, args == "0x" + "91ad7225e0f903d6c480ef856f4bafd4d65bca76bf1acbf1b640d5294dd22191");

  // Create the signable message using the Ethereum signed message format
  const signable_msg = ethers.hashMessage(ethers.getBytes(args));
  // console.log("Signable Message:", signable_msg);

  // Sign the message with the private key using signingKey.sign() to avoid double hashing
  const wallet = new ethers.Wallet(privateKey);
  const signature = wallet.signingKey.sign(signable_msg).serialized;

  // const messageBytes = ethers.getBytes(args);
  // console.log("signature:", await wallet.signMessage(messageBytes));

  return signature;
}
