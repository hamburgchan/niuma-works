// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { NiumaWorks } from "../contracts/NiumaWorks.sol";

contract DeployNiumaWorks is Script {
    function run() external returns (NiumaWorks deployed) {
        require(block.chainid == 10143, "Monad testnet only");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address[3] memory payouts = [
            vm.envOr("DONKEY_PAYOUT", deployer), vm.envOr("HORSE_PAYOUT", deployer), vm.envOr("COW_PAYOUT", deployer)
        ];
        vm.startBroadcast(key);
        deployed = new NiumaWorks(deployer, operator, treasury, payouts);
        vm.stopBroadcast();
    }
}
