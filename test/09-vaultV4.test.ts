import { expect } from "chai";
import { describe } from "mocha";
import { BigNumber } from "ethers";
import { deployContract } from "../helpers/framework/contracts";
import { ethers, upgrades } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import VaultV2 from "../artifacts/contracts/OpenEdenVaultV2.sol/OpenEdenVaultV2.json";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

import {
  USDC,
  TimelockController,
  OpenEdenVaultV2,
  OpenEdenVaultV3,
  OpenEdenVaultV5,
  FeeManager,
  KycManager,
  TBillPriceOracle,
  MockV3Aggregator,
  Controller,
  PartnerShip,
} from "../typechain-types";

describe("OpenEdenV4", async function () {
  const DEPOSIT = 0;
  const REDEEM = 1;
  const vaultDecimals = 6;
  const chainlinkDecimal = 8;
  const tbillOracleDecimal = 8;
  const tbillOracleInitPrice = BigNumber.from("100000000"); // 1 : 1 (tbill/usd)
  const chainlinkInitAnswer = BigNumber.from("98999999"); // 0.99 : 1  (usd/usdc)
  const tbillInitDeviation = BigNumber.from("100");

  const _500 = BigNumber.from("500000000"); // 500
  const _10k = BigNumber.from("10000000000"); // 10k
  const _9k = BigNumber.from("9000000000");

  const _50k = BigNumber.from("50000000000"); // 50k
  const _1M = BigNumber.from("1000000000000"); // 1M
  const _10M = BigNumber.from("10000000000000"); // 1M
  const _80k = BigNumber.from("80000000000");
  const _100k = BigNumber.from("100000000000"); // 100k
  const _150k = BigNumber.from("150000000000"); // 150k
  const _200k = BigNumber.from("200000000000"); // 200k
  const _250k = BigNumber.from("250000000000"); //
  const _300k = BigNumber.from("300000000000"); // 300k

  const _5$ = BigNumber.from("5000000");
  const _1$ = BigNumber.from("1000000");
  const _50$ = BigNumber.from("50000000"); // 50$
  const _75$ = BigNumber.from("75000000"); // 75$
  const _25$ = BigNumber.from("25000000"); // 25$
  const _500$ = BigNumber.from("500000000");
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const fundAmount = "10000000000000000000";

  const txFeeWorkdayDepositPct = 5; // 5bps
  const txFeeWorkdayWithdrawPct = 5; // 5bps
  const txFeeHolidayDepositPct = 10; // 10bps
  const txFeeHolidayWithdrawPct = 10; // 10bps
  const maxHolidayDepositPct = 500; // 5% tvl
  const maxHolidayAggDepositPct = 1000; // 10% tvl
  const managementFeeRate = 40; // 40bps
  const BPSUNIT = 10000;
  const delayTime = 60 * 60 * 24; // 24h

  // partnership parameters
  const depositFee = 5;
  const redeemFee = 5;

  // Contract instances
  let usdcTokenIns: USDC;
  let usycTokenIns: any; // MockUSYC
  let usycHelperIns: any; // MockUsycHelper
  let usycRedemptionIns: any; // UsycRedemption
  let usycOracle: MockV3Aggregator; // Dedicated USYC oracle
  let feeManager: FeeManager;
  let kycManagerIns: KycManager;
  let vaultV2: OpenEdenVaultV2;
  let vaultV3: OpenEdenVaultV3;
  let vault: OpenEdenVaultV5;
  let aggregator: MockV3Aggregator;
  let tbillOracle: TBillPriceOracle;
  let timelock: TimelockController;
  let controller: Controller;
  let partnership: PartnerShip;
  let OpenEdenVaultV3;
  let OpenEdenVaultV5;
  let iface;

  let owner: SignerWithAddress,
    investor1: SignerWithAddress,
    investor2: SignerWithAddress,
    investor3: SignerWithAddress,
    investor4: SignerWithAddress,
    lvAccount,
    child1,
    parent,
    non_kyc,
    operator,
    maintainer,
    treasuryAccount: SignerWithAddress,
    usycTreasuryAccount: SignerWithAddress,
    mgtFeeTreasuryAccount: SignerWithAddress,
    oplTreasury,
    timelockAdmin,
    timelockProposer,
    timelockExecutor;

  async function deployOpenEdenFixture() {
    [
      owner,
      investor1,
      investor2,
      investor3,
      investor4,
      lvAccount,
      child1,
      parent,
      non_kyc,
      operator,
      maintainer,
      treasuryAccount,
      oplTreasury, // as quarantine treasury
      usycTreasuryAccount,
      mgtFeeTreasuryAccount,
      timelockAdmin,
      timelockProposer,
      timelockExecutor,
    ] = await ethers.getSigners();
    const vaultParameters = {
      txFeeWorkdayDepositPct: txFeeWorkdayDepositPct, // 5 bps
      txFeeWorkdayWithdrawPct: txFeeWorkdayWithdrawPct, // 10 bps
      txFeeHolidayDepositPct: txFeeHolidayDepositPct,
      txFeeHolidayWithdrawPct: txFeeHolidayWithdrawPct,
      maxHolidayDepositPct: maxHolidayDepositPct,
      maxHolidayAggDepositPct: maxHolidayAggDepositPct,
      firstDeposit: _100k,
      minDeposit: _10k, // 100000 USDC
      maxDeposit: _1M, // max deposit on a day
      minWithdraw: _500, // min withdraw once
      maxWithdraw: _1M, // max withdraw on a day
      // managementFeeRate: managementFeeRate,
    };

    usdcTokenIns = await deployContract<USDC>("USDC");
    timelock = await deployContract<TimelockController>(
      "TimelockController",
      delayTime,
      [timelockProposer.address],
      [timelockExecutor.address],
      timelockAdmin.address
    );

    controller = await deployContract<Controller>(
      "Controller",
      operator.address,
      owner.address
    );

    partnership = await deployContract<PartnerShip>("PartnerShip");
    await partnership.createPartnerShip([child1.address], parent.address);
    await partnership.updatePartnerShipFees(
      parent.address,
      depositFee,
      redeemFee
    );

    iface = new ethers.utils.Interface(VaultV2.abi);

    const KycManagerFactory = await ethers.getContractFactory("KycManager");
    kycManagerIns = (await upgrades.deployProxy(KycManagerFactory, [
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
    ])) as KycManager;
    await kycManagerIns.deployed();

    console.log(vaultParameters.firstDeposit);

    feeManager = await deployContract<FeeManager>(
      "FeeManager",
      vaultParameters.txFeeWorkdayDepositPct,
      vaultParameters.txFeeWorkdayWithdrawPct,
      vaultParameters.txFeeHolidayDepositPct,
      vaultParameters.txFeeHolidayWithdrawPct,
      vaultParameters.maxHolidayDepositPct,
      vaultParameters.maxHolidayAggDepositPct,
      vaultParameters.firstDeposit,
      vaultParameters.minDeposit,
      vaultParameters.maxDeposit,
      vaultParameters.minWithdraw,
      vaultParameters.maxWithdraw
      // vaultParameters.managementFeeRate
    );
    // vaultV2 = await deployContract<OpenEdenVaultV2>("OpenEdenVaultV2");
    aggregator = await deployContract<MockV3Aggregator>(
      "MockV3Aggregator",
      chainlinkDecimal,
      chainlinkInitAnswer
    );

    // tbill
    tbillOracle = await deployContract<TBillPriceOracle>(
      "TBillPriceOracle",
      tbillOracleDecimal,
      tbillInitDeviation,
      tbillOracleInitPrice, // price
      tbillOracleInitPrice, // closing nav price
      operator.address,
      owner.address
    );

    const params = [
      usdcTokenIns.address,
      controller.address,
      operator.address,
      tbillOracle.address,
      aggregator.address,
      oplTreasury.address,
      treasuryAccount.address,
      feeManager.address,
      kycManagerIns.address,
      [],
      [],
    ];

    const OpenEdenVaultV2Factory = await ethers.getContractFactory(
      "MockOpenEdenVaultV2"
    );
    vaultV2 = (await upgrades.deployProxy(OpenEdenVaultV2Factory, params, {
      kind: "uups",
    })) as OpenEdenVaultV2;

    //const proxy = await upgrades.deployProxy(OpenEdenVaultV3, params,{ kind: 'uups'});

    await usdcTokenIns.transfer(investor1.address, _10M);
    await usdcTokenIns.transfer(investor2.address, _10M);
    await usdcTokenIns.transfer(investor3.address, _10M);
    await usdcTokenIns.transfer(investor4.address, _10M);
    await usdcTokenIns.transfer(child1.address, _10M);
    await usdcTokenIns.transfer(non_kyc.address, _10M);

    await usdcTokenIns.connect(investor1).approve(vaultV2.address, _10M);
    await usdcTokenIns.connect(investor2).approve(vaultV2.address, _10M);
    await usdcTokenIns.connect(investor3).approve(vaultV2.address, _10M);
    await usdcTokenIns.connect(investor4).approve(vaultV2.address, _10M);
    await usdcTokenIns.connect(child1).approve(vaultV2.address, _10M);
    await usdcTokenIns.connect(non_kyc).approve(vaultV2.address, _10M);

    //operatorRole = await timelock.PROPOSER_ROLE();
    //adminRole = await timelock.DEFAULT_ADMIN_ROLE();

    // 0: NON KYC, 1: US KYC, 2: GENERAL KYC
    await kycManagerIns.grantKycInBulk(
      [
        investor1.address,
        investor2.address,
        investor3.address,
        investor4.address,
        child1.address,
        vaultV2.address,
        oplTreasury.address,
        lvAccount.address,
      ],
      [2, 2, 2, 1, 2, 2, 2, 2]
    );

    await vaultV2.setQTreasury(oplTreasury.address);
    await vaultV2.setMaxDepeg(200);
    await vaultV2.setMaxTimeDelay(24 * 60 * 60);
    console.log("deployOpenEdenFixture over!");

    await kycManagerIns.setStrict(true);
    OpenEdenVaultV3 = await ethers.getContractFactory("OpenEdenVaultV3");
    let v3 = await OpenEdenVaultV3.deploy();
    await v3.deployed();

    OpenEdenVaultV5 = await ethers.getContractFactory("OpenEdenVaultV5");
    let v5 = await OpenEdenVaultV5.deploy();
    await v5.deployed();

    // !!!! important !!!!
    await upgrades.validateUpgrade(vaultV2.address, OpenEdenVaultV5, {
      unsafeAllowRenames: true,
    });
    console.log("validateUpgrade done!");

    await vaultV2.upgradeTo(v5.address);
    vault = await OpenEdenVaultV5.attach(vaultV2.address);
    await vault.connect(owner).setMaintainer(maintainer.address);

    await vault.connect(maintainer).setPartnerShip(partnership.address);
    await vault.connect(maintainer).setOperator([operator.address], [true]);
    await vault.connect(maintainer).setTotalSupplyCap(_10M);

    // setup USYC redemption system
    try {
      const MockUSYC = await ethers.getContractFactory("MockUSYC");
      usycTokenIns = await MockUSYC.deploy();
      await usycTokenIns.deployed();

      // Create a separate USYC oracle with valid price >= 1.0
      usycOracle = await deployContract<MockV3Aggregator>(
        "MockV3Aggregator",
        8,
        BigNumber.from("100000000") // 1.0 in 8 decimals - meets minimum requirement
      );
      await usycOracle.deployed();

      const MockUsycHelper = await ethers.getContractFactory("MockUsycHelper");
      usycHelperIns = await MockUsycHelper.deploy(
        usycTokenIns.address,
        usdcTokenIns.address,
        usycOracle.address // Use dedicated USYC oracle instead of USDC aggregator
      );
      await usycHelperIns.deployed();

      const UsycRedemption = await ethers.getContractFactory("UsycRedemption");
      usycRedemptionIns = await UsycRedemption.deploy(
        usycTokenIns.address,
        usdcTokenIns.address,
        usycHelperIns.address,
        vault.address,
        usycTreasuryAccount.address
      );
      await usycRedemptionIns.deployed();

      // Set up USYC treasury
      await usycRedemptionIns.setUsycTreasury(usycTreasuryAccount.address);

      // Fund the system
      await usycTokenIns.transfer(usycTreasuryAccount.address, _1M);
      await usycTokenIns
        .connect(usycTreasuryAccount)
        .approve(usycRedemptionIns.address, _50k);

      // Add USDC liquidity to helper
      await usdcTokenIns.transfer(usycHelperIns.address, _200k);

      // Set the redemption contract in the vault
      await vault
        .connect(maintainer)
        .setRedemption(usycRedemptionIns.address);

      console.log("USYC redemption system set up successfully");
    } catch (error) {
      console.log("USYC redemption system setup failed:", error);
    }

    await vault.setMgtFeeTreasury(mgtFeeTreasuryAccount.address);
  }

  beforeEach(async () => {
    await loadFixture(deployOpenEdenFixture);
  });

  describe("txsFee Function", () => {
    const ActionType = {
      DEPOSIT: 0,
      REDEEM: 1,
    };
    it("should calculate positive oeFee and positive pFee", async function () {
      // Set tx fee in FeeManager (for OpenEden fee)
      await feeManager.setTxFeeWorkdayDepositPct(50); // 50 basis points

      // Set positive partnership fee for child
      await partnership.updatePartnerShipFees(parent.address, 100, 50); // deposit fee 100bps (1%)
      const depositAssets = _10k;

      // Call txsFee and validate the result
      const [oeFee, pFee, totalFee] = await vault.txsFee(
        ActionType.DEPOSIT,
        child1.address,
        depositAssets
      );

      expect(oeFee).to.equal(depositAssets.mul(50).div(BPSUNIT)); // 0.5% fee
      expect(pFee).to.equal(depositAssets.mul(100).div(BPSUNIT)); // 1% partnership fee
      expect(totalFee).to.equal(oeFee.add(pFee)); // Total = oeFee + pFee
    });

    it("should calculate positive oeFee and negative pFee", async function () {
      // Set tx fee in FeeManager (for OpenEden fee)
      await feeManager.setTxFeeWorkdayDepositPct(50); // 50 basis points

      // Set negative partnership fee for child
      await partnership.updatePartnerShipFees(parent.address, -100, 50); // deposit fee -100bps (-1%)
      const depositAssets = _10k;

      // Call txsFee and validate the result
      const [oeFee, pFee, totalFee] = await vault.txsFee(
        ActionType.DEPOSIT,
        child1.address,
        depositAssets
      );

      expect(oeFee).to.equal(depositAssets.mul(50).div(BPSUNIT)); // 0.5% fee
      expect(pFee).to.equal(depositAssets.mul(-100).div(BPSUNIT)); // -1% partnership fee

      console.log(oeFee.add(pFee));
      expect(totalFee).to.be.gte(0); // Ensure non-negative totalFee
    });

    it("should less than positive oeFee when set negative pFee", async function () {
      // Set tx fee in FeeManager (for OpenEden fee)
      await feeManager.setTxFeeWorkdayDepositPct(50); // 50 basis points

      // Set negative partnership fee for child
      await partnership.updatePartnerShipFees(parent.address, -40, 50); // deposit fee -100bps (-1%)
      const depositAssets = _10k;

      // Call txsFee and validate the result
      const [oeFee, pFee, totalFee] = await vault.txsFee(
        ActionType.DEPOSIT,
        child1.address,
        depositAssets
      );

      expect(oeFee).to.equal(depositAssets.mul(50).div(BPSUNIT)); // 0.5% fee
      expect(pFee).to.equal(depositAssets.mul(-40).div(BPSUNIT)); // -1% partnership fee

      console.log(oeFee.add(pFee));
      expect(totalFee).to.be.gte(depositAssets.mul(10).div(BPSUNIT)); // Ensure non-negative totalFee
    });

    it("should ensure totalFee does not fall below minimum transaction fee", async function () {
      // Set tx fee in FeeManager (for OpenEden fee)
      await feeManager.setTxFeeWorkdayDepositPct(50); // 50 basis points

      // Set a small partnership fee
      await partnership.updatePartnerShipFees(parent.address, 1, 50); // deposit fee 1bps

      // Set minimum transaction fee in FeeManager
      await feeManager.setMinTxsFee(ethers.utils.parseUnits("8", 6)); // Min transaction fee 5 units
      const depositAssets = _1$;

      // Call txsFee and validate that the totalFee is at least the minTxsFee
      const [oeFee, pFee, totalFee] = await vault.txsFee(
        ActionType.DEPOSIT,
        child1.address,
        depositAssets
      );

      const expectedFee = oeFee.add(pFee);
      const minFee = await feeManager.getMinTxsFee();
      console.log("expectedFee: ", expectedFee);
      console.log("minFee: ", minFee);

      expect(totalFee).to.be.at.least(minFee); // Ensure total fee is not below minTxsFee
      expect(totalFee).to.equal(expectedFee.gte(minFee) ? expectedFee : minFee);
    });

    it("should return only oeFee when no PartnerShip contract is set", async function () {
      // Remove the partnership contract
      await vault
        .connect(maintainer)
        .setPartnerShip(ethers.constants.AddressZero);

      // Set tx fee in FeeManager
      await feeManager.setTxFeeWorkdayDepositPct(50); // 50 basis points
      const depositAssets = _10k;

      // Call txsFee and validate that only oeFee is returned
      const [oeFee, pFee, totalFee] = await vault.txsFee(
        ActionType.DEPOSIT,
        investor1.address,
        depositAssets
      );

      expect(oeFee).to.equal(depositAssets.mul(50).div(BPSUNIT)); // 0.5% fee
      expect(pFee).to.equal(0); // No partnership fee
      expect(totalFee).to.equal(oeFee); // Total fee is only oeFee
    });
  });

  describe("setOperator Function", function () {
    it("should allow owner to set multiple operators", async function () {
      // Prepare operator addresses and their statuses
      const operators = [investor1.address, investor2.address];
      const statuses = [true, false]; // operator1 = true, operator2 = false

      // Call setOperator with valid data
      await vault.connect(maintainer).setOperator(operators, statuses);

      // Check if operator statuses were set correctly
      const operator1Status = await vault.operators(investor1.address);
      expect(operator1Status).to.equal(true);

      const operator2Status = await vault.operators(investor2.address);
      expect(operator2Status).to.equal(false);
    });

    it("should emit SetOperator event for each operator", async function () {
      // Prepare operator addresses and their statuses
      const operators = [investor1.address, investor2.address];
      const statuses = [true, false]; // operator1 = true, operator2 = false

      // Expect the SetOperator event to be emitted twice, once for each operator
      await expect(vault.connect(maintainer).setOperator(operators, statuses))
        .to.emit(vault, "SetOperator")
        .withArgs(investor1.address, true) // First operator's event
        .and.to.emit(vault, "SetOperator")
        .withArgs(investor2.address, false); // Second operator's event
    });

    it("should revert if called by a non-owner", async function () {
      // Prepare operator addresses and their statuses
      const operators = [investor1.address];
      const statuses = [true];

      // Try to call setOperator from non-owner account and expect revert
      await expect(
        vault.connect(investor1).setOperator(operators, statuses)
      ).to.be.revertedWithCustomError(vault, "TBillNoPermission");
    });

    it("should revert if array lengths are mismatched", async function () {
      // Prepare operator addresses and mismatched statuses array
      const operators = [investor1.address, investor2.address];
      const statuses = [true]; // Mismatched length

      // Expect revert due to array length mismatch
      await expect(vault.connect(maintainer).setOperator(operators, statuses))
        .to.be.reverted;
    });
  });

  describe("updateEpoch Function", async function () {
    const twentyHours = 20 * 60 * 60; // 20 hours in seconds
    beforeEach(async function () {
      await vault.connect(maintainer).setTimeBuffer(twentyHours);
    });

    it("should revert if updateEpoch is called before 20 hours have passed", async function () {
      await vault.connect(operator).updateEpoch(false);

      // eleven hours have passed
      const newHour = twentyHours - 60 * 60 * 9;
      await time.increase(newHour); // Increase time by 19 hours 59 minutes

      await expect(
        vault.connect(operator).updateEpoch(false)
      ).to.be.revertedWithCustomError(vault, "TBillUpdateTooEarly");

      await vault.connect(maintainer).setTimeBuffer(newHour);
      await vault.connect(operator).updateEpoch(false);
    });

    it("should successfully updateEpoch after 20 hours have passed", async function () {
      await vault.connect(operator).updateEpoch(false);
      const epoch1 = await vault.epoch();
      expect(epoch1).to.equal(1);

      await time.increase(twentyHours);
      await vault.connect(operator).updateEpoch(false);

      const epoch = await vault.epoch();
      expect(epoch).to.equal(2);

      const isWeekend = await vault.isWeekend();
      expect(isWeekend).to.equal(false);

      const lastUpdateTS = await vault.lastUpdateTS();
      const currentTime = await time.latest();
      expect(lastUpdateTS).to.equal(currentTime);
    });
  });

  describe("cancel", async function () {
    const assets = _150k;
    let shares;
    beforeEach(async function () {
      let bal = await usdcTokenIns.balanceOf(investor1.address);
      console.log("bal: ", bal.toString());

      await vault.connect(investor1).deposit(assets, investor1.address);
      shares = await vault.balanceOf(investor1.address);

      await vault.connect(investor1).redeem(shares, investor1.address);
    });

    it("should only allow maintainer to cancel", async function () {
      await expect(
        vault.connect(investor1).cancel(1)
      ).to.be.revertedWithCustomError(vault, "TBillNoPermission");
    });

    it("should transfer shares back to sender on cancel", async function () {
      const balanceBefore = await vault.balanceOf(investor1.address);
      expect(balanceBefore).to.equal(0);

      await vault.connect(maintainer).cancel(1);

      const balanceAfter = await vault.balanceOf(investor1.address);
      console.log("before: ", balanceBefore.toString());
      console.log("after: ", balanceAfter.toString());
      expect(balanceAfter).to.equal(shares);
    });
  });

  describe("redeemIns test", async function () {
    const assets = _150k;
    let shares: any;
    beforeEach(async function () {
      await vault.connect(investor1).deposit(assets, investor1.address);
      shares = await vault.balanceOf(investor1.address);
    });

    it("should call redeemIns() successfully", async function () {
      const shares1 = 512345678;
      console.log("shares1:", shares1.toString());

      // No need to update oracle price since USYC oracle is already set to valid 1.0
      // The USDC aggregator (used for vault price validation) can remain at 0.99
      await usycOracle.updateAnswer(ethers.utils.parseUnits("1.2345678", 8));
      await vault.connect(investor1).redeemIns(shares1, investor1.address);
    });

    it("should not able to to redeemIns when no enough allowance", async function () {
      const shares1 = _100k;

      await expect(
        vault.connect(investor1).redeemIns(shares1, investor1.address)
      ).to.revertedWith("ERC20: insufficient allowance");
    });

    it("should not able to to redeemIns when without enough usdc liqudity", async function () {
      const shares1 = _250k;
      await usycTokenIns
        .connect(usycTreasuryAccount)
        .approve(usycRedemptionIns.address, _10M);
      await expect(
        vault.connect(investor1).redeemIns(shares1, investor1.address)
      ).to.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });

  describe("deposit/withdraw tbill/usdc 1:1", () => {
    it("should fail if price is outdate ", async function () {
      // pass 3 days, so the price is outdate
      await time.increase(60 * 60 * 24 * 8);

      await expect(
        vault.connect(investor1).deposit(_100k, investor1.address)
      ).to.be.revertedWithCustomError(vault, "TBillPriceOutdated");
    });
    it("deposit 100k", async function () {
      expect(await vault.firstDepositMap(investor1.address)).to.equal(false);
      await vault.connect(investor1).deposit(_100k, investor1.address);
      let [oeFee, pFee, totalFee] = await vault.txsFee(
        DEPOSIT,
        investor1.address,
        _100k
      );
      const investor1DepositFee = totalFee;
      expect(await vault.balanceOf(investor1.address)).to.equal(
        _100k.sub(investor1DepositFee)
      );

      expect(await vault.totalAssets()).to.equal(
        _100k.sub(investor1DepositFee)
      );
      expect(await vault.firstDepositMap(investor1.address)).to.equal(true);

      await vault.connect(investor1).deposit(_100k, investor2.address);
      [oeFee, pFee, totalFee] = await vault.txsFee(
        DEPOSIT,
        investor2.address,
        _100k
      );
      expect(await vault.balanceOf(investor2.address)).to.equal(
        _100k.sub(totalFee)
      );

      [oeFee, pFee, totalFee] = await vault.txsFee(
        DEPOSIT,
        child1.address,
        _100k
      );
      await vault.connect(child1).deposit(_100k, child1.address);
      expect(await vault.balanceOf(child1.address)).to.equal(
        _100k.sub(totalFee)
      );
      expect(totalFee).to.equal(investor1DepositFee.mul(2));

      await vault.connect(child1).redeem(_50k, child1.address);
    });

    it("should have some assets onchain", async function () {
      await usdcTokenIns.transfer(vault.address, _100k);
      expect(await vault.onchainAssets()).to.greaterThan(BigNumber.from("0"));
    });

    it("should fail deposit when sender is a non-kyc user", async function () {
      await expect(
        vault.connect(non_kyc).deposit(_100k, investor1.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
    });

    it("abnormal withdraw", async function () {
      await vault.previewDeposit(_100k);
      await vault.previewRedeem(_100k);
      vault.connect(investor1).deposit(_100k.mul(5), investor1.address);
      await expect(
        vault.connect(investor1).redeem(_50$, investor1.address)
      ).to.revertedWithCustomError(vault, "TBillLessThanMin");
    });

    it("should fail deposit when receiver is a non-kyc user", async function () {
      await expect(
        vault.connect(investor1).deposit(_100k, non_kyc.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
    });

    it("should fail deposit when receiver is a banned kyc user", async function () {
      await kycManagerIns.bannedInBulk([investor2.address]);
      await expect(
        vault.connect(investor1).deposit(_100k, investor2.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
    });

    it("redeem 10k, redeem 100k", async function () {
      // deposit
      await vault.connect(investor1).deposit(_300k, investor1.address);
      let tbillBeforeRedeem = await vault.balanceOf(investor1.address);
      let usdcBeforeRedeem = await usdcTokenIns.balanceOf(investor1.address);
      console.log("tbillBeforeRedeem", tbillBeforeRedeem.toString());
      console.log("usdcBeforeRedeem", usdcBeforeRedeem.toString());

      // redeem 10k
      await expect(vault.connect(investor1).redeem(_10k, investor1.address))
        .emit(vault, "AddToWithdrawalQueue")
        .withArgs(investor1.address, investor1.address, _10k, anyValue);
      expect(await vault.balanceOf(investor1.address)).to.equal(
        tbillBeforeRedeem.sub(_10k)
      );

      // redeem 100k
      tbillBeforeRedeem = await vault.balanceOf(investor1.address);
      usdcBeforeRedeem = await usdcTokenIns.balanceOf(investor1.address);
      await vault.connect(investor1).redeem(_100k, investor1.address);
      expect(await vault.balanceOf(investor1.address)).to.equal(
        tbillBeforeRedeem.sub(_100k)
      );
      expect(await usdcTokenIns.balanceOf(investor1.address)).to.equal(
        usdcBeforeRedeem
      );
    });

    describe("WithdrawalQueue", () => {
      it("processWithdrawQueue ", async function () {
        expect(
          await vault.connect(investor1).deposit(_300k, investor1.address)
        ).to.emit(vault, "ProcessDeposit");
        expect(
          await vault.connect(investor2).deposit(_300k, investor2.address)
        ).emit(vault, "ProcessDeposit");

        await usdcTokenIns.transfer(vault.address, _300k);
        await usdcTokenIns.transfer(vault.address, _300k);

        let usdcBalance = await usdcTokenIns.balanceOf(vault.address);
        console.log("vault usdc balance: ", usdcBalance.toString());

        await vault.connect(investor1).redeem(_10k, investor1.address);
        await vault.connect(investor1).redeem(_10k, investor2.address); //investor1 -> investor2
        await vault.connect(investor2).redeem(_100k, investor2.address);
        await vault.connect(investor2).redeem(_150k, investor2.address);

        let length = await vault.getWithdrawalQueueLength();
        expect(length).to.equal(4);

        console.log("----- process withdrawal queue 1 -----");
        await vault.connect(operator).processWithdrawalQueue(1);
        length = await vault.getWithdrawalQueueLength();
        expect(length).to.equal(3);
        // await displayQueue(vault);

        console.log("----- process withdrawal queue 0 (all length) -----");
        await vault.connect(operator).processWithdrawalQueue(0);
        length = await vault.getWithdrawalQueueLength();

        // insufficient balance, so the last redeem will be failed
        expect(length).to.equal(0);

        console.log("test cancellation");
        await vault.connect(investor1).redeem(_10k, investor1.address);
        await vault.connect(investor2).redeem(_10k, investor2.address);
        await expect(
          vault.connect(maintainer).cancel(10)
        ).to.be.revertedWithCustomError(vault, "TBillInvalidInput");
        await expect(
          vault.connect(investor2).cancel(1)
        ).to.be.revertedWithCustomError(vault, "TBillNoPermission");

        // await kycManagerIns.bannedInBulk([investor1.address]);
        // await kycManagerIns.bannedInBulk([investor2.address]);
        await vault.connect(maintainer).cancel(2); // have tested 0, 1
      });

      it("should gt 0", async function () {
        await vault.getWithdrawalQueueInfo(1);
        await expect(
          vault.connect(operator).processWithdrawalQueue(1)
        ).to.be.revertedWithCustomError(vault, "TBillInvalidInput");
        vault.connect(investor1).deposit(_100k, investor1.address);
        vault.connect(investor1).redeem(_10k, investor1.address);
        vault.connect(investor1).redeem(_10k, investor1.address);
        vault.connect(investor1).redeem(_10k, investor1.address);

        await vault.getWithdrawalQueueInfo(0);
        await vault.getWithdrawalQueueInfo(1);
        await vault.getWithdrawalQueueInfo(5);

        await vault.getWithdrawalUserInfo(investor1.address);
        await vault.getWithdrawalUserInfo(investor1.address);

        await expect(
          vault.connect(investor1).processWithdrawalQueue(1)
        ).to.be.revertedWithCustomError(vault, "TBillNoPermission");
        await expect(
          vault.connect(operator).processWithdrawalQueue(5)
        ).to.be.revertedWithCustomError(vault, "TBillInvalidInput");
        await vault.connect(operator).processWithdrawalQueue(1);

        tbillOracle = await deployContract<TBillPriceOracle>(
          "TBillPriceOracle",
          tbillOracleDecimal,
          tbillInitDeviation,
          "0", // price
          "0", // closing nav price
          operator.address,
          owner.address
        );
      });
    });

    it("should fail redeem when sender is a non-kyc user", async function () {
      vault.connect(investor1).deposit(_100k, investor1.address);
      await expect(
        vault.connect(non_kyc).redeem(10000, investor1.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
    });

    it("should fail redeem when receiver is a non-kyc user", async function () {
      vault.connect(investor1).deposit(_100k, investor1.address);
      await expect(
        vault.connect(investor1).redeem(10000, non_kyc.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
    });

    it("should fail redeem when receiver is a banned kyc user", async function () {
      vault.connect(investor1).deposit(_100k, investor1.address);
      await kycManagerIns.bannedInBulk([investor2.address]);
      await expect(
        vault.connect(investor1).redeem(10000, investor2.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
    });

    it("claim service fee", async function () {
      await feeManager.setManagementFeeRate(managementFeeRate);
      // deposit 1M ok
      await vault.connect(investor1).deposit(_1M, investor1.address);
      // set weekend
      await vault.connect(operator).updateEpoch(true);
      await vault.connect(investor1).redeem(_100k, investor1.address);
      //await vault.connect(operator).claimServiceFee(0);
      await expect(vault.claimServiceFee(_1$)).to.revertedWithCustomError(
        vault,
        "TBillNoPermission"
      );
      await expect(
        vault.connect(operator).claimServiceFee(_1$)
      ).to.revertedWith("ERC20: transfer amount exceeds balance");
      await usdcTokenIns.connect(investor2).transfer(vault.address, _50$);
      await vault.connect(operator).claimServiceFee(_1$);
    });

    it("sender: non-kyc, banned ", async function () {
      // deposit/redeem and transfer normal
      await vault.connect(investor1).deposit(_100k, investor2.address);
      await vault.connect(investor1).deposit(_100k, investor1.address);
      await vault.connect(investor1).redeem(_10k, investor1.address);
      await vault.connect(investor1).transfer(investor3.address, _10k);

      // sender banned, can't deposit/redeem and transfer
      await kycManagerIns.bannedInBulk([investor1.address]);
      await expect(
        vault.connect(investor1).deposit(_100k, investor2.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).redeem(_10k, investor2.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).transfer(investor3.address, _10k)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");

      // sender unbanned, can deposit/redeem and transfer
      await kycManagerIns.unBannedInBulk([investor1.address]);
      await vault.connect(investor1).deposit(_100k, investor2.address);
      await vault.connect(investor1).redeem(_10k, investor2.address);
      await vault.connect(investor1).transfer(investor3.address, _10k);

      // sender revoke kyc, can't deposit/redeem and transfer
      await kycManagerIns.revokeKycInBulk([investor1.address]);
      await expect(
        vault.connect(investor1).deposit(_100k, investor1.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).redeem(_10k, investor1.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).transfer(investor3.address, _10k)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
    });

    it("receiver: non-kyc, banned ", async function () {
      // deposit/redeem and transfer normal
      await vault.connect(investor1).deposit(_100k, investor2.address);
      await vault.connect(investor1).deposit(_100k, investor1.address);
      await vault.connect(investor1).redeem(_10k, investor2.address);
      await vault.connect(investor1).transfer(investor2.address, _10k);

      // banned receiver, can't deposit/redeem and transfer
      await kycManagerIns.bannedInBulk([investor2.address]);
      await expect(
        vault.connect(investor1).deposit(_100k, investor2.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).redeem(_10k, investor2.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).transfer(investor2.address, _10k)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");

      // unbanned receiver, can deposit/redeem and transfer
      await kycManagerIns.unBannedInBulk([investor2.address]);
      await vault.connect(investor1).deposit(_100k, investor2.address);
      await vault.connect(investor1).redeem(_10k, investor2.address);
      await vault.connect(investor1).transfer(investor2.address, _10k);

      // revoke kyc receiver, can't deposit/redeem and transfer
      await kycManagerIns.revokeKycInBulk([investor2.address]);
      await expect(
        vault.connect(investor1).deposit(_100k, investor2.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).redeem(_10k, investor2.address)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).transfer(investor2.address, _10k)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidateKyc");
    });

    it("receiver is zero address", async function () {
      await vault.connect(investor1).deposit(_100k, investor1.address);
      // deposit fail
      await expect(
        kycManagerIns.grantKycInBulk([ZERO_ADDRESS], [2])
      ).to.revertedWith("invalid address");
      // redeem fail
      await expect(
        vault.connect(investor1).redeem(_10k, ZERO_ADDRESS)
      ).to.revertedWithCustomError(vault, "TBillInvalidateKyc");
      await expect(
        vault.connect(investor1).transfer(ZERO_ADDRESS, _10k)
      ).to.revertedWith("ERC20: transfer to the zero address");
    });
  });

  describe("deposit/withdraw tbill/usdc 1:1", () => {
    it("deposit 100k", async function () {
      expect(await vault.firstDepositMap(investor1.address)).to.equal(false);
      await vault.connect(investor1).deposit(_100k, investor1.address);
      let [oeFee, pFee, totalFee] = await vault.txsFee(
        DEPOSIT,
        investor1.address,
        _100k
      );

      let fee = totalFee;
      console.log("txsFee", oeFee.toString(), pFee.toString(), fee.toString());

      expect(await vault.balanceOf(investor1.address)).to.equal(
        _100k.sub(fee)
      );
      expect(await vault.totalAssets()).to.equal(_100k.sub(fee));
      expect(await vault.firstDepositMap(investor1.address)).to.equal(true);

      await vault.connect(investor1).deposit(_100k, investor2.address);
      expect(await vault.balanceOf(investor2.address)).to.equal(
        _100k.sub(fee)
      );
    });

    it("redeem 10k, redeem 100k", async function () {
      // deposit
      await vault.connect(investor1).deposit(_300k, investor1.address);
      let tbillBeforeRedeem = await vault.balanceOf(investor1.address);
      let usdcBeforeRedeem = await usdcTokenIns.balanceOf(investor1.address);
      console.log("tbillBeforeRedeem", tbillBeforeRedeem.toString());
      console.log("usdcBeforeRedeem", usdcBeforeRedeem.toString());

      // redeem 10k
      await expect(vault.connect(investor1).redeem(_10k, investor1.address))
        .emit(vault, "AddToWithdrawalQueue")
        .withArgs(investor1.address, investor1.address, _10k, anyValue);
      expect(await vault.balanceOf(investor1.address)).to.equal(
        tbillBeforeRedeem.sub(_10k)
      );

      // redeem 100k
      tbillBeforeRedeem = await vault.balanceOf(investor1.address);
      usdcBeforeRedeem = await usdcTokenIns.balanceOf(investor1.address);
      await vault.connect(investor1).redeem(_100k, investor1.address);
      expect(await vault.balanceOf(investor1.address)).to.equal(
        tbillBeforeRedeem.sub(_100k)
      );
      expect(await usdcTokenIns.balanceOf(investor1.address)).to.equal(
        usdcBeforeRedeem
      );
    });

    it("deposit 150k, deposit 10k", async function () {
      // deposit 150k
      let tbillBeforeDeposit = await vault.balanceOf(investor1.address);
      let usdcBeforeDeposit = await usdcTokenIns.balanceOf(investor1.address);
      await vault.connect(investor1).deposit(_150k, investor1.address);
      expect(await usdcTokenIns.balanceOf(investor1.address)).to.equal(
        usdcBeforeDeposit.sub(_150k)
      );
      expect(await vault.balanceOf(investor1.address)).to.equal(
        tbillBeforeDeposit.add(_150k).sub(_75$)
      );

      // deposit 10k
      tbillBeforeDeposit = await vault.balanceOf(investor1.address);
      usdcBeforeDeposit = await usdcTokenIns.balanceOf(investor1.address);
      await vault.connect(investor1).deposit(_10k, investor1.address);
      expect(await usdcTokenIns.balanceOf(investor1.address)).to.equal(
        usdcBeforeDeposit.sub(_10k)
      );
      expect(await vault.balanceOf(investor1.address)).to.equal(
        tbillBeforeDeposit.add(_10k).sub(_25$)
      );

      await vault.connect(investor1).deposit(_100k, investor1.address);
      await vault.connect(investor1).redeem(_100k, investor1.address);
    });
  });

  describe("TbillV4 setTotalSupplyCap", () => {
    it("should allow maintainer to set a valid total supply cap", async function () {
      const newSupplyCap = _1M; // 1M cap
      await expect(vault.connect(maintainer).setTotalSupplyCap(newSupplyCap))
        .to.emit(vault, "TotalSupplyCap")
        .withArgs(newSupplyCap);

      const totalSupplyCap = await vault.totalSupplyCap();
      expect(totalSupplyCap).to.equal(newSupplyCap);
    });

    it("should revert if supply cap is less than current total supply", async function () {
      await vault.connect(maintainer).setTotalSupplyCap(_1M);
      await vault.connect(investor1).deposit(_300k, investor1.address);

      const currentTotalSupply = await vault.totalSupply();
      const invalidSupplyCap = currentTotalSupply.sub(_10k); // Less than current total supply

      await expect(
        vault.connect(maintainer).setTotalSupplyCap(invalidSupplyCap)
      ).to.be.revertedWithCustomError(vault, "TBillInvalidInput");
    });

    it("should revert if called by a non-maintainer", async function () {
      const newSupplyCap = _1M; // 1M cap

      await expect(
        vault.connect(investor1).setTotalSupplyCap(newSupplyCap)
      ).to.be.revertedWithCustomError(vault, "TBillNoPermission");
    });

    it("should emit TotalSupplyCap event with the correct value", async function () {
      const newSupplyCap = _1M; // 1M cap

      await expect(vault.connect(maintainer).setTotalSupplyCap(newSupplyCap))
        .to.emit(vault, "TotalSupplyCap")
        .withArgs(newSupplyCap);
    });

    it("should revert if the new mint surpasses the cap", async function () {
      const newSupplyCap = _1M; // 1M cap
      await vault.connect(maintainer).setTotalSupplyCap(newSupplyCap);

      await vault.connect(investor1).deposit(_300k, investor1.address);

      const currentTotalSupply = await vault.totalSupply();
      const invalidMintAmount = newSupplyCap.sub(currentTotalSupply).add(_100k); // Exceeds cap

      await expect(
        vault.connect(investor1).deposit(invalidMintAmount, investor1.address)
      ).to.be.revertedWithCustomError(vault, "TotalSupplyCapExceeded");
    });
  });

  describe("offRamp and offRmapQ", async () => {
    it("should success to offRamp usdc", async function () {
      await usdcTokenIns.transfer(vault.address, _100k);
      await vault.connect(operator).offRamp(_1$);
    });

    it("should success to offRampQ usdc", async function () {
      await usdcTokenIns.transfer(vault.address, _100k);
      await vault.connect(operator).offRampQ(usdcTokenIns.address, _1$);
    });

    it("should fail to offRampQ tbill", async function () {
      await expect(
        vault.connect(operator).offRampQ(vault.address, _1$)
      ).to.revertedWithCustomError(vault, "TBillInvalidInput");
    });

    it("should fail to offRamp tbill by non operator", async function () {
      await expect(
        vault.connect(investor1).offRamp(_1$)
      ).to.be.revertedWithCustomError(vault, "TBillNoPermission");

      await expect(
        vault.connect(investor1).offRampQ(usdcTokenIns.address, _1$)
      ).to.be.revertedWithCustomError(vault, "TBillNoPermission");
    });
  });

  describe("setter addresses", async function () {
    await expect(
      vault.connect(owner).setOplTreasury(ZERO_ADDRESS)
    ).to.revertedWithCustomError(vault, "TBillZeroAddress");
    await expect(
      vault.connect(owner).setFeeManager(ZERO_ADDRESS)
    ).to.revertedWithCustomError(vault, "TBillZeroAddress");
    await expect(
      vault.connect(owner).setKycManager(ZERO_ADDRESS)
    ).to.revertedWithCustomError(vault, "TBillZeroAddress");
    await expect(
      vault.connect(owner).setTBillPriceFeed(ZERO_ADDRESS)
    ).to.revertedWithCustomError(vault, "TBillZeroAddress");
    await expect(
      vault.connect(owner).setController(ZERO_ADDRESS)
    ).to.revertedWithCustomError(vault, "TBillZeroAddress");
    await expect(
      vault.connect(owner).setTreasury(ZERO_ADDRESS)
    ).to.revertedWithCustomError(vault, "TBillZeroAddress");
    await expect(
      vault.connect(owner).setQTreasury(ZERO_ADDRESS)
    ).to.revertedWithCustomError(vault, "TBillZeroAddress");
    await expect(
      vault.connect(operator).setMaintainer(ZERO_ADDRESS)
    ).to.revertedWith("Ownable: caller is not the owner");
    await expect(
      vault.connect(operator).setOperator([ZERO_ADDRESS], [true])
    ).to.revertedWithCustomError(vault, "TBillNoPermission");
  });
});
