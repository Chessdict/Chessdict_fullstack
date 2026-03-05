# Chessdict Smart Contracts

This project contains the smart contract aspect of Chessdict.

## Contract Overview

The Chessdict smart contract handles staking and payouts for chess games and tournaments.

### Features

**Supported Assets**
- Stablecoin deposits (owner-configurable)
- Mapping to track allowed tokens
- customizable by the owner

**Staking System**
- Stake function for players to deposit funds with a game ID
- Game ID tracking for both single games and tournaments
- Single game: 2 players must stake before game begins
- Tournament: Multiple players (>2) can stake for the same game ID
- Mapping to track all game stakes
- Mapping to track game ID and winning price for each game


**Claim & Payouts**
- Claim function (callable only by redeemer)
- Redeemer passes winner address and game ID
- Transfers winning amount to the winner
- Game fee is deducted from winnings and stored in contract

**Admin Functions** (Owner Only)
- Set/update allowed tokens
- Configure redeemer address
- Withdraw accumulated fees
- Rescue funds (emergency recovery)

**Key Roles**
- Owner: Contract administrator, manages configuration
- Redeemer: Authorized to finalize games and distribute winnings
- Players: Stake funds and claim winnings

## Setup

This is a Foundry project. To get started:

```bash
# Install dependencies
forge install

# Build the project
forge build

# Run tests
forge test
```

## Deployment

```bash
forge script script/Deploy.s.sol --rpc-url <your_rpc_url> --private-key <your_private_key> --broadcast
```
