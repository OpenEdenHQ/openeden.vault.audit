import { withSaveAndVerify } from "./contracts-helpers";
import { getFirstSigner } from "./contracts-getters";
import { eContractid } from "./types";

import {
  OpenEdenVaultV2__factory,
  OpenEdenVaultV3__factory,
  OpenEdenVaultV5__factory,
  Controller__factory,
  FeeManager__factory,
  KycManager__factory,
  TBillPriceOracle__factory,
  TimelockController__factory,
  PartnerShip__factory,
  USDC__factory,
  MockBUIDL__factory,
  MockBuidlRedemption__factory,
} from "../typechain-types";
import { FeeManagerConfig } from "./parameter";
import { PartnerShip } from "../typechain-types/contracts/PartnerShip";

export const deployUSDC = async (verify?: boolean) =>
  withSaveAndVerify(
    await new USDC__factory(await getFirstSigner()).deploy(),
    eContractid.MockUSDC,
    [],
    verify
  );

export const deployMockBuidl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new MockBUIDL__factory(await getFirstSigner()).deploy(),
    eContractid.MockBUIDL,
    [],
    verify
  );

export const deployMockBuidlRedemption = async (
  buidl: string,
  redmption: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockBuidlRedemption__factory(await getFirstSigner()).deploy(
      buidl,
      redmption
    ),
    eContractid.MockBuidlRedemption,
    [buidl, redmption],
    verify
  );

export const deployKycManager = async (verify?: boolean) =>
  withSaveAndVerify(
    await new KycManager__factory(await getFirstSigner()).deploy(),
    eContractid.KycManager,
    [],
    verify
  );

export const deployFeeManager = async (
  para: FeeManagerConfig,
  verify?: boolean
) =>
  withSaveAndVerify(
    await new FeeManager__factory(await getFirstSigner()).deploy(
      para.txFeeWorkdayDepositPct,
      para.txFeeWorkdayWithdrawPct,
      para.txFeeHolidayDepositPct,
      para.txFeeHolidayWithdrawPct,
      para.maxHolidayDepositPct,
      para.maxHolidayAggDepositPct,
      para.firstDeposit,
      para.minDeposit,
      para.maxDeposit,
      para.minWithdraw,
      para.maxWithdraw
      // para.managementFeeRate
    ),
    eContractid.FeeManager,
    [
      para.txFeeWorkdayDepositPct.toString(),
      para.txFeeWorkdayWithdrawPct.toString(),
      para.txFeeHolidayDepositPct.toString(),
      para.txFeeHolidayWithdrawPct.toString(),
      para.maxHolidayDepositPct.toString(),
      para.maxHolidayAggDepositPct.toString(),
      para.firstDeposit.toString(),
      para.minDeposit.toString(),
      para.maxDeposit.toString(),
      para.minWithdraw.toString(),
      para.maxWithdraw.toString(),
      // para.managementFeeRate.toString(),
    ],
    verify
  );

export const deployController = async (
  operator: string,
  admin: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    await new Controller__factory(await getFirstSigner()).deploy(
      operator,
      admin
    ),
    eContractid.Controller,
    [operator, admin],
    verify
  );

export const deployTBillPriceFeed = async (
  decimals: number,
  deviation: number,
  initPrice: number,
  closeNavPrice: number,
  operator: string,
  admin: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    await new TBillPriceOracle__factory(await getFirstSigner()).deploy(
      decimals,
      deviation,
      initPrice,
      closeNavPrice,
      operator,
      admin
    ),
    eContractid.TBillPriceFeed,
    [
      decimals.toString(),
      deviation.toString(),
      initPrice.toString(),
      closeNavPrice.toString(),
      operator,
      admin,
    ],
    verify
  );

export const deployTimelock = async (
  minDelay: number,
  proposers: string[],
  executors: string[],
  admin: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    await new TimelockController__factory(await getFirstSigner()).deploy(
      minDelay,
      proposers,
      executors,
      admin
    ),
    eContractid.TimeLock,
    [minDelay.toString(), proposers, executors, admin.toString()],
    verify
  );

export const deployPartnerShip = async (verify?: boolean) =>
  withSaveAndVerify(
    await new PartnerShip__factory(await getFirstSigner()).deploy(),
    eContractid.PartnerShip,
    [],
    verify
  );

export const deployVaultV2Impl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new OpenEdenVaultV2__factory(await getFirstSigner()).deploy(),
    eContractid.VaultV2Impl,
    [],
    verify
  );

export const deployVaultV3Impl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new OpenEdenVaultV3__factory(await getFirstSigner()).deploy(),
    eContractid.VaultV3Impl,
    [],
    verify
  );

export const deployVaultV4Impl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new OpenEdenVaultV4__factory(await getFirstSigner()).deploy(),
    eContractid.VaultV4Impl,
    [],
    verify
  );
