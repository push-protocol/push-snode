//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;


// a purified signature test
contract SignatureTest {

    // this is the only method for testing
    // our _message is signed by _signers[] with their private keys,
    // and the signatures are stored in _signatures[]
    // should return true if 1 signature is valid (for testing only 1 is ok)
    function testVerify(bytes memory _message, address[] memory _signers,
        bytes[] memory _signatures) external pure returns (bool) {
        return verify(_message, _signers[0], _signatures[0]);
    }

    function getMessageHash(bytes memory _message) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_message));
    }

    function getEthSignedMessageHash(bytes32 _messageHash) internal pure returns (bytes32) {
        /*
        Signature is produced by signing a keccak256 hash with the following format:
        "\x19Ethereum Signed Message\n" + len(msg) + msg
        */
        return
        keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash)
        );
    }

    function recoverSigner(
        bytes32 _ethSignedMessageHash,
        bytes memory _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");

        assembly {
        /*
        First 32 bytes stores the length of the signature

        add(sig, 32) = pointer of sig + 32
        effectively, skips first 32 bytes of signature

        mload(p) loads next 32 bytes starting at the memory address p into memory
        */

        // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
        // second 32 bytes
            s := mload(add(sig, 64))
        // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        // implicitly return (r, s, v)
    }

    function verify(bytes memory _message, address _signer, bytes memory signature) internal pure returns (bool) {
        bytes32 messageHash = getMessageHash(_message);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);
        address signer = recoverSigner(ethSignedMessageHash, signature);
        return signer == _signer;
    }
}