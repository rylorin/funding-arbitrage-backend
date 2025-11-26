// Test pour diagnostiquer le problème TypeScript avec AsterPerpExchange
import { AsterPerpExchange as Exchange, asterPerpExchange as exchange } from "./src/exchanges/AsterPerpExchange";

// Test 1: Vérification des types
console.log("Type de exchange:", typeof exchange);
console.log("Instanceof Exchange?", exchange instanceof Exchange);
console.log("Heritage ExchangeConnector?", exchange instanceof ExchangeConnector);

// Test 2: Accès aux propriétés de la superclasse
console.log("exchange.name:", (exchange as any).name);
console.log("exchange.config:", (exchange as any).config);

// Test 3: Test avec casting explicite
const typedExchange = exchange as Exchange;
console.log("exchange.name (avec cast):", typedExchange.name);

// Test 4: Test de la propriété name
try {
  console.log("Testing direct access to .name property:");
  console.log(exchange.name);
  console.log("✅ Success: name property accessible");
} catch (error) {
  console.log("❌ Error accessing name property:", error.message);
}
