# OpenEden Vault Test Suite

This directory contains comprehensive test suites for the OpenEden T-Bills vault system.

## Test Files Overview

### Core Vault Tests
- **09-vault.test.ts** - Main vault functionality tests (deposits, withdrawals, fees, etc.)
- **01-KycManager.test.ts** - KYC management system tests
- **02-FeeManager.test.ts** - Fee calculation and management tests
- **03-Controller.test.ts** - Controller contract tests
- **04-TbillPriceFeed.test.ts** - Price feed oracle tests
- **05-Timelock.test.ts** - Timelock governance tests
- **08-partnership.test.ts** - Partnership fee system tests

### Redemption System Tests
- **10-usycRedemption.test.ts** - **NEW** Comprehensive USYC redemption system tests

## Running Tests

### Run All Tests
```bash
npx hardhat test
```

### Run Specific Test Files
```bash
# Run main vault tests
npx hardhat test test/09-vault.test.ts

# Run USYC redemption tests
npx hardhat test test/10-usycRedemption.test.ts

# Run specific test suites
npx hardhat test test/10-usycRedemption.test.ts --grep "Treasury Management"
```

### Test Coverage
```bash
npx hardhat coverage
```

## USYC Redemption Test Structure

The `10-usycRedemption.test.ts` file contains:

### 🔧 **Setup Tests**
- Contract deployment validation
- Initial token balances verification
- Vault integration checks

### 🏦 **Treasury Management**
- Owner-only treasury setting
- Zero address validation
- Access control testing

### 💧 **Liquidity Management**
- Liquidity information accuracy
- Helper USDC balance tracking
- Minimum calculation logic

### 💱 **Price Conversion**
- USDC to USYC conversion at various rates
- Oracle price updates
- Extreme price handling

### 🔒 **Access Control**
- Vault-only redemption access
- Owner-only emergency functions
- Unauthorized access prevention

### ⏸️ **Pause Management**
- Pause status checking
- Pause toggle functionality
- Paused state redemption handling

### 🔄 **Redemption Process**
- Successful USYC to USDC redemption
- Insufficient balance handling
- Insufficient allowance scenarios
- Paused selling scenarios
- Helper liquidity checks

### 🔗 **Integration Tests**
- End-to-end deposit → redemption flow
- Multiple concurrent redemptions
- Edge case amounts
- Oracle price changes during operation

### 🚨 **Error Handling**
- Oracle failure scenarios
- Contract state changes
- Extreme conditions

### ⛽ **Performance Tests**
- Gas optimization validation
- Reasonable gas costs

## Mock Contracts

The tests use several mock contracts for isolated testing:

- **MockUSYC.sol** - Mock USYC token with 6 decimals
- **MockUsycHelper.sol** - Mock helper with sellFor function
- **MockV3Aggregator.sol** - Mock price feed oracle
- **MockOpenEdenVaultV2.sol** - Mock vault for upgrades

## Test Configuration

Key test parameters:
- **Vault Decimals**: 6
- **Oracle Decimals**: 8
- **Initial T-Bill Price**: 1:1 (1e8)
- **Test Amounts**: Range from $1 to $10M
- **Fee Rates**: 5bps workday, 10bps holiday

## Best Practices

1. **Isolation**: Each test is isolated with proper setup/teardown
2. **Comprehensive Coverage**: Tests cover happy path, edge cases, and error conditions
3. **Gas Optimization**: Performance tests ensure reasonable gas costs
4. **Real-world Scenarios**: Tests simulate actual usage patterns
5. **Error Handling**: Extensive error condition testing

## Contributing

When adding new tests:
1. Follow the existing test structure
2. Include both positive and negative test cases
3. Test edge cases and error conditions
4. Document complex test scenarios
5. Ensure tests are deterministic and isolated 