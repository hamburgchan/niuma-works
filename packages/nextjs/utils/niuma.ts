import demos from "~~/contracts/demoCharacters.json";
import deployedContracts from "~~/contracts/deployedContracts";

export const NIUMA = deployedContracts[10143].NiumaWorks;
export const EXPLORER = "https://testnet.monadexplorer.com";
export const DEMO_EMPLOYEES = demos;
export const DEMO_CHARACTERS = demos.map(character => character.id);
export const CHARACTER_NAMES: Record<number, string> = Object.fromEntries(
  demos.map(character => [character.id, character.name]),
);
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export type RunResult = { stars: number; timeMs: number };
