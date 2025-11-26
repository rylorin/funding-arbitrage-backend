// Solution 1: Import explicite du type de la superclasse et casting
import { asterPerpExchange as exchange } from "./src/exchanges/AsterPerpExchange";
import { ExchangeConnector } from "./src/exchanges/ExchangeConnector";

// Solution 1A: Casting explicite vers ExchangeConnector
const typedExchange1: ExchangeConnector = exchange as ExchangeConnector;
console.log("✅ Solution 1A - exchange.name:", typedExchange1.name);

// Solution 1B: Utilisation du type intersected
type AsterPerpExchangeInstance = ExchangeConnector & typeof exchange;
const typedExchange2 = exchange as AsterPerpExchangeInstance;
console.log("✅ Solution 1B - exchange.name:", typedExchange2.name);

// Solution 2: Déclaration d'un type d'interface qui préserve l'héritage
interface ExchangeInstanceType extends ExchangeConnector {}

// Solution 2A: Casting avec interface
const typedExchange3: ExchangeInstanceType = exchange as ExchangeInstanceType;
console.log("✅ Solution 2A - exchange.name:", typedExchange3.name);
