use anchor_lang::prelude::*;

#[error_code]
pub enum AxelError {
    #[msg("Car cost must be exactly divisible by price per share")]
    InvalidTokenSupplyDivision,

    #[msg("Price per share must be greater than zero")]
    ZeroPricePerShare,

    #[msg("Project is not Active")]
    ProjectNotActive,

    #[msg("Investor is not whitelisted")]
    InvestorNotWhitelisted,

    #[msg("Token amount must be greater than zero")]
    ZeroPurchase,

    #[msg("Vault does not have enough tokens")]
    InsufficientVaultBalance,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Unauthorized: signer is not admin")]
    Unauthorized,

    #[msg("Revenue vault address mismatch")]
    InvalidRevenueVault,

    #[msg("Deposit amount must be greater than zero")]
    ZeroDepositAmount,

    #[msg("Period index does not match expected next period")]
    InvalidPeriodIndex,

    #[msg("No tokens have been sold yet")]
    NoTokensSold,

    #[msg("Revenue period does not belong to this project")]
    RevenuePeriodMismatch,

    #[msg("Invalid token account")]
    InvalidTokenAccount,

    #[msg("Investor holds zero tokens")]
    ZeroTokenBalance,

    #[msg("Calculated payout is zero")]
    ZeroPayout,

    #[msg("Project is not Paused")]
    ProjectNotPaused,

    #[msg("Signer is not the registered oracle")]
    UnauthorizedOracle,
}
