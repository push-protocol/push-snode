// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PushToken is ERC20 {
    constructor() ERC20("Push TestToken", "tPUSH") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}