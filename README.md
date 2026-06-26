# OpenEden T-Bill Vault Contracts

Smart contracts for the OpenEden T-Bill Vault — a tokenized US Treasury yield product. Built with Hardhat; the vault is an upgradeable ERC4626 deployed across Ethereum, Arbitrum, and BSC.

## Contracts

- `OpenEdenVaultV5Impl` — the current ERC4626 vault implementation (V2–V5 impls retained for upgrade history)
- `Controller` — orchestrates deposits, redemptions, and settlement
- `feeManager` (FeeManager) — deposit/redeem fee and limit logic
- `KycManager` — KYC / compliance allowlist
- `TBillPriceOracle` — T-Bill NAV price feed
- `Timelock` — `TimelockController` governing upgrades and privileged actions
- `PartnerShip` — partner fee-sharing
- `UsycRedemption` — USYC instant-redemption helper

## Deployed Addresses

Deployed contract addresses for all networks (mainnet + testnet) are in [`deployed-addresses.md`](./deployed-addresses.md).

## Development

```sh
# install dependencies
npm install

# compile contracts
npm run compile

# run tests
npm run test

# contract sizes
npm run size
```

## Audits

Independent security audit reports are in [`audits/`](./audits/).

## Attribution

This project is released under the [MIT License](./LICENSE). While the MIT
License does not require it, if you use this software in your own product or
service, we kindly ask that you include visible attribution to **OpenEden**
(e.g. in your documentation, UI, or credits) and link to
[openeden.com](https://openeden.com/).
