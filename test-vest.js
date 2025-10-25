const axios = require("axios");

async function testVestAPI() {
  this.baseUrl = "https://server-dev.hz.vestmarkets.com/v2";

  console.log("🧪 Testing Vest Exchange API endpoints...\n");

  try {
    // Test 1: Exchange Info
    console.log("1. Testing /exchangeInfo...");
    const exchangeInfo = await axios.get(`${baseUrl}/exchangeInfo`);
    console.log(
      `✅ Exchange Info: ${exchangeInfo.data.symbols?.length || 0} symbols available\n`
    );

    // Test 2: Funding History with parameters
    console.log("2. Testing /funding/history with symbol...");
    try {
      const fundingHistory = await axios.get(`${baseUrl}/funding/history`, {
        params: {
          symbol: "BTC-PERP",
          limit: 10,
        },
      });
      console.log(
        `✅ Funding History: ${Array.isArray(fundingHistory.data) ? fundingHistory.data.length : "Unknown"} entries`
      );

      if (
        Array.isArray(fundingHistory.data) &&
        fundingHistory.data.length > 0
      ) {
        console.log("Sample funding data:", fundingHistory.data[0]);
      }
    } catch (err) {
      console.log(
        "⚠️ Funding history failed:",
        err.response?.status,
        err.response?.data
      );
    }
    console.log("");

    // Test 3: Latest Ticker
    console.log("3. Testing /ticker/latest...");
    const ticker = await axios.get(`${baseUrl}/ticker/latest`);
    console.log(
      `✅ Latest Ticker: ${Array.isArray(ticker.data.tickers) ? ticker.data.tickers.length : 1} ticker(s)`
    );

    if (ticker.data) {
      const sample = ticker.data.tickers;
      console.log("Sample tickers:", sample.slice(0, 3));
      if (sample.length > 5) {
        console.log("...");
        console.log(sample.slice(-3));
      }
    }
    console.log("");

    // Test 4: Specific symbol ticker
    console.log("4. Testing /ticker/latest with symbols...");
    try {
      const btcTicker = await axios.get(
        `${baseUrl}/ticker/latest?symbols=BERA-PERP,JUP-PERP`
      );
      console.log("✅ sample tickers:", btcTicker.data);
    } catch (err) {
      console.log(
        "⚠️ ticker(s) failed:",
        err.response?.status,
        err.response?.statusText
      );
    }
    console.log("");

    // Test 5: Exchange Info with symbols
    console.log("5. Testing /exchangeInfo with parameters...");
    const exchangeInfo2 = await axios.get(
      `${baseUrl}/exchangeInfo?symbols=BERA-PERP,JUP-PERP`
    );
    console.log(exchangeInfo2.data);

    console.log("");
  } catch (error) {
    console.error("❌ API Test failed:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });
  }
}

testVestAPI();
