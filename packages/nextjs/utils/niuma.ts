import deployedContracts from "~~/contracts/deployedContracts";

export const NIUMA = deployedContracts[10143].NiumaWorks;
export const EXPLORER = "https://testnet.monadexplorer.com";
export const DEMO_CHARACTERS = [4, 2, 3];
export const CHARACTER_NAMES: Record<number, string> = { 4: "土豆工人", 2: "宇航柴犬", 3: "小包子" };
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export type RunResult = { stars: number; timeMs: number };
