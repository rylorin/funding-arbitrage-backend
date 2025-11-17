import wasmLibStarkInit from "@x10xchange/stark-crypto-wrapper-wasm";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

export const tryInitWasm = async () => {
  try {
    const wasmDir = dirname(require.resolve("@x10xchange/stark-crypto-wrapper-wasm"));
    const wasmBuffer = readFileSync(`${wasmDir}/stark_crypto_wrapper_wasm_bg.wasm`);
    await wasmLibStarkInit({ module_or_path: wasmBuffer });
  } catch {
    console.warn("WASM initialization failed, falling back to JS implementations");
  }
};
