import { chessdictAbi } from "./chessdict-abi";
import { networkConfig } from "./network-config";

export const CHESSDICT_ADDRESS = networkConfig.chessdictAddress;
export const CHESSDICT_CHAIN_ID = networkConfig.chainId;

/** Default stake token — switches with NEXT_PUBLIC_NETWORK */
export const DEFAULT_STAKE_TOKEN = networkConfig.usdcAddress;

export { chessdictAbi };
