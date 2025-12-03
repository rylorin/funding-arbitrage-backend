// Mock pour @x10xchange/stark-crypto-wrapper-wasm
// Ce mock remplace le module WASM qui ne fonctionne pas avec Jest

// Mock des fonctions principales utilisées dans le code
export const get_order_msg = (...args) => {
  // Génère un hash factice basé sur les arguments
  const mockHash = Buffer.from(args.map((arg) => String(arg).charCodeAt(0)).join(""))
    .toString("hex")
    .padEnd(64, "0");

  return "0x" + mockHash.substring(0, 64);
};

export const get_transfer_msg = (...args) => {
  // Génère un hash factice basé sur les arguments
  const mockHash = Buffer.from(args.map((arg) => String(arg).charCodeAt(0)).join(""))
    .toString("hex")
    .padEnd(64, "0");

  return "0x" + mockHash.substring(0, 64);
};

export const get_obj_msg = (...args) => {
  // Génère un hash factice basé sur les arguments
  const mockHash = Buffer.from(args.map((arg) => String(arg).charCodeAt(0)).join(""))
    .toString("hex")
    .padEnd(64, "0");

  return "0x" + mockHash.substring(0, 64);
};

export const get_starknet_domain_obj = (...args) => {
  // Génère un hash factice basé sur les arguments
  const mockHash = Buffer.from(args.map((arg) => String(arg).charCodeAt(0)).join(""))
    .toString("hex")
    .padEnd(32, "0");

  return "0x" + mockHash.substring(0, 32);
};

export const generate_private_key_from_eth_signature = (sig) => {
  return "0x" + "1".repeat(64);
};

export const sign_message = (message) => {
  return "0x" + "2".repeat(128);
};

// Export par défaut pour compatibilité
export default {
  get_order_msg,
  get_transfer_msg,
  get_obj_msg,
  get_starknet_domain_obj,
  generate_private_key_from_eth_signature,
  sign_message,
};
