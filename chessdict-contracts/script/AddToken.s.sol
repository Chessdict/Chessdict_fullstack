// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Chessdict.sol";

/// @notice Run this script to add token support to the already-deployed Chessdict contract.
///         Must be run from the contract OWNER wallet.
///
/// Usage:
///   forge script script/AddToken.s.sol \
///     --rpc-url https://mainnet.base.org \
///     --private-key $PRIVATE_KEY \
///     --broadcast
contract AddTokenScript is Script {
    // ── Config ─────────────────────────────────────────────────────────────
    address constant CHESSDICT  = 0xaBb21D8466df3753764CA84d51db0ed65e155Da9;
    address constant USDC       = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // Base Mainnet USDC

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        Chessdict chessdict = Chessdict(CHESSDICT);

        // Check if already supported to avoid wasted gas
        bool alreadySupported = chessdict.supportedTokens(USDC);
        if (alreadySupported) {
            console.log("USDC already supported — nothing to do.");
        } else {
            chessdict.addToken(USDC);
            console.log("SUCCESS: USDC added to supported tokens.");
            console.log("Token address:", USDC);
            console.log("Contract:     ", CHESSDICT);
        }
        vm.stopBroadcast();
    }
}
