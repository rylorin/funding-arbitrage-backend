const { Hyperliquid } = require("hyperliquid");

const sdk = new Hyperliquid({
  enableWs: true, // boolean (OPTIONAL) - Enable/disable WebSocket functionality, defaults to true
  privateKey: "0xf6cc01bae9b8274dacd13f6128f774dd4975d84f005f690968232d8feeb18d5d",
  testnet: false,
  walletAddress: "0x73229afED9ecaCEc09c0DD9706d8f8092F9e14ae",
  //   vaultAddress: <vaultAddress - string (OPTIONAL)>,
  //   maxReconnectAttempts: <number (OPTIONAL)>, // Default is 5, controls WebSocket reconnection attempts
  //   disableAssetMapRefresh: <boolean (OPTIONAL)>, // Default is false, set to true to disable automatic asset map refresh
  //   assetMapRefreshIntervalMs: <number (OPTIONAL)> // Default is 60000 (1 minute), controls how often asset maps are refreshed
});

// Use the SDK methods
sdk.info.getAllMids().then((allMids) => {
  //   console.log(allMids);
});

sdk.exchange
  .updateLeverage("DOGE-PERP", "isolated", 1)
  .then((result) => {
    console.log(result);
  })
  .catch((error) => {
    console.error("Error updating leverage:", error);
  });

// Place an order
sdk.exchange
  .placeOrder({
    coin: "BTC-PERP",
    is_buy: true,
    sz: 1,
    limit_px: 30000,
    order_type: { limit: { tif: "Gtc" } },
    reduce_only: false,
    // vaultAddress: '0x...', // optional
    cloid: "my client order id",
  })
  .then((placeOrderResult) => {
    console.log(placeOrderResult);
  })
  .catch((error) => {
    console.error("Error placing order:", error);
  });
