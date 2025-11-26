// Solution 3: Vérification de l'héritage et correction de l'export
import { AsterPerpExchange as ExchangeClass } from "./src/exchanges/AsterPerpExchange";

// Testons l'héritage en créant une nouvelle instance
const testInstance = new ExchangeClass();
console.log("New instance type:", typeof testInstance);
console.log("New instance .name:", (testInstance as any).name);

// Solution: Créer une instance typée correctement
const exchangeTyped: ExchangeClass = new ExchangeClass();

// Test de la solution dans le contexte du test
console.log("✅ Solution 3 - Typed exchange name:", (exchangeTyped as any).name);
