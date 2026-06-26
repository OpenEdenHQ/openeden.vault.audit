# OpenEden T-Bill Deployed Addresses

Core contract addresses for the OpenEden T-Bill Vault system. All upgradeable contracts are UUPS proxies; the proxy (stable) address is listed. Each address links to its block explorer.

> Where a contract has been upgraded, the current live version is shown (V3 on Ethereum/Arbitrum, V5 vault). The underlying token is a custom 18-decimal asset (not 6-decimal USDC) on BSC.

## Ethereum

| Contract           | Mainnet (chainId 1)                                                                                           | Testnet — Sepolia (chainId 11155111)                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| KycManager         | [`0x51Be497AcEd1a2C19f6151064301e356B020D947`](https://etherscan.io/address/0x51Be497AcEd1a2C19f6151064301e356B020D947) | [`0x4B9a1ECa8E4073b0353C856c412c16A7460797c2`](https://sepolia.etherscan.io/address/0x4B9a1ECa8E4073b0353C856c412c16A7460797c2) |
| FeeManager         | [`0x99C913B3cBDdCFC7eD49Ff19B00704286a4B3b6B`](https://etherscan.io/address/0x99C913B3cBDdCFC7eD49Ff19B00704286a4B3b6B) | [`0xfDDaf01A4e53fC9B2269E42ba057f3f7bb82DaF1`](https://sepolia.etherscan.io/address/0xfDDaf01A4e53fC9B2269E42ba057f3f7bb82DaF1) |
| Controller         | [`0x377de6729507Bb0E56E0AAC666bd8522E4A3fe41`](https://etherscan.io/address/0x377de6729507Bb0E56E0AAC666bd8522E4A3fe41) | [`0x107389038a242137D00465866268987626049493`](https://sepolia.etherscan.io/address/0x107389038a242137D00465866268987626049493) |
| TBillPriceFeed     | [`0xCe9a6626Eb99eaeA829D7fA613d5D0A2eaE45F40`](https://etherscan.io/address/0xCe9a6626Eb99eaeA829D7fA613d5D0A2eaE45F40) | [`0x3c9c86e67C64494BB9935bAb2128E1895e640Fcd`](https://sepolia.etherscan.io/address/0x3c9c86e67C64494BB9935bAb2128E1895e640Fcd) |
| TimelockController | [`0x8Bb125BA9A0429583dfc3FCF295636A6cC8e9dc0`](https://etherscan.io/address/0x8Bb125BA9A0429583dfc3FCF295636A6cC8e9dc0) | [`0xd7eC2C1F6ddd1D4F8f4F2E7aaAdeDcCD6e0589E9`](https://sepolia.etherscan.io/address/0xd7eC2C1F6ddd1D4F8f4F2E7aaAdeDcCD6e0589E9) |
| Partnership        | [`0xc0952c8ba068c887B675B4182F3A65420D045F46`](https://etherscan.io/address/0xc0952c8ba068c887B675B4182F3A65420D045F46) | [`0x647a501E11171aF4E1739E63d0B55fc0A4c6b77C`](https://sepolia.etherscan.io/address/0x647a501E11171aF4E1739E63d0B55fc0A4c6b77C) |
| OpenEdenVault (V5) | [`0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a`](https://etherscan.io/address/0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a) | [`0x0ad482Cc99e68DA90Ce994a1619fDCCA0966319C`](https://sepolia.etherscan.io/address/0x0ad482Cc99e68DA90Ce994a1619fDCCA0966319C) |

## Arbitrum

| Contract           | Mainnet — Arbitrum One (chainId 42161)                                                                        | Testnet — Sepolia (chainId 421614)                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| KycManager         | [`0x0d7690bAa1008c8d3C5dae9D5033FF846738BAfB`](https://arbiscan.io/address/0x0d7690bAa1008c8d3C5dae9D5033FF846738BAfB) | [`0x4B9a1ECa8E4073b0353C856c412c16A7460797c2`](https://sepolia.arbiscan.io/address/0x4B9a1ECa8E4073b0353C856c412c16A7460797c2) |
| FeeManager         | [`0x965738d072F2a37fEE9DFf572Bf517068cFFEa39`](https://arbiscan.io/address/0x965738d072F2a37fEE9DFf572Bf517068cFFEa39) | [`0x0b719Ceceb225cCB7721639936f16EEC875f0e5b`](https://sepolia.arbiscan.io/address/0x0b719Ceceb225cCB7721639936f16EEC875f0e5b) |
| Controller         | [`0xC6773ba1Ff30Cc9b14972225924a21FF7fDCd01F`](https://arbiscan.io/address/0xC6773ba1Ff30Cc9b14972225924a21FF7fDCd01F) | [`0x107389038a242137D00465866268987626049493`](https://sepolia.arbiscan.io/address/0x107389038a242137D00465866268987626049493) |
| TBillPriceFeed     | [`0xc0952c8ba068c887B675B4182F3A65420D045F46`](https://arbiscan.io/address/0xc0952c8ba068c887B675B4182F3A65420D045F46) | [`0x3c9c86e67C64494BB9935bAb2128E1895e640Fcd`](https://sepolia.arbiscan.io/address/0x3c9c86e67C64494BB9935bAb2128E1895e640Fcd) |
| TimelockController | [`0x35235bFbe1662A095034BA81154cdeA291b733c8`](https://arbiscan.io/address/0x35235bFbe1662A095034BA81154cdeA291b733c8) | [`0xBd4403231892a838Da6B82e4F2820Fd83b451dC5`](https://sepolia.arbiscan.io/address/0xBd4403231892a838Da6B82e4F2820Fd83b451dC5) |
| Partnership        | [`0x87e3Ba929c71c0e28fC1C817D107A888A59C523e`](https://arbiscan.io/address/0x87e3Ba929c71c0e28fC1C817D107A888A59C523e) | [`0xd12D6270Ad25D2858B6C4F3501f9CDC6253ca919`](https://sepolia.arbiscan.io/address/0xd12D6270Ad25D2858B6C4F3501f9CDC6253ca919) |
| OpenEdenVault (V5) | [`0xF84D28A8D28292842dD73D1c5F99476A80b6666A`](https://arbiscan.io/address/0xF84D28A8D28292842dD73D1c5F99476A80b6666A) | [`0xE97fabdc6B7606D7C3362E694a20295df7B70483`](https://sepolia.arbiscan.io/address/0xE97fabdc6B7606D7C3362E694a20295df7B70483) |

## BSC

| Contract           | Mainnet (chainId 56)                                         | Testnet (chainId 97)                                         |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| KycManager         | [`0xd9cf8C5bB16422d992595f3e3342De25fE7F5cf9`](https://bscscan.com/address/0xd9cf8C5bB16422d992595f3e3342De25fE7F5cf9) | [`0xc9f9610d6C02F7Bb0C220Ca9B91d8Ff1099a330A`](https://testnet.bscscan.com/address/0xc9f9610d6C02F7Bb0C220Ca9B91d8Ff1099a330A) |
| FeeManager         | [`0xAa311E05f20B5e3D28B56f012B4560f1e405f4d7`](https://bscscan.com/address/0xAa311E05f20B5e3D28B56f012B4560f1e405f4d7) | [0x4c3EC8c3f9eC46D81887b3a27d0c9685a4DDc27C](https://testnet.bscscan.com/address/0x4c3EC8c3f9eC46D81887b3a27d0c9685a4DDc27C#readContract) |
| Controller         | [`0xDAe70F90620Bcbb7D7B3b536683bB2BA257e0fC9`](https://bscscan.com/address/0xDAe70F90620Bcbb7D7B3b536683bB2BA257e0fC9) | [`0x318da6BBf4ADa5c499ffD13304ce8aefc1732706`](https://testnet.bscscan.com/address/0x318da6BBf4ADa5c499ffD13304ce8aefc1732706) |
| TBillPriceFeed     | [`0x3347d0C6e2Bd23b1148Fbb7fEF5f0fED281612A8`](https://bscscan.com/address/0x3347d0C6e2Bd23b1148Fbb7fEF5f0fED281612A8) | [`0x26c1BD5BF3A7Ee64668a57e6E94a7176E9B3677f`](https://testnet.bscscan.com/address/0x26c1BD5BF3A7Ee64668a57e6E94a7176E9B3677f) |
| TimelockController | [`0xf209a13CB460682297c39e99091e2D543B195F79`](https://bscscan.com/address/0xf209a13CB460682297c39e99091e2D543B195F79) | [`0x923714308F3C3B2244a23949A257d75BD8a0419f`](https://testnet.bscscan.com/address/0x923714308F3C3B2244a23949A257d75BD8a0419f) |
| Partnership        | [`0xe2B55156183e60354334b345b7D8a436D75b5F56`](https://bscscan.com/address/0xe2B55156183e60354334b345b7D8a436D75b5F56) | [`0x24417f975FC596DDbc29BE74eB0adCf22D8cf48A`](https://testnet.bscscan.com/address/0x24417f975FC596DDbc29BE74eB0adCf22D8cf48A) |
| OpenEdenVault (V5) | [`0x5b4681F0d7A01B817675F25892D3Ad73572FD1D9`](https://bscscan.com/address/0x5b4681F0d7A01B817675F25892D3Ad73572FD1D9) | [`0x0c84f8DBEc3669314f546536A8e8F68087B61113`](https://testnet.bscscan.com/address/0x0c84f8DBEc3669314f546536A8e8F68087B61113) |
