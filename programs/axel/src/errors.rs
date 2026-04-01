use anchor_lang::prelude::*;

#[error_code]
pub enum AxelError {
    #[msg("Car cost must be exactly divisible by price per share")]
    InvalidTokenSupplyDivision,

    #[msg("Price per share must be greater than zero")]
    ZeroPricePerShare,

    #[msg("Minimum raise cannot exceed car cost")]
    MinRaiseExceedsCarCost,

    #[msg("Deadline must be in the future")]
    DeadlineInPast,
}
