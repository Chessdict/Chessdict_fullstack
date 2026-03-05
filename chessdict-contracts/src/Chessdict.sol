// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// @title Chessdict
// @author shealtielanz and 0xdice
/// Ths is the version 1 of the Chessdict smart contract, here we define the basic structure of the contract which
/// is for staking for either single players or teams in chess tournaments.
/// The contract will allow users to stake ERC20 tokens and will keep track of the stakes made and also the games will
/// be tracked via the game Ids which will be mapped to structs containing the relevant information about the game.
/// The contract will also have functions to distribute rewards to the winners of the games based on the winners which will be
/// determined for now by a trusted oracle/redemption address.
/// The contract will also have functions to allow users to withdraw their stakes and rewards after the games are over.
contract Chessdict {
    // Importing SafeERC20 for safe token operations.
    using SafeERC20 for IERC20;

    //struct for games types
    // 1 v 1 only games
    struct GameSingle {
        address player1;
        address player2;
        address token;
        uint256 stake;
        address winner;
        uint256 totalPrize;
        bool created;
        bool isActive;
    }
    //when a game is

    // tournament games
    struct GameTournament {
        address[] players;
        uint256 NumberOfPlayers;
        address token;
        uint256 stake;
        address winner;
        uint256 totalStakes;
        uint256 totalPrize;
        uint256 sponsoredAmount;
        uint256 startTimeStamp;
        bool created;
        bool isActive;
        bool sponsored;
    }

    mapping(uint256 => GameSingle) public idToGamesSingle;
    mapping(uint256 => GameTournament) public idToGamesTournament;
    uint256 public gameId;

    //mapping to track tournament winners and their amounts
    mapping(uint256 => mapping(address => uint256)) public tournamentWinners;

    address public owner;
    uint256 public feePercentage; // Fee percentage in basis points (e.g., 100 = 1%)
    address public redeemer;

    mapping(address => uint256) public feeBalances;
    mapping(address => bool) public supportedTokens;
    address[] public tokenList;

    ///events

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RedeemerUpdated(address indexed previousRedeemer, address indexed newRedeemer);
    event FeePercentageUpdated(uint256 oldFeePercentage, uint256 newFeePercentage);
    event FeesCollected(address indexed token, address indexed reciever, uint256 amount);
    event GameCancelled(uint256 indexed gameId, address indexed reciever, uint256 sponsoredAmount);

    // Token Management Events
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);

    // Single Game Events
    event GameSingleCreated(uint256 indexed gameId, address indexed player1, address token, uint256 stake);
    event GameSingleJoined(uint256 indexed gameId, address indexed player2);
    event GameSingleCancelled(uint256 indexed gameId, address indexed player1, uint256 refundAmount);
    event WinnerSetSingle(uint256 indexed gameId, address indexed winner, bool isDraw);
    event PrizeClaimedSingle(uint256 indexed gameId, address indexed winner, uint256 prize, uint256 fee);
    event GameSingleRedeemed(uint256 indexed gameId, address indexed winner, uint256 prize, uint256 fee, bool isDraw);

    // Tournament Game Events
    event GameTournamentCreated(uint256 indexed gameId, uint256 numberOfPlayers, address token, uint256 stake);
    event SponsoredGameTournamentCreated(
        uint256 indexed gameId,
        uint256 numberOfPlayers,
        address token,
        uint256 stake,
        uint256 sponsoredAmount,
        address sponsor
    );
    event GameTournamentJoined(uint256 indexed gameId, address indexed player, uint256 totalStakes);
    event GameTournamentStarted(uint256 indexed gameId);
    event RefundClaimedTournament(uint256 indexed gameId, address indexed player, uint256 refundAmount);
    event WinnersSetTournament(uint256 indexed gameId, address[] winners, uint256[] amounts);
    event PrizeClaimedTournament(uint256 indexed gameId, address indexed winner, uint256 prize, uint256 fee);
    event GameTournamentRedeemed(uint256 indexed gameId, address[] winners, uint256[] amounts);

    //modifiers

    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }

    modifier onlyRedeemer() {
        require(msg.sender == redeemer, "Not authorized redeemer");
        _;
    }

    modifier tokenSupported(address token) {
        require(supportedTokens[token], "Token not supported");
        _;
    }

    // Constructor to initialize the contract with owner and fee percentage

    constructor(uint256 _feePercentage, address[] memory initialTokens) {
        require(_feePercentage <= 10000, "Fee percentage too high");
        owner = msg.sender;
        feePercentage = _feePercentage;
        for (uint256 i = 0; i < initialTokens.length; i++) {
            supportedTokens[initialTokens[i]] = true;
            tokenList.push(initialTokens[i]);
        }
    }

    function addToken(address token) external onlyOwner {
        require(!supportedTokens[token], "Already added");
        supportedTokens[token] = true;
        tokenList.push(token);
        emit TokenAdded(token);
    }

    function removeToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        // Remove the token from the list
        for (uint256 i = 0; i < tokenList.length; i++) {
            if (tokenList[i] == token) {
                tokenList[i] = tokenList[tokenList.length - 1];
                tokenList.pop();
                break;
            }
        }
        emit TokenRemoved(token);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setRedeemer(address newRedeemer) external onlyOwner {
        require(newRedeemer != address(0), "Redeemer cannot be zero address");
        redeemer = newRedeemer;
    }

    function setFeePercentage(uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage <= 10000, "Fee percentage too high");
        uint256 oldFeePercentage = feePercentage;
        feePercentage = newFeePercentage;
        emit FeePercentageUpdated(oldFeePercentage, newFeePercentage);
    }

    function collectFees(address token, address reciever, uint256 amount) external onlyOwner {
        // ensure reciever is not zero address
        require(reciever != address(0), "Reciever cannot be zero address");

        require(amount <= feeBalances[token], "Insufficient fee balance");
        feeBalances[token] -= amount;
        IERC20(token).safeTransfer(reciever, amount);
        emit FeesCollected(token, reciever, amount);
    }

    // functions for creating and joiing games
    //FOR 1 V 1 GAMES

    function createGameSingle(address token, uint256 stake) external tokenSupported(token) returns (uint256) {
        require(stake != 0, "stake cannot be zero");
        // Transfer stake from player1
        IERC20(token).safeTransferFrom(msg.sender, address(this), stake);

        gameId++;
        idToGamesSingle[gameId] = GameSingle({
            player1: msg.sender,
            player2: address(0),
            token: token,
            stake: stake,
            winner: address(0),
            totalPrize: stake * 2,
            isActive: false,
            created: true
        });

        emit GameSingleCreated(gameId, msg.sender, token, stake);

        return gameId;
    }

    function joinGameSingle(uint256 _gameId) external {
        GameSingle memory game = idToGamesSingle[_gameId];
        require(game.created, "Game does not exist");
        require(!game.isActive, "Game already started");
        require(game.winner == address(0), "Game already finalized as draw, won or cancalled");

        // Transfer stake from player2
        IERC20(game.token).safeTransferFrom(msg.sender, address(this), game.stake);

        idToGamesSingle[_gameId].isActive = true;
        idToGamesSingle[_gameId].player2 = msg.sender;

        emit GameSingleJoined(_gameId, msg.sender);
    }

    function cancelGameSingle(uint256 _gameId) external {
        GameSingle storage game = idToGamesSingle[_gameId];
        require(game.created, "Game does not exist");
        require(!game.isActive, "Game already started");
        require(msg.sender == game.player1, "Not authorized to cancel this game");
        require(game.winner == address(0), "Game already has a winner");

        uint256 refundAmount = game.stake;

        // Refund stake to player1
        IERC20(game.token).safeTransfer(game.player1, refundAmount);

        emit GameSingleCancelled(_gameId, game.player1, refundAmount);

        idToGamesSingle[_gameId].winner = address(this); // Indicate cancellation with contract address
    }

    //function to set the winner by redeemer letting them claim the prize
    function setWinnerSingle(uint256 _gameId, address winner, bool isDraw) external onlyRedeemer {
        GameSingle storage game = idToGamesSingle[_gameId];
        require(game.created, "Game does not exist");
        require(game.isActive, "Game not started yet");
        if (isDraw) {
            require(game.winner == address(0), "no winner in draw scenario");
            game.winner = address(0xdead); // Indicate draw with dead address
            emit WinnerSetSingle(_gameId, address(0xdead), isDraw);

            // Mark game as inactive
            game.isActive = false;
            return;
        }

        require(winner == game.player1 || winner == game.player2, "Winner must be one of the players");
        game.winner = winner;
        game.isActive = false;

        emit WinnerSetSingle(_gameId, winner, isDraw);
    }

    function claimPrizeSingle(uint256 _gameId) external {
        //do we need non-reentrant modifies here?
        GameSingle storage game = idToGamesSingle[_gameId];
        require(game.created, "Game does not exist");
        require(game.winner != address(0), "Game has no winner set");
        require(game.totalPrize > 0, "Winnings has already be distributed");
        require(!game.isActive, "game isActive");

        //if the game was a draw
        if (game.winner == address(0xdead)) {
            // Refund stakes to both players
            IERC20(game.token).safeTransfer(game.player1, game.stake);
            IERC20(game.token).safeTransfer(game.player2, game.stake);
            emit PrizeClaimedSingle(_gameId, address(this), game.stake * 2, 0);
            // Mark game as inactive
            idToGamesSingle[_gameId].isActive = false;
            game.totalPrize = 0;
            return;
        }

        uint256 fee = (game.totalPrize * feePercentage) / 10000;
        uint256 prizeAfterFee = game.totalPrize - fee;
        feeBalances[game.token] += fee;

        // Transfer prize to winner
        IERC20(game.token).safeTransfer(game.winner, prizeAfterFee);
        game.isActive = false;
        game.totalPrize = 0;

        emit PrizeClaimedSingle(_gameId, game.winner, prizeAfterFee, fee);
    }

    function redeemGameSingle(uint256 _gameId, address winner, bool isDraw) external onlyRedeemer {
        GameSingle storage game = idToGamesSingle[_gameId];
        require(game.created, "Game does not exist");
        require(game.isActive, "Game not started yet");
        require(game.totalPrize > 0, "Winnings has already be distributed");

        //if the game is a draw
        if (isDraw) {
            require(game.winner == address(0), "no winner in draw scenario");
            game.winner = address(this); // Indicate draw with contract address

            // Refund stakes to both players
            IERC20(game.token).safeTransfer(game.player1, game.stake);
            IERC20(game.token).safeTransfer(game.player2, game.stake);

            emit GameSingleRedeemed(_gameId, address(this), game.stake * 2, 0, isDraw);

            // Mark game as inactive
            game.isActive = false;
            game.totalPrize = 0;
            return;
        }

        require(winner == game.player1 || winner == game.player2, "Winner must be one of the players");

        game.winner = winner;

        uint256 fee = (game.totalPrize * feePercentage) / 10000;
        uint256 prizeAfterFee = game.totalPrize - fee;
        feeBalances[game.token] += fee;

        // Transfer prize to winner
        IERC20(game.token).safeTransfer(winner, prizeAfterFee);

        emit GameSingleRedeemed(_gameId, winner, prizeAfterFee, fee, isDraw);

        // Mark game as inactive
        game.isActive = false;
        game.totalPrize = 0;
    }

    // FOR TOURNAMENT GAMES

    function createGameTournament(address token, uint256 NumberOfPlayers, uint256 stake, uint256 startTimeStamp)
        external
        tokenSupported(token)
        returns (uint256)
    {
        require(NumberOfPlayers > 2, "more than two players required");
        require(stake != 0, "stake cannot be zero");
        require(startTimeStamp > block.timestamp, "start time must be in future");

        // Transfer stake from creator
        IERC20(token).safeTransferFrom(msg.sender, address(this), stake);

        // msg.sender will also be added as a player
        address[] memory players = new address[](1); //#audit ensure to check properly initialized dynamic array
        players[0] = msg.sender;

        gameId++;
        require(idToGamesTournament[gameId].created == false, "Game ID already exists");
        idToGamesTournament[gameId] = GameTournament({
            players: players,
            NumberOfPlayers: NumberOfPlayers,
            token: token,
            stake: stake,
            winner: address(0),
            totalStakes: stake,
            totalPrize: stake * NumberOfPlayers,
            sponsoredAmount: 0,
            startTimeStamp: startTimeStamp,
            isActive: false,
            created: true,
            sponsored: false
        });

        emit GameTournamentCreated(gameId, NumberOfPlayers, token, stake);
        return gameId;
    }

    function createSponsoredGameTournament(
        address token,
        uint256 NumberOfPlayers,
        uint256 stake,
        uint256 additionalPrize,
        uint256 startTimeStamp,
        bool join
    ) external tokenSupported(token) returns (uint256) {
        require(NumberOfPlayers > 2, "more than two players required");
        require(additionalPrize != 0, "additional prize cannot be zero");
        require(startTimeStamp > block.timestamp, "start time must be in future");

        // Transfer additional prize from sponsor
        uint256 amountToTransfer = join ? additionalPrize + stake : additionalPrize;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountToTransfer);

        address[] memory players = new address[](1);

        if (join) {
            // msg.sender will also be added as a player
            players[0] = msg.sender;
        }

        gameId++;
        idToGamesTournament[gameId] = GameTournament({
            players: join ? players : new address[](0),
            NumberOfPlayers: NumberOfPlayers,
            token: token,
            stake: stake,
            winner: address(0),
            totalStakes: join ? stake : 0,
            totalPrize: stake > 0 ? (stake * NumberOfPlayers) + additionalPrize : additionalPrize,
            sponsoredAmount: additionalPrize,
            startTimeStamp: startTimeStamp,
            isActive: false,
            created: true,
            sponsored: true
        });

        emit SponsoredGameTournamentCreated(gameId, NumberOfPlayers, token, stake, additionalPrize, msg.sender);
        return gameId;
    }

    function joinGameTournament(uint256 _gameId) external {
        GameTournament storage game = idToGamesTournament[_gameId];
        require(game.created, "Game does not exist");
        require(!game.isActive, "Game already started");
        require(game.winner == address(0), "Game has ended or has been cancelled");

        //check if msg.sender is in players list
        bool hasJoined = false;

        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.players[i] == msg.sender) {
                hasJoined = true;
                break;
            }
        }
        require(!hasJoined, "Already joined this game");

        // Transfer stake from player
        if (game.stake > 0) {
            IERC20(game.token).safeTransferFrom(msg.sender, address(this), game.stake);
        }

        //mark player as joined
        game.players.push(msg.sender);
        game.totalStakes += game.stake;

        emit GameTournamentJoined(_gameId, msg.sender, game.totalStakes);

        //ensures all have joined before activating the game or start time has been reached
        if (game.totalStakes + game.sponsoredAmount >= game.totalPrize || game.startTimeStamp <= block.timestamp) {
            //@audit check should require that greater than two players have joined atleast if not it's not a tournament anymore.
            game.isActive = true;
        }
    }

    // only the redeemer can cancel a tournament game to avoid abuse by players or Dos attacks
    // this function can be called if not all players have joined yet
    function retrieveSponsoredAmount(uint256 _gameId, address reciever, uint256 sponsoredAmount)
        external
        onlyRedeemer
    {
        GameTournament storage game = idToGamesTournament[_gameId];
        require(game.created, "Game does not exist");
        require(sponsoredAmount == game.sponsoredAmount, "sponsored amount exceeds");
        require(game.sponsored, "Not a sponsored game");

        // Refund sponsored amount to reciever
        if (sponsoredAmount > 0) {
            IERC20(game.token).safeTransfer(reciever, sponsoredAmount);
            game.sponsoredAmount -= sponsoredAmount;
            game.totalPrize -= sponsoredAmount;
        }
        game.winner = address(this); // Indicate cancellation with contract address

        // Mark game as inactive
        game.isActive = false;
        game.sponsored = false;

        //emit event for cancellation
        emit GameCancelled(_gameId, reciever, sponsoredAmount);
    }

    function exitTournament(uint256 _gameId) external {
        GameTournament storage game = idToGamesTournament[_gameId];
        require(game.created, "Game does not exist");
        require(!game.isActive, "Game already started or active");
        require(game.winner == address(0), "Game has ended");

        //check if msg.sender is in players list and has joined
        bool isPlayer = false;
        uint256 playerIndex = 0;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.players[i] == msg.sender) {
                isPlayer = true;
                playerIndex = i;
                break;
            }
        }
        require(isPlayer, "Not authorized to claim refund for this game");

        //remove player from players list
        game.players[playerIndex] = game.players[game.players.length - 1];
        game.players.pop();
        game.totalStakes -= game.stake;

        uint256 refundAmount = game.stake;

        // Refund stake to player
        if (refundAmount > 0) {
            IERC20(game.token).safeTransfer(msg.sender, refundAmount);
        }

        emit RefundClaimedTournament(_gameId, msg.sender, refundAmount);
    }

    // function to set the winners by redeemer letting them claim the prize
    // this uses a tournament winner mapping to allow multiple winners
    function setWinnersTournament(uint256 _gameId, address[] memory winners, uint256[] memory amounts)
        external
        onlyRedeemer
    {
        GameTournament memory game = idToGamesTournament[_gameId];
        require(game.created, "Game does not exist");
        require(game.isActive, "Game not started yet");
        require(game.winner == address(0), "Game already has a winner/redeemed/cancelled");
        require(winners.length == amounts.length, "Winners and amounts length mismatch");

        uint256 totalPayout;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalPayout += amounts[i];
        }
        require(totalPayout == game.totalPrize, "Total payout exceeds total prize");

        //checks that the winnersare correct and joined the game
        for (uint256 i = 0; i < winners.length; i++) {
            bool isPlayer = false;
            for (uint256 j = 0; j < game.players.length; j++) {
                if (game.players[j] == winners[i]) {
                    isPlayer = true;
                    break;
                }
            }
            require(isPlayer, "Winner must be one of the players");

            //store winner and amount in mapping
            tournamentWinners[_gameId][winners[i]] = amounts[i];
        }

        idToGamesTournament[_gameId].isActive = false;
        idToGamesTournament[_gameId].winner = winners[0];

        emit WinnersSetTournament(_gameId, winners, amounts);
    }

    function claimPrizeTournament(uint256 _gameId) external {
        GameTournament memory game = idToGamesTournament[_gameId];
        require(game.created, "Game does not exist");
        require(game.winner != address(0), "Game has no winners set");

        uint256 amount = tournamentWinners[_gameId][msg.sender];
        require(amount > 0, "No prize for caller");

        //collect fee and transfer amount
        uint256 fee = (amount * feePercentage) / 10000;
        feeBalances[game.token] += fee;

        IERC20(game.token).safeTransfer(msg.sender, amount - fee);

        emit PrizeClaimedTournament(_gameId, msg.sender, amount - fee, fee);

        //reset winner amount to prevent double claims
        tournamentWinners[_gameId][msg.sender] = 0;
    }

    // redeem support mutiple winners with different amounts
    // all handled and distributed by the redeemer.
    function redeemGameTournament(uint256 _gameId, address[] memory winners, uint256[] memory amounts)
        external
        onlyRedeemer
    {
        GameTournament storage game = idToGamesTournament[_gameId];
        require(game.created, "Game does not exist");
        require(game.isActive, "Game not started yet");
        require(game.winner == address(0), "Game already has a winner/redeemed/cancelled");
        require(winners.length == amounts.length, "Winners and amounts length mismatch");

        uint256 totalPayout;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalPayout += amounts[i];
        }
        require(totalPayout <= game.totalPrize, "Total payout exceeds total prize");

        // Distribute prizes to winners
        //checks that the winner joined the game
        for (uint256 i = 0; i < winners.length; i++) {
            bool isPlayer = false;
            for (uint256 j = 0; j < game.players.length; j++) {
                if (game.players[j] == winners[i]) {
                    isPlayer = true;
                    break;
                }
            }
            require(isPlayer, "Winner must be one of the players");

            //collects fees and transfer amounts
            uint256 fee = (amounts[i] * feePercentage) / 10000;
            feeBalances[game.token] += fee;

            IERC20(game.token).safeTransfer(winners[i], amounts[i] - fee);
        }

        emit GameTournamentRedeemed(_gameId, winners, amounts);

        game.winner = winners[0]; // Indicate game has been redeemed

        // Mark game as inactive
        delete idToGamesTournament[_gameId];
    }

    // Getter function to retrieve the list of supported tokens
    function getSupportedTokens() external view returns (address[] memory) {
        return tokenList;
    }

    /// Here we create getter functions to retrieve certain information from the contract

    function getGameSingle(uint256 _gameId) external view returns (GameSingle memory) {
        return idToGamesSingle[_gameId];
    }

    function getGameTournament(uint256 _gameId) external view returns (GameTournament memory) {
        return idToGamesTournament[_gameId];
    }
}
