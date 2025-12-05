import pkg from "apexomni-connector-node";
const { ApexClient } = pkg;

async function main() {
  let apexClient = new ApexClient.omni();
  const apiKeyCredentials = {
    key: "your api key",
    passphrase: "your api passphrase",
    secret: "your api secret",
  };
  const seed = "your omnikey";
  await apexClient.init(apiKeyCredentials, seed);

  // 'GET Trade History'
  const { orders } = await apexClient.privateApi.tradeHistory(`BTC-USDT`, "OPEN");

  //'GET Open Position '
  const account = await apexClient.privateApi.getAccount(
    apexClient.clientConfig?.accountId,
    apexClient.user?.ethereumAddress,
  );
  const positions = account?.positions;
}

main().catch((error) => {
  console.error("Error in Apex Omni Client:", error);
});
