import { JestConfigWithTsJest } from "ts-jest";

const jestConfig: JestConfigWithTsJest = {
  // [...]
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@config/(.*)$": "<rootDir>/src/config/$1",
    "^@models/(.*)$": "<rootDir>/src/models/$1",
    "^@controllers/(.*)$": "<rootDir>/src/controllers/$1",
    "^@services/(.*)$": "<rootDir>/src/services/$1",
    "^@middleware/(.*)$": "<rootDir>/src/middleware/$1",
    "^@routes/(.*)$": "<rootDir>/src/routes/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@jobs/(.*)$": "<rootDir>/src/jobs/$1",
    "^@websocket/(.*)$": "<rootDir>/src/websocket/$1",
    "^@types/(.*)$": "<rootDir>/src/types/$1",
    "^@extended/(.*)$": "<rootDir>/src/extended/$1",
    // "^@x10xchange/examples/(.*)$": "<rootDir>/x10xchange/examples/$1",
    // "^@x10xchange/stark-crypto-wrapper-wasm$": "<rootDir>/src/__mocks__/@x10xchange/stark-crypto-wrapper-wasm.ts",
  },
  transform: {
    // '^.+\\.[tj]sx?$' to process ts,js,tsx,jsx with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process ts,js,tsx,jsx,mts,mjs,mtsx,mjsx with `ts-jest`
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      {
        tsconfig: "./tsconfig.json",
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: ["node_modules/(?!(?:@noble/.*|lodash-es|@x10xchange))"],
};

export default jestConfig;
