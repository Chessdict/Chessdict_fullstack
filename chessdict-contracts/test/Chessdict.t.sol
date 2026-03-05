import "forge-std/Test.sol";
import "../src/Chessdict.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}

contract ChessdictTest is Test {
    using SafeERC20 for IERC20;

    Chessdict public chessdict;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    address public owner;
    address public user;
    address public sponsor;
    address public redeemer;
    address public player1;
    address public player2;
    address public player3;
    address public player4;
    address public player5;
    address public player6;

    function setUp() public {
        owner = address(this);
        user = address(0x1234);
        redeemer = makeAddr("redeemer");
        player1 = makeAddr("player1");
        player2 = makeAddr("player2");
        player3 = makeAddr("player3");
        player4 = makeAddr("player4");
        player5 = makeAddr("player5");
        player6 = makeAddr("player6");
        sponsor = makeAddr("sponsor");

        tokenA = new MockERC20("TokenA", "TKA");
        tokenB = new MockERC20("TokenB", "TKB");

        address[] memory initialTokens = new address[](1);
        initialTokens[0] = address(tokenA);

        chessdict = new Chessdict(500, initialTokens); // 5% fee
        chessdict.setRedeemer(redeemer);
    }

    function testAddToken() public {
        chessdict.addToken(address(tokenB));
        assert(chessdict.supportedTokens(address(tokenB)) == true);
    }

    function testRemoveToken() public {
        chessdict.removeToken(address(tokenA));
        assert(chessdict.supportedTokens(address(tokenA)) == false);
    }

    function testOnlyOwnerCanAddToken() public {
        vm.prank(user);
        vm.expectRevert("Not contract owner");
        chessdict.addToken(address(tokenB));
    }

    function testOnlyOwnerCanRemoveToken() public {
        vm.prank(user);
        vm.expectRevert("Not contract owner");
        chessdict.removeToken(address(tokenA));
    }

    function testTransferOwnership() public {
        chessdict.transferOwnership(user);
        assert(chessdict.owner() == user);
    }

    function testSetFeePercentage() public {
        chessdict.setFeePercentage(300); // 3%
        assert(chessdict.feePercentage() == 300);
    }

    function testOnlyOwnerCanSetFeePercentage() public {
        vm.prank(user);
        vm.expectRevert("Not contract owner");
        chessdict.setFeePercentage(300);
    }

    // we test that we create a single game and verify its parameters
    function testCreateAndJoinGame() public {
        // we first determine the amount of stake.

        uint256 stakeAmount = 5 * 10 ** tokenA.decimals(); // suppose the user wants to dict a game of 5 stable tokens.

        // we first transfer some tokens to the players from the owner
        vm.startPrank(owner);
        tokenA.transfer(player1, stakeAmount);
        tokenA.transfer(player2, stakeAmount);
        tokenA.transfer(player3, stakeAmount);
        vm.stopPrank();

        // we first approve the contract to spent the tokens on the user's behalf
        vm.prank(player1);
        tokenA.approve(address(chessdict), stakeAmount);

        // we now create the game
        vm.prank(player1);
        uint256 gameId = chessdict.createGameSingle(address(tokenA), stakeAmount);

        // let's check the game was created as expected
        Chessdict.GameSingle memory game = chessdict.getGameSingle(gameId);
        assert(game.player1 == player1);
        assert(game.player2 == address(0));
        assert(game.token == address(tokenA));
        assert(game.stake == stakeAmount);
        assert(game.isActive == false);
        assert(game.created == true);
        console.log("Game created with ID:", gameId);

        // let player2 join the game
        vm.startPrank(player2);
        tokenA.approve(address(chessdict), stakeAmount);
        chessdict.joinGameSingle(gameId);
        vm.stopPrank();

        // let's check the game status after player2 joined

        assert(chessdict.getGameSingle(gameId).isActive == true);
        assert(chessdict.getGameSingle(gameId).player2 == player2);

        console.log("Player2 joined the game with ID:", gameId);

        // lets check that no one else can join the game
        vm.prank(player3);
        tokenA.approve(address(chessdict), stakeAmount);
        vm.expectRevert("Game already started");
        chessdict.joinGameSingle(gameId);
        vm.stopPrank();

        // we check that the a non active game can be cancelled by a player
        //we first create a new game
        vm.prank(player3);
        // tokenA.approve(address(chessdict), stakeAmount);
        uint256 gameId2 = chessdict.createGameSingle(address(tokenA), stakeAmount);

        // now player3 cancels the game
        vm.prank(player3);
        chessdict.cancelGameSingle(gameId2);

        // we check that that player3 got back his stake
        uint256 player3Balance = tokenA.balanceOf(player3);
        assert(player3Balance == stakeAmount);
        console.log("Player3 cancelled the game with ID:", gameId2);

        // let's check that trying to cancel an active game reverts
        vm.prank(player1);
        vm.expectRevert("Game already started");
        chessdict.cancelGameSingle(gameId);

        console.log("address of this contract:", address(this));
        console.log("owner of chessdict contract:", chessdict.owner());

        // now we check that a winnder can clain the prize.

        // we simulate that player1 won the game
        vm.prank(redeemer);
        chessdict.setWinnerSingle(gameId, player1, false);

        // we now let player1 claim the prize
        uint256 player1BalanceBefore = tokenA.balanceOf(player1);
        vm.prank(player1);
        chessdict.claimPrizeSingle(gameId);
        uint256 player1BalanceAfter = tokenA.balanceOf(player1);

        console.log("player1 balance after claiming prize: %e", player1BalanceAfter);

        // check that the contract has a fee of 5%
        uint256 feeBal = chessdict.feeBalances(address(tokenA));
        console.log("Contract fee balance for tokenA: %e", feeBal);
    }

    //.  ---      TOURNAMENT GAMES ===

    function testGameDrawScenario() public {
        // similar to the previous test but we simulate a draw scenario
        uint256 stakeAmount = 5 * 10 ** tokenA.decimals();
        vm.startPrank(owner);
        tokenA.transfer(player4, stakeAmount);
        tokenA.transfer(player5, stakeAmount);
        vm.stopPrank();

        vm.startPrank(player4);
        tokenA.approve(address(chessdict), stakeAmount);
        uint256 gameId = chessdict.createGameSingle(address(tokenA), stakeAmount);
        vm.stopPrank();
        // now we join the game with player5
        vm.startPrank(player5);
        tokenA.approve(address(chessdict), stakeAmount);
        chessdict.joinGameSingle(gameId);
        vm.stopPrank();
        // now we simulate a draw
        vm.prank(redeemer);
        chessdict.setWinnerSingle(gameId, address(0), true); // true indicates draw
        // now both players claim their stake back
        uint256 player4BalanceBefore = tokenA.balanceOf(player4);
        console.log("player4 balance before claiming prize: %e", player4BalanceBefore);
        vm.prank(player4);
        chessdict.claimPrizeSingle(gameId);
        uint256 player4BalanceAfter = tokenA.balanceOf(player4);
        console.log("player4 balance after claiming prize: %e", player4BalanceAfter);
        uint256 player5BalanceBefore = tokenA.balanceOf(player5);
        console.log("player5 balance before claiming prize: %e", player5BalanceBefore);
        //for draw games one call to claimPrizeSingle is enough
    }

    // we test that we create a tournament game and verify its parameters
    function testCreateAndJoinTournamentGame() public {
        // we first determine the amount of stake.
        uint256 stakeAmount = 5 * 10 ** tokenA.decimals(); // suppose the user wants to dict a game of 5 stable tokens.
        // we first transfer some tokens to the players from the owner
        vm.startPrank(owner);
        tokenA.transfer(player1, stakeAmount);
        tokenA.transfer(player2, stakeAmount);
        tokenA.transfer(player3, stakeAmount);
        vm.stopPrank();
        // we first approve the contract to spent the tokens on the user's behalf
        vm.prank(player1);
        tokenA.approve(address(chessdict), stakeAmount);

        // we now create the game
        vm.prank(player1);
        uint256 gameId = chessdict.createGameTournament(address(tokenA), 3, stakeAmount, block.timestamp + 1 days);
        // let's check the game was created as expected
        Chessdict.GameTournament memory game = chessdict.getGameTournament(gameId);
        assert(game.players[0] == player1);
        assert(game.token == address(tokenA));
        assert(game.stake == stakeAmount);
        assert(game.isActive == false);
        assert(game.created == true);
        assert(game.NumberOfPlayers == 3);
        console.log("Tournament Game created with ID:", gameId);

        // let player2 join the game
        vm.startPrank(player2);
        tokenA.approve(address(chessdict), stakeAmount);
        chessdict.joinGameTournament(gameId);
        vm.stopPrank();
        console.log("Player1 balance before exiting tournament:", tokenA.balanceOf(player1));

        //show that player can exit a tournament
        vm.prank(player1);
        chessdict.exitTournament(gameId);

        console.log("Player1 exited the tournament without issue", tokenA.balanceOf(player1));
        // we now have player1 rejoin the tournament
        vm.startPrank(player1);
        tokenA.approve(address(chessdict), stakeAmount);
        chessdict.joinGameTournament(gameId);
        vm.stopPrank();
        console.log("Player1 balance after joinging after exiting tournament:", tokenA.balanceOf(player1));
        // let player3 join the game
        vm.startPrank(player3);
        tokenA.approve(address(chessdict), stakeAmount);
        chessdict.joinGameTournament(gameId);
        vm.stopPrank();

        // let's check the game status after all players joined
        assert(chessdict.getGameTournament(gameId).isActive == true);
        assert(chessdict.getGameTournament(gameId).players[1] == player1);
        assert(chessdict.getGameTournament(gameId).players[2] == player3);
        console.log("Player2 and Player3 joined the tournament game with ID:", gameId);

        // now we have create the tournament with 3 players, we simulate player2 as the winner
        vm.prank(redeemer);
        //we set player2 and 3 as the winners of the contest
        //create arrays
        address[] memory winners = new address[](2);
        winners[0] = player2;
        winners[1] = player3;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10e18;
        amounts[1] = 5e18;
        //@note vm.expectRevert("Total payout exceeds total prize"); we test setting more than wanted
        chessdict.setWinnersTournament(gameId, winners, amounts);

        // we now let player2 claim the prize
        uint256 player2BalanceBefore = tokenA.balanceOf(player2);
        vm.prank(player2);
        chessdict.claimPrizeTournament(gameId);
        uint256 player2BalanceAfter = tokenA.balanceOf(player2);
        console.log("player2 balance after claiming prize: %e", player2BalanceAfter);

        // we now let player3 claim the prize
        uint256 player3BalanceBefore = tokenA.balanceOf(player3);
        vm.prank(player3);
        chessdict.claimPrizeTournament(gameId);
        uint256 player3BalanceAfter = tokenA.balanceOf(player3);
        console.log("player3 balance after claiming prize: %e", player3BalanceAfter);

        // show that it reverts if player1 (non winner) tries to claim prize
        vm.prank(player1);
        vm.expectRevert("No prize for caller");
        chessdict.claimPrizeTournament(gameId);
    }

    // WE TEST SPONSORING A TOURNAMENT
    function testSponsoredTournament() public {
        // we first determine the amount of stake.
        uint256 stakeAmount = 5 * 10 ** tokenA.decimals(); // suppose
        uint256 sponsorAmount = 200 * 10 ** tokenA.decimals();
        // we first transfer some tokens to the players from the owner
        vm.startPrank(owner);
        tokenA.transfer(player1, stakeAmount);
        tokenA.transfer(player2, stakeAmount);
        tokenA.transfer(player3, stakeAmount);
        tokenA.transfer(sponsor, sponsorAmount);
        vm.stopPrank();

        // we create a sponsored tournament
        vm.startPrank(sponsor);
        tokenA.approve(address(chessdict), sponsorAmount);
        uint256 gameId = chessdict.createSponsoredGameTournament(
            address(tokenA), 3, stakeAmount, sponsorAmount, block.timestamp + 1 days, false
        );
        vm.stopPrank();
        console.log("Sponsored Tournament Game created with ID:", gameId);
        //verify and log parameter
        Chessdict.GameTournament memory game = chessdict.getGameTournament(gameId);
        assert(game.players.length == 0);
        assert(game.token == address(tokenA));
        assert(game.stake == stakeAmount);
        assert(game.isActive == false);
        assert(game.created == true);
        assert(game.NumberOfPlayers == 3);
        assert(game.totalPrize == sponsorAmount + (3 * stakeAmount));
        console.log("timestamp of game:", game.startTimeStamp);

        // let player1 join the game
        vm.startPrank(player1);
        tokenA.approve(address(chessdict), stakeAmount);
        chessdict.joinGameTournament(gameId);
        vm.stopPrank();

        // let player2 join the game
        vm.startPrank(player2);
        tokenA.approve(address(chessdict), stakeAmount);
        chessdict.joinGameTournament(gameId);
        vm.stopPrank();

        // let player3 join the game
        vm.startPrank(player3);
        tokenA.approve(address(chessdict), stakeAmount);
        chessdict.joinGameTournament(gameId);
        vm.stopPrank();

        //verify game is active
        assert(chessdict.getGameTournament(gameId).isActive == true);

        // when audit is over I will cover a more robust test for now we check that users can claim prize
        // now we have redeemer set player3 as winner
        vm.prank(redeemer);
        //we set player3 as the winner of the contest
        address[] memory winners = new address[](1);
        winners[0] = player3;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = game.totalPrize;
        chessdict.setWinnersTournament(gameId, winners, amounts);

        vm.prank(player3);
        chessdict.claimPrizeTournament(gameId);
        console.log("show player3 winning the sponsored tournament", tokenA.balanceOf(player3));
    }
}
