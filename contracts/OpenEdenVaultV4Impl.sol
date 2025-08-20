// SPDX-License-Identifier: MIT
pragma solidity =0.8.9;

// openzeppelin
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./DoubleQueueModified.sol";

// interface
import "./interfaces/IFeeManagerV3.sol";
import "./interfaces/IPartnerShipV4.sol";
import "./interfaces/IOpenEdenVaultV4.sol";
import "./interfaces/ITypes.sol";
import "./interfaces/IKycManager.sol";
import "./interfaces/IPriceFeed.sol";
import "./interfaces/IController.sol";
import "./interfaces/IRedemption.sol";

/// @title  OpenEdenVaultV4
/// @author OpenEden
/// @notice This contract is the main contract for OpenEden T-Bills
contract OpenEdenVaultV4 is
    ERC20Upgradeable,
    OwnableUpgradeable,
    IOpenEdenVault,
    UUPSUpgradeable
{
    using DoubleQueueModified for DoubleQueueModified.BytesDeque;
    using MathUpgradeable for uint256;

    // indicate the fixed bps unit, 1e4, will be used for calculating the fee and the depeg threshold
    uint256 private constant BPSUNIT = 1e4;

    // indicates the fixed usdc price, 1 usdc = 1e8
    uint256 private constant ONE = 1e8;

    // the supply cap of the vault
    uint256 public totalSupplyCap;

    // chainlink usdc price feed max time delay, 24 hours
    uint256 private reserve1; //maxTimeDelay;

    // tbill decimal scale factor,
    uint256 private tbillDecimalScaleFactor;

    // underlying token, usdc
    IERC20MetadataUpgradeable public underlying;

    // controller contract, pause/unpause deposit and withdraw
    IController public controller;

    // used to maintain the vault
    address public maintainer; // operator in V3

    // tbill price feed, used to calculate the price of tbill
    IPriceFeed public tbillUsdPriceFeed;

    // the wallet address to hold BUIDL, will fetch BUIDL from it to Vault
    address public reserve2; // reserve

    // address to receive tx fee
    address public oplTreasury;

    // address to receive underlying token
    address public treasury;

    // address to receive unexpected quarantine tokens
    address public qTreasury;

    // fee manager contract, used to calculate the fee
    IFeeManager public feeManager;

    // kyc manager contract, used to check the kyc status
    IKycManager public kycManager;

    // management fee, will be charged daily based on the total assets
    uint256 public unClaimedFee;

    // current epoch, will be updated when updateEpoch
    uint256 public epoch;

    // we only allow the operator to call the function once per day
    uint256 public lastUpdateTS; // currWeekendDeposit in V3

    // current weekend withdraw amount, will be used to calculate the weekend withdraw limit
    uint256 public timeBuffer; // currWeekendWithdraw in V3

    // indicate whether it is weekend, will be updated when updateEpoch
    bool public isWeekend;

    // withdraw queue data structure
    DoubleQueueModified.BytesDeque private withdrawalQueue;

    // indicate whether the user has deposited before
    mapping(address => bool) public firstDepositMap;

    // deposit amount map, will be used to calculate the deposit limit
    mapping(uint256 => uint256) private reserve3; // depositAmountMap

    // withdraw amount map, will be used to calculate the withdraw limit
    mapping(uint256 => uint256) private reserve4; //withdrawAmountMap;

    // useded to query the withdraw shares of the user that in the queue
    mapping(address => uint256) private withdrawalInfo;

    // partner ship contract, used to calculate the fee
    IPartnerShipV4 public partnerShip;

    // maintain the operator status
    mapping(address => bool) public operators;

    // for instant redeem - pluggable redemption contract
    IRedemption public redemptionContract;

    // redemption token (e.g., USYC, BUIDL, etc.) - configurable
    IERC20Upgradeable public reserve5; // previous buidl

    // address to receive management fee
    address public mgtFeeTreasury;

    // only operator can call this function
    modifier onlyOperator() {
        if (!operators[msg.sender]) revert TBillNoPermission(msg.sender);
        _;
    }

    modifier onlyMaintainer() {
        if (msg.sender != maintainer) revert TBillNoPermission(msg.sender);
        _;
    }

    /*//////////////////////////////////////////////////////////////
                          EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice deposit underlying to this contract and mint shares to the receiver
     * @dev will charge fees before mint, and the underlying will be transfered from the sender to Treasury
     * @param _assets a parameter just like in doxygen (must be followed by parameter name)
     * @param _receiver Documents the return variables of a contract's function state variable
     */
    function deposit(uint256 _assets, address _receiver) external {
        controller.requireNotPausedDeposit();

        address sender = _msgSender();
        _validateKyc(sender, _receiver);

        (uint256 minDeposit, ) = feeManager.getMinMaxDeposit();
        uint256 firstDepositAmt = feeManager.getFirstDeposit();

        if (_assets < minDeposit) revert TBillLessThanMin(_assets, minDeposit);
        if (!firstDepositMap[sender]) {
            if (_assets < firstDepositAmt)
                revert TBillLessThanFirstDeposit(_assets, firstDepositAmt);
            firstDepositMap[sender] = true;
        }

        _processDeposit(sender, _receiver, _assets);
    }

    /**
     * @notice redeem shares to underlying
     * @dev all withdraw requests will be put into a queue, and will be processed after get the sufficient assets
     * @param _shares the amount of shares to redeem
     * @param _receiver the address to receive the underlying
     */
    function redeem(uint256 _shares, address _receiver) external {
        controller.requireNotPausedWithdraw();

        address sender = _msgSender();
        _validateKyc(sender, _receiver);

        uint256 assets = _convertToAssets(_shares);
        (uint256 minWithdraw, ) = feeManager.getMinMaxWithdraw();
        if (assets < minWithdraw) revert TBillLessThanMin(assets, minWithdraw);

        _processWithdraw(sender, _receiver, _shares);
    }

    /**
     * @notice redeem shares to underlying instantly using the configured redemption system
     * @dev the withdraw request will be processed instantly, and the underlying will be transfered to the receiver
     * @param _shares the amount of shares to redeem
     * @param _receiver the address to receive the underlying
     */
    function redeemIns(
        uint256 _shares,
        address _receiver
    ) external returns (uint256) {
        controller.requireNotPausedWithdraw();

        address sender = _msgSender();
        _validateKyc(sender, _receiver);
        uint256 assets = _convertToAssets(_shares);

        // Step 1: Charge fees and get the request amount
        (, , uint256 totalFee) = txsFee(ActionType.REDEEM, sender, assets);

        // Step 2: Perform token transfers and redemptions
        return
            _processWithdrawIns(sender, _receiver, _shares, assets, totalFee);
    }

    /**
     * @notice cancel the first _len withdraw request in the queue, only maintainer can call this function
     * @dev will transfer the shares to the sender
     * @param _len the length of the cancel requests
     */
    function cancel(uint256 _len) external onlyMaintainer {
        if (_len > withdrawalQueue.length()) revert TBillInvalidInput(_len);
        controller.requireNotPausedWithdraw();
        uint256 totalShares;

        while (_len > 0) {
            bytes memory data = withdrawalQueue.popFront();

            (
                address sender,
                address receiver,
                uint256 shares,
                bytes32 prevId
            ) = _decodeData(data);

            unchecked {
                totalShares += shares;
                withdrawalInfo[receiver] -= shares;
                _len--;
            }
            _transfer(address(this), sender, shares);
            emit ProcessRedeemCancel(sender, receiver, shares, prevId);
        }
        emit Cancel(_len, totalShares);
    }

    /**
     * @dev transfer underlying from vault to treasury, only operator can call this function
     * @param _amt the amount of the token to transfer
     */
    function offRamp(uint256 _amt) external onlyOperator {
        _offRamp(address(underlying), treasury, _amt);
        emit OffRamp(treasury, _amt);
    }

    /**
     * @dev transfer unexpected tokens from vault to qtreasury, only operator can call this function
     * @param _token the address of the token to transfer
     * @param _amt the amount of the token to transfer
     */
    function offRampQ(address _token, uint256 _amt) external onlyOperator {
        if (_token == address(this))
            revert TBillInvalidInput(uint256(uint160(address(this))));
        _offRamp(_token, qTreasury, _amt);
        emit OffRampQ(qTreasury, _amt);
    }

    /**
     * @dev process the withdrawal queue, only operator can call this function
     * @param _len the length of the queue to process, 0 means process all
     */
    function processWithdrawalQueue(uint _len) external onlyOperator {
        uint256 length = withdrawalQueue.length();
        if (length == 0 || _len > length) revert TBillInvalidInput(_len);
        if (_len == 0) _len = length;

        uint256 totalWithdrawAssets;
        uint256 totalBurnShares;
        uint256 totalFees;

        for (uint count = 0; count < _len; ) {
            bytes memory data = withdrawalQueue.front();
            (
                address sender,
                address receiver,
                uint256 shares,
                bytes32 prevId
            ) = _decodeData(data);

            _validateKyc(sender, receiver);
            uint256 assets = _convertToAssets(shares);

            // 1. will not process the queue if the assets is not enough
            // 2. will process the queue by sequence, so if the first one is not enough, the rest will not be handled
            if (assets > onchainAssets()) {
                break;
            }

            // will calculate the fee based on the lastest fee rate, not the fee rate when the user redeem
            // if not enough, will revert
            (uint256 oeFee, int256 pFee, uint256 fee) = txsFee(
                ActionType.REDEEM,
                sender,
                assets
            );

            // collect the fee
            if (fee > 0) {
                SafeERC20Upgradeable.safeTransfer(
                    IERC20Upgradeable(underlying),
                    oplTreasury,
                    fee
                );
            }

            withdrawalQueue.popFront();
            uint256 trimmedAssets = assets - fee;
            unchecked {
                ++count;
                totalWithdrawAssets += trimmedAssets;
                totalBurnShares += shares;
                totalFees += fee;
                withdrawalInfo[receiver] -= shares;
            }

            _withdraw(
                address(this),
                receiver,
                address(this),
                trimmedAssets,
                shares
            );

            emit ProcessWithdraw(
                sender,
                receiver,
                assets,
                shares,
                trimmedAssets,
                shares,
                oeFee,
                pFee,
                fee,
                prevId,
                oplTreasury
            );
        }
        emit ProcessWithdrawalQueue(
            totalWithdrawAssets,
            totalBurnShares,
            totalFees
        );
    }

    /**
     * @dev will update the closeNavPrice, currently set to 7am sgt, 11:00 utc,
      Ensure the function can only be called after 20 hours
     * @param _isWeekend whether it is weekend
     */
    function updateEpoch(bool _isWeekend) external onlyOperator {
        if (lastUpdateTS != 0) {
            if (block.timestamp < lastUpdateTS + timeBuffer)
                revert TBillUpdateTooEarly(block.timestamp);
        }

        epoch++;
        isWeekend = _isWeekend;

        uint256 feeRate = feeManager.getManagementFeeRate();
        unClaimedFee += _calServiceFee(totalAssets(), feeRate);

        lastUpdateTS = block.timestamp;
        emit UpdateEpoch(unClaimedFee, epoch, isWeekend);
    }

    /**
     * @notice Set the flag indicating whether it's a weekend or not.
     * @dev Can only be called by the operator.
     * @param _isWeekend Boolean value indicating weekend status.
     */
    function setWeekendFlag(bool _isWeekend) external onlyOperator {
        isWeekend = _isWeekend;
        emit SetWeekendFlag(_isWeekend);
    }

    /**
     * @notice Claim a specified amount of service fees.
     * @dev Can only be called by the operator.
     * @param _amt Amount of service fees to be claimed.
     */
    function claimServiceFee(uint256 _amt) external onlyOperator {
        if (mgtFeeTreasury == address(0)) revert TBillZeroAddress();
        unClaimedFee -= _amt;

        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(underlying),
            mgtFeeTreasury,
            _amt
        );
        emit ClaimServiceFee(mgtFeeTreasury, _amt);
    }

    /**
     * @notice Update the address that receives the tx fee.
     * @dev Can only be called by the contract owner.
     * @param _opl Address of the new treasury.
     */
    function setOplTreasury(address _opl) external onlyOwner {
        if (_opl == address(0)) revert TBillZeroAddress();
        oplTreasury = _opl;
        emit SetOplTreasury(_opl);
    }

    /**
     * @notice Update the address that receives the service fee.
     * @dev Can only be called by the contract owner.
     * @param _treasury Address of the new treasury.
     */
    function setMgtFeeTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert TBillZeroAddress();
        mgtFeeTreasury = _treasury;
        emit SetMgtFeeTreasury(_treasury);
    }

    /**
     * @notice Update the Fee Manager address.
     * @dev Can only be called by the contract owner.
     * @param _feeManager Address of the new Fee Manager.
     */
    function setFeeManager(address _feeManager) external onlyOwner {
        if (_feeManager == address(0)) revert TBillZeroAddress();
        feeManager = IFeeManager(_feeManager);
        emit SetFeeManager(_feeManager);
    }

    /**
     * @notice Update the KYC Manager address.
     * @dev Can only be called by the contract owner.
     * @param _kycManager Address of the new KYC Manager.
     */
    function setKycManager(address _kycManager) external onlyOwner {
        if (_kycManager == address(0)) revert TBillZeroAddress();
        kycManager = IKycManager(_kycManager);
        emit SetKycManager(_kycManager);
    }

    /**
     * @notice Set a new price feed for TBill/USD.
     * @dev Can only be called by the contract owner.
     * @param _priceFeed Address of the new price feed.
     */
    function setTBillPriceFeed(address _priceFeed) external onlyOwner {
        if (_priceFeed == address(0)) revert TBillZeroAddress();
        tbillUsdPriceFeed = IPriceFeed(_priceFeed);
        emit SetTBillPriceFeed(_priceFeed);
    }

    /**
     * @notice Update the Controller address.
     * @dev Can only be called by the contract owner.
     * @param _controller Address of the new Controller.
     */
    function setController(address _controller) external onlyOwner {
        if (_controller == address(0)) revert TBillZeroAddress();
        controller = IController(_controller);
        emit SetController(_controller);
    }

    /**
     * @notice Set a new address to receive the service fee.
     * @dev Can only be called by the contract owner.
     * @param _treasury Address of the new treasury.
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert TBillZeroAddress();
        treasury = _treasury;
        emit UpdateTreasury(_treasury);
    }

    /**
     * @notice Set a new address to receive the Q-treasury fee.
     * @dev Can only be called by the contract owner.
     * @param _qTreasury Address of the new Q-treasury.
     */
    function setQTreasury(address _qTreasury) external onlyOwner {
        if (_qTreasury == address(0)) revert TBillZeroAddress();
        qTreasury = _qTreasury;
        emit UpdateQTreasury(_qTreasury);
    }

    /**
     * @notice Set the partner ship contract address
     * @dev Can only be called by the contract owner.
     * @param _partnerShip Address of the new partner ship contract
     */
    function setPartnerShip(address _partnerShip) external onlyMaintainer {
        partnerShip = IPartnerShipV4(_partnerShip);
        emit SetPartnerShip(_partnerShip);
    }

    /**
     * @notice Set the maintainer address.
     * @dev Can only be called by the contract owner.
     * @param _maintainer Address of the new maintainer.
     */
    function setMaintainer(address _maintainer) external onlyOwner {
        maintainer = _maintainer;
        emit SetMaintainer(_maintainer);
    }

    /**
     * @notice Set the operator address.
     * @dev Can only be called by the contract owner.
     * @param _operators Array of operator addresses.
     * @param statuses Array of operator status.
     */
    function setOperator(
        address[] memory _operators,
        bool[] memory statuses
    ) external onlyMaintainer {
        for (uint i = 0; i < _operators.length; i++) {
            address op = _operators[i];
            bool status = statuses[i];
            operators[op] = status;
            emit SetOperator(op, status);
        }
    }

    /**
     * @notice Set the time buffer for the operator to call the updateEpoch function
     * @dev Can only be called by the contract maintainer
     * @param _timeBuffer Time buffer in seconds
     */
    function setTimeBuffer(uint256 _timeBuffer) external onlyMaintainer {
        timeBuffer = _timeBuffer;
        emit SetTimeBuffer(_timeBuffer);
    }

    /**
     * @notice Retrieve withdrawal queue information for a given index.
     * @param _index Index to retrieve data from.
     * @return sender The sender's address.
     * @return receiver The receiver's address.
     * @return shares The number of shares.
     * @return id The ID associated with the withdrawal.
     */
    function getWithdrawalQueueInfo(
        uint256 _index
    )
        external
        view
        returns (address sender, address receiver, uint256 shares, bytes32 id)
    {
        if (withdrawalQueue.empty() || _index > withdrawalQueue.length() - 1) {
            return (address(0), address(0), 0, 0x0);
        }

        bytes memory data = bytes(withdrawalQueue.at(_index));
        (sender, receiver, shares, id) = _decodeData(data);
    }

    /**
     * @notice Retrieve withdrawal information for a specific user that is in the queue.
     * @param _user Address of the user.
     * @return shares Number of shares associated with the user.
     */
    function getWithdrawalUserInfo(
        address _user
    ) external view returns (uint256 shares) {
        return withdrawalInfo[_user];
    }

    /**
     * @notice Retrieve the length of the withdrawal queue.
     * @return Length of the withdrawal queue.
     */
    function getWithdrawalQueueLength() external view returns (uint256) {
        return withdrawalQueue.length();
    }

    //////////////////////////////////////////////////////////////
    //                        PUBLIC FUNCTIONS                   //
    //////////////////////////////////////////////////////////////

    /**
     * @notice Compute the transaction fee for a given asset amount, minimum fee is 25 usdc by default
     * @param _type The Type of this action (Deposit or Redeem)
     * @param _sender The address of the asset's origin.
     * @param _assets Asset amount to compute fee for.
     * @return oeFee Calculated transaction fee for OpenEden.
     * @return pFee Calculated partnership fee (can be negative).
     * @return totalFee Total calculated fee.
     */
    function txsFee(
        ActionType _type,
        address _sender,
        uint256 _assets
    ) public view returns (uint256 oeFee, int256 pFee, uint256 totalFee) {
        uint256 feePct = feeManager.getTxFeePct(_type, isWeekend);
        oeFee = (_assets * feePct) / BPSUNIT; // OpenEden fee (always positive)

        if (
            address(partnerShip) != address(0) &&
            partnerShip.isChildHasParent(_sender)
        ) {
            int256 pfeePct = partnerShip.getFeeByChildAndAction(_sender, _type);
            pFee = (int256(_assets) * pfeePct) / int256(BPSUNIT); // Partnership fee can be negative
        }

        // Add OpenEden fee (oeFee) to the partnership fee (pFee) which can be negative
        int256 combinedFee = int256(oeFee) + pFee;

        // Ensure the total fee is non-negative
        totalFee = combinedFee < 0 ? 0 : uint256(combinedFee);

        // If pFee is positive, check for minimum transaction fee
        if (pFee >= 0) {
            uint256 minTxsFee = feeManager.getMinTxsFee();
            totalFee = totalFee < minTxsFee ? minTxsFee : totalFee;
        }
    }

    /**
     * @notice Retrieve the on-chain assets amount.
     * @return assetAmt Amount of on-chain assets.
     */
    function onchainAssets() public view returns (uint256 assetAmt) {
        return IERC20Upgradeable(underlying).balanceOf(address(this));
    }

    /**
     * @notice Calculates the total assets in USDC by multiplying the current total supply with the tbillUsdc rate.
     * @return assetAmt The total assets in USDC.
     */
    function totalAssets() public view returns (uint256 assetAmt) {
        assetAmt = (totalSupply() * tbillUsdcRate()) / tbillDecimalScaleFactor;
    }

    /**
     * @notice Converts the T-bill to USDC rate by dividing the tbill/usd rate by usdc/usd rate.
     * @return rate The conversion rate of T-bill to USDC.
     */
    function tbillUsdcRate() public view returns (uint256 rate) {
        (, int256 answer, , uint256 updatedAt, ) = tbillUsdPriceFeed
            .latestRoundData();
        uint256 tbillUsdPrice = uint256(answer);
        if (answer < 0 || tbillUsdPrice < ONE) revert TBillInvalidPrice(answer);

        // For example, the last update is Friday 8:10 SGT,
        // Public Holidays: Saturday 8:10 SGT, Sunday 8:10 SGT, Monday 8:10 SGT
        // Next update: Tuesday 8:10 SGT
        // normally, the price will be updated every day, the max delay is 24*4 hours due to the public holidays.
        // will use 7 days as the max delay, 3 days for buffer

        if (block.timestamp - updatedAt > 7 days)
            revert TBillPriceOutdated(updatedAt);

        rate = (tbillUsdPrice * tbillDecimalScaleFactor) / ONE;
    }

    /**
     * @notice Fetches the decimal places of the tbill token, same as the underlying token.
     * @return The number of decimal places.
     */
    function decimals() public view virtual override returns (uint8) {
        return underlying.decimals();
    }

    /**
     * @notice Gives a preview of the shares equivalent for the given assets.
     * @param _assets Amount of assets.
     * @return Equivalent shares for the given assets.
     */
    function previewDeposit(uint256 _assets) public view returns (uint256) {
        return _convertToShares(_assets);
    }

    /**
     * @notice Gives a preview of the assets equivalent for the given shares.
     * @param _shares Amount of shares.
     * @return Equivalent assets for the given shares.
     */
    function previewRedeem(
        uint256 _shares
    ) public view virtual returns (uint256) {
        return _convertToAssets(_shares);
    }

    /**
     * @notice Set the first deposit flag for the given investor.
     * @param _investor Address of the investor.
     * @param _flag Flag to set.
     */
    function setFirstDeposit(
        address _investor,
        bool _flag
    ) external onlyMaintainer {
        firstDepositMap[_investor] = _flag;
    }

    /**
     * @notice Set the redemption contract and token addresses.
     * @param _redemptionContract Address of the redemption contract.
     */
    function setRedemption(
        address _redemptionContract
    ) external onlyMaintainer {
        redemptionContract = IRedemption(_redemptionContract);
        emit SetRedemption(_redemptionContract);
    }

    /**
     * @notice Set the total supply cap.
     */
    function setTotalSupplyCap(uint256 _supplyCap) external onlyMaintainer {
        if (_supplyCap < totalSupply() || _supplyCap > type(uint256).max)
            revert TBillInvalidInput(_supplyCap);
        totalSupplyCap = _supplyCap;
        emit TotalSupplyCap(totalSupplyCap);
    }

    /**
     * @notice Burn tokens from a specific wallet. Only maintainer can call this function.
     * @dev This function allows the maintainer to burn tokens from any wallet without requiring approval.
     * @param _from The address to burn tokens from.
     * @param _amount The amount of tokens to burn.
     */
    function burnFrom(address _from, uint256 _amount) external onlyMaintainer {
        if (_from == address(0)) revert TBillZeroAddress();
        if (_amount == 0) revert TBillInvalidInput(_amount);
        if (balanceOf(_from) < _amount) revert TBillInvalidInput(_amount);

        // address(this) is a placeholder
        _validateKyc(_from, address(this));
        _burn(_from, _amount);
        emit BurnFrom(_from, _amount);
    }

    /**
     * @notice Mint tokens to a specific wallet. Only maintainer can call this function.
     * @dev This function allows the maintainer to mint tokens to any wallet.
     * @param _to The address to mint tokens to.
     * @param _amount The amount of tokens to mint.
     */
    function mintTo(address _to, uint256 _amount) external onlyMaintainer {
        if (_to == address(0)) revert TBillZeroAddress();
        if (_amount == 0) revert TBillInvalidInput(_amount);
        // Check if minting would exceed the total supply cap
        if (totalSupply() + _amount > totalSupplyCap)
            revert TotalSupplyCapExceeded(
                totalSupply(),
                _amount,
                totalSupplyCap
            );

        // address(this) is a placeholder
        _validateKyc(address(this), _to);
        _mint(_to, _amount);
        emit MintTo(_to, _amount);
    }

    /**
     * @notice Reissue shares from one wallet to another.
     * @dev This function allows the maintainer to reissue shares from one wallet to another.
     * @param _oldWallet The address of the old wallet.
     * @param _newWallet The address of the new wallet.
     * @param _amount The amount of shares to reissue.
     */
    function reIssue(
        address _oldWallet,
        address _newWallet,
        uint256 _amount
    ) external onlyMaintainer {
        if (address(0) == _oldWallet || address(0) == _newWallet)
            revert TBillZeroAddress();
        if (_amount == 0) revert TBillInvalidInput(_amount);
        if (balanceOf(_oldWallet) < _amount) revert TBillInvalidInput(_amount);

        _validateKyc(_oldWallet, _newWallet);
        _burn(_oldWallet, _amount);
        _mint(_newWallet, _amount);
        emit ReIssue(_oldWallet, _newWallet, _amount);
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Handles the deposit logic, converting assets into shares, managing fees, and updating relevant state.
     * @param _sender The sender of the assets.
     * @param _receiver The receiver of the shares.
     * @param _assets Amount of assets being deposited.
     */
    function _processDeposit(
        address _sender,
        address _receiver,
        uint256 _assets
    ) internal {
        (uint256 oeFee, int256 pFee, uint256 totalFee) = txsFee(
            ActionType.DEPOSIT,
            _sender,
            _assets
        );

        // collect the fee
        if (totalFee > 0) {
            SafeERC20Upgradeable.safeTransferFrom(
                IERC20Upgradeable(underlying),
                _sender,
                oplTreasury,
                totalFee
            );
        }

        uint256 trimmedAssets = _assets - totalFee;
        uint256 shares = _convertToShares(trimmedAssets);

        if (totalSupply() + shares > totalSupplyCap)
            revert TotalSupplyCapExceeded(
                totalSupply(),
                shares,
                totalSupplyCap
            );

        _deposit(_sender, _receiver, trimmedAssets, shares, treasury);
        emit ProcessDeposit(
            _sender,
            _receiver,
            _assets,
            shares,
            oeFee,
            pFee,
            totalFee,
            oplTreasury,
            treasury
        );
    }

    /**
     * @dev Internal function to process a withdrawal.
     * @param _sender Address of the sender.
     * @param _receiver Address of the receiver.
     * @param _shares Number of shares to withdraw.
     */
    function _processWithdraw(
        address _sender,
        address _receiver,
        uint256 _shares
    ) internal {
        withdrawalInfo[_receiver] += _shares;

        bytes32 id = keccak256(
            abi.encode(
                _sender,
                _receiver,
                _shares,
                block.timestamp,
                withdrawalQueue.length()
            )
        );

        bytes memory data = abi.encode(_sender, _receiver, _shares, id);
        withdrawalQueue.pushBack(data);

        _transfer(_sender, address(this), _shares);
        emit AddToWithdrawalQueue(_sender, _receiver, _shares, id);
    }

    function _processWithdrawIns(
        address _sender,
        address _receiver,
        uint256 _shares,
        uint256 _assets, // USDC
        uint256 _totalFee
    ) internal returns (uint256) {
        // 1. transfer shares from sender to vault
        _transfer(_sender, address(this), _shares);
        uint256 usdcReceived = redemptionContract.redeem(_assets);

        if (usdcReceived < _assets)
            revert TBillReceiveUSDCFailed(usdcReceived, _assets);

        uint256 _assetsToUser = _assets - _totalFee;
        // 4. transfer assets to receiver
        _withdraw(
            address(this),
            _receiver,
            address(this),
            _assetsToUser,
            _shares
        );

        // 5. transfer fee to treasury
        if (_totalFee > 0) {
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(underlying),
                oplTreasury,
                _totalFee
            );
        }

        emit ProcessWithdraw(
            _sender,
            _receiver,
            _assets,
            _shares,
            _assetsToUser,
            _shares,
            0,
            0,
            _totalFee,
            0x0,
            oplTreasury
        );
        return _assetsToUser;
    }

    /**
     * @dev Converts the number of shares to asset amount.
     * @param _shares Number of shares to convert.
     * @return assets Equivalent asset amount.
     */
    function _convertToAssets(
        uint256 _shares
    ) internal view returns (uint256 assets) {
        assets = _shares.mulDiv(tbillUsdcRate(), tbillDecimalScaleFactor);
    }

    /**
     * @dev Converts asset amount to the equivalent number of shares.
     * @param _assets Asset amount to convert.
     * @return shares Equivalent number of shares.
     */
    function _convertToShares(
        uint256 _assets
    ) internal view returns (uint256 shares) {
        shares = _assets.mulDiv(tbillDecimalScaleFactor, tbillUsdcRate());
    }

    /**
     * @dev Off-ramp function to transfer the specified token amount.
     * @param _token The token to transfer.
     * @param _to Destination address.
     * @param _amt Amount of token to transfer.
     */
    function _offRamp(address _token, address _to, uint256 _amt) internal {
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(_token), _to, _amt);
    }

    /**
     * @dev Hook that gets called before tokens are transferred. Used for KYC validations.
     * @param _from Sender address.
     * @param _to Receiver address.
     */
    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256
    ) internal view override {
        /* _mint() or _burn() will set one of to address(0)
         *  no need to limit for these scenarios
         */
        if (_from == address(0) || _to == address(0)) {
            return;
        }
        _validateKyc(_from, _to);
    }

    /**
     * @dev Authorizes a new implementation upgrade.
     * @param _newImpl Address of the new implementation.
     */
    function _authorizeUpgrade(address _newImpl) internal override onlyOwner {}

    /**
     * @dev Calculate service fee for given asset amount.
     * @param _assets Asset amount.
     * @param _rate Rate for calculating service fee.
     * @return fee Calculated service fee.
     */
    function _calServiceFee(
        uint256 _assets,
        uint256 _rate
    ) internal pure returns (uint256 fee) {
        fee = (_assets * _rate) / (365 * BPSUNIT);
    }

    /**
     * @dev Common workflow for depositing/minting.
     * @param _sender Sender's address.
     * @param _receiver Receiver's address.
     * @param _assets Amount of assets to deposit.
     * @param _shares Number of shares to mint.
     * @param _assetsTo Address to transfer the assets to.
     */
    function _deposit(
        address _sender,
        address _receiver,
        uint256 _assets,
        uint256 _shares,
        address _assetsTo
    ) internal {
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(underlying),
            _sender,
            _assetsTo,
            _assets
        );
        _mint(_receiver, _shares);

        emit Deposit(_receiver, _assets, _shares);
    }

    /**
     * @dev Common workflow for withdrawing/redeeming.
     * @param _caller Caller's address.
     * @param _receiver Receiver's address.
     * @param _owner Owner's address.
     * @param _assets Amount of assets to withdraw.
     * @param _shares Number of shares to burn.
     */
    function _withdraw(
        address _caller,
        address _receiver,
        address _owner,
        uint256 _assets,
        uint256 _shares
    ) internal {
        if (_caller != _owner) {
            _spendAllowance(_owner, _caller, _shares);
        }

        _burn(_owner, _shares);
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(underlying),
            _receiver,
            _assets
        );

        emit Withdraw(_caller, _receiver, _owner, _assets, _shares);
    }

    /**
     * @dev Decodes a given data bytes into its components.
     * @param _data Encoded data bytes.
     * @return sender Sender's address.
     * @return receiver Receiver's address.
     * @return shares Number of shares.
     * @return prevId Previous ID.
     */
    function _decodeData(
        bytes memory _data
    )
        internal
        pure
        returns (
            address sender,
            address receiver,
            uint256 shares,
            bytes32 prevId
        )
    {
        (sender, receiver, shares, prevId) = abi.decode(
            _data,
            (address, address, uint256, bytes32)
        );
    }

    /**
     * @dev Validates the KYC status of the given addresses.
     * @param _from Sender's address.
     * @param _to Receiver's address.
     */
    function _validateKyc(address _from, address _to) internal view {
        bool res = kycManager.isKyc(_from) &&
            kycManager.isKyc(_to) &&
            !kycManager.isBanned(_from) &&
            !kycManager.isBanned(_to);

        if (!res) revert TBillInvalidateKyc(_from, _to);
    }
}
