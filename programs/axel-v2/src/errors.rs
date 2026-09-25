use anchor_lang::prelude::*;

/// Error codes are part of the public interface: clients map them to messages.
/// Append new variants at the end only, so existing codes never shift.
#[error_code]
pub enum AxelError {
    // Authorization and configuration
    #[msg("Signer is not authorized for this action")]
    Unauthorized,
    #[msg("Address must not be the default public key")]
    InvalidAddress,
    #[msg("Fee exceeds the protocol hard cap")]
    FeeTooHigh,
    #[msg("Duration must be greater than zero")]
    InvalidDuration,
    #[msg("Allowed payment mints contain a duplicate")]
    DuplicatePaymentMint,
    #[msg("Demo KYC authority must differ from the KYC authority")]
    DemoAuthorityConflict,
    #[msg("New admin must differ from the current admin")]
    AdminUnchanged,
    #[msg("There is no pending admin to accept")]
    NoPendingAdmin,

    // Investor registry
    #[msg("Investor status None cannot be assigned")]
    InvalidInvestorStatus,
    #[msg("Investor flags contain unknown bits")]
    InvalidInvestorFlags,
    #[msg("An active investor must expire in the future")]
    InvalidExpiry,
    #[msg("Jurisdiction must be an ISO 3166-1 numeric code")]
    InvalidJurisdiction,
    #[msg("Demo KYC key may only assign the DEMO flag with the Demo provider")]
    DemoScopeViolation,
    #[msg("Demo KYC access cannot last longer than 30 days")]
    DemoExpiryTooLong,
    #[msg("Demo KYC key cannot modify a non-DEMO investor record")]
    DemoRecordImmutable,
    #[msg("Investor KYC is not active")]
    InvestorNotActive,
    #[msg("Investor KYC has expired")]
    InvestorExpired,
    #[msg("Investor is frozen")]
    InvestorFrozen,
    #[msg("Project does not accept DEMO investors")]
    DemoNotAllowed,

    // Project lifecycle
    #[msg("Instruction is not allowed in the current project state")]
    InvalidState,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Payment mint is not in the allowlist")]
    PaymentMintNotAllowed,
    #[msg("Payment mint has an unsupported Token-2022 extension")]
    UnsupportedPaymentMint,
    #[msg("Price per share must be greater than zero")]
    InvalidPrice,
    #[msg("Share supply must satisfy 0 < soft cap <= total shares")]
    InvalidShareSupply,
    #[msg("Raise duration is shorter than the configured minimum")]
    RaiseTooShort,
    #[msg("Activation window exceeds the configured maximum")]
    ActivationWindowTooLong,
    #[msg("Raise deadline has passed")]
    RaiseEnded,
    #[msg("Raise cannot be finalized yet")]
    RaiseNotFinalizable,
    #[msg("Purchase exceeds the remaining shares")]
    ExceedsSupply,
    #[msg("Total cost exceeds the allowed maximum")]
    SlippageExceeded,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Activation deadline has passed")]
    ActivationExpired,
    #[msg("There are no outstanding shares")]
    ZeroSupply,

    // Share ledger and transfer hook
    #[msg("Hook was invoked outside of a Token-2022 transfer")]
    NotTransferring,
    #[msg("Sender is not allowed to transfer shares")]
    SourceNotAllowed,
    #[msg("Recipient is not allowed to hold shares")]
    DestinationNotAllowed,
    #[msg("Recipient has no position in this project")]
    RecipientNotOnboarded,
    #[msg("Mint is not the share mint of this project")]
    ShareMintMismatch,
    #[msg("Position does not match the expected project or owner")]
    PositionMismatch,
    #[msg("Token balance does not match the position ledger")]
    LedgerMismatch,
    #[msg("Token account is not valid for this operation")]
    InvalidTokenAccount,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Nothing to refund")]
    NothingToRefund,
    #[msg("Position still holds shares or unclaimed revenue")]
    PositionNotEmpty,

    // Revenue and telemetry
    #[msg("Revenue period dates are invalid")]
    InvalidPeriodDates,
    #[msg("Too many telemetry entries in one transaction")]
    TooManyTelemetryEntries,
    #[msg("Telemetry dates must strictly increase")]
    TelemetryDateNotIncreasing,

    // Arithmetic
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Position checkpoint is ahead of the project accumulator")]
    CheckpointAhead,
    #[msg("Basis points exceed 10000")]
    InvalidBps,

    // Primary market
    #[msg("Token metadata is empty, too long, duplicated or uses a reserved key")]
    InvalidMetadata,
    #[msg("Operator and oracle must be different keys")]
    RoleConflict,
    #[msg("Acquisition document hash must not be empty")]
    InvalidDocumentHash,
    #[msg("Vault holds less than the amount it owes")]
    VaultShortfall,

    // Revenue and operations
    #[msg("Revenue report hash must not be empty")]
    InvalidReportHash,
    #[msg("Revenue deposit must be co-signed by the project's oracle")]
    InvalidAttestor,
    #[msg("Telemetry batch is empty")]
    EmptyTelemetryBatch,
    #[msg("Telemetry date must be a calendar date as YYYYMMDD")]
    InvalidTelemetryDate,
}
