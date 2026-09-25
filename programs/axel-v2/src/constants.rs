use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const INVESTOR_SEED: &[u8] = b"investor";
#[constant]
pub const PROJECT_SEED: &[u8] = b"project";
#[constant]
pub const POSITION_SEED: &[u8] = b"position";
#[constant]
pub const PERIOD_SEED: &[u8] = b"period";
#[constant]
pub const ESCROW_SEED: &[u8] = b"escrow";
#[constant]
pub const REVENUE_SEED: &[u8] = b"revenue";
#[constant]
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

#[constant]
pub const BPS_DENOMINATOR: u16 = 10_000;
/// Hard ceiling on the platform fee taken from a successful raise.
#[constant]
pub const MAX_RAISE_FEE_BPS: u16 = 500;
/// Hard ceiling on the platform fee taken from every revenue deposit.
#[constant]
pub const MAX_REVENUE_FEE_BPS: u16 = 2_000;

/// The demo KYC key can never grant access for longer than this.
#[constant]
pub const MAX_DEMO_KYC_DURATION: i64 = 30 * 24 * 60 * 60;

/// Upper bound of ISO 3166-1 numeric country codes; 0 means "not disclosed".
#[constant]
pub const MAX_JURISDICTION: u16 = 999;

#[constant]
pub const MAX_TELEMETRY_ENTRIES: u8 = 20;

/// Shares are whole units.
#[constant]
pub const SHARE_DECIMALS: u8 = 0;

/// Bounds on the share mint's token metadata. They keep `create_project` inside one
/// transaction and bound the compute spent on metadata writes.
#[constant]
pub const MAX_NAME_LEN: u8 = 32;
#[constant]
pub const MAX_SYMBOL_LEN: u8 = 10;
#[constant]
pub const MAX_URI_LEN: u8 = 200;
#[constant]
pub const MAX_METADATA_FIELDS: u8 = 8;
#[constant]
pub const MAX_METADATA_KEY_LEN: u8 = 16;
#[constant]
pub const MAX_METADATA_VALUE_LEN: u8 = 64;
