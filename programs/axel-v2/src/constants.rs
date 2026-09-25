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
