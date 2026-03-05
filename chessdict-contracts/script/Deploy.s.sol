// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Chessdict.sol";

contract DeployChessdict is Script {
    function run() external returns (Chessdict) {
        // Read deployment parameters from environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 feePercentage = vm.envOr("FEE_PERCENTAGE", uint256(500)); // Default 5% (500 basis points)
        address redeemerAddress = vm.envOr("REDEEMER_ADDRESS", address(0));

       
        address[] memory initialTokens; // implement based on test chain requirements

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Chessdict contract
        console.log("Number of initial tokens:", initialTokens.length);

        Chessdict chessdict = new Chessdict(feePercentage, initialTokens);

        console.log("Chessdict deployed at:", address(chessdict));
        console.log("Owner:", chessdict.owner());
        console.log("Fee Percentage:", chessdict.feePercentage());

        // Set redeemer if provided
        if (redeemerAddress != address(0)) {
            chessdict.setRedeemer(redeemerAddress);
            console.log("Redeemer set successfully");
        } else {
            console.log("No redeemer address provided.");
        }

        // Log supported tokens
        if (initialTokens.length > 0) {
            console.log("\nSupported tokens:");
            for (uint256 i = 0; i < initialTokens.length; i++) {
                console.log("  -", initialTokens[i]);
            }
        }

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("Contract Address:", address(chessdict));
        console.log("Owner:", chessdict.owner());
        console.log("Fee Percentage:", chessdict.feePercentage(), "basis points");
        console.log("Redeemer:", chessdict.redeemer());

        return chessdict;
    }

}
