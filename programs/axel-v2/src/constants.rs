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
pub const RECOVERY_SEED: &[u8] = b"recovery";

#[constant]
pub const BPS_DENOMINATOR: u16 = 10_000;
/// Hard ceiling on the platform fee taken from a successful raise.
#[constant]
pub const MAX_RAISE_FEE_BPS: u16 = 500;
/// Hard ceiling on the platform fee taken from every revenue deposit.
#[constant]
pub const MAX_REVENUE_FEE_BPS: u16 = 2_000;

/// Longest raise a project may run. With the activation window cap it bounds how long an
/// investor's payment can sit in escrow before it is released or refundable.
#[constant]
pub const MAX_RAISE_DURATION: i64 = 180 * 24 * 60 * 60;
/// Longest activation window the config may allow; a funded raise that is not activated
/// within it becomes refundable.
#[constant]
pub const MAX_ACTIVATION_WINDOW: i64 = 90 * 24 * 60 * 60;

/// The demo KYC key can never grant access for longer than this.
#[constant]
pub const MAX_DEMO_KYC_DURATION: i64 = 30 * 24 * 60 * 60;

/// Upper bound of ISO 3166-1 numeric country codes; 0 means "not disclosed".
#[constant]
pub const MAX_JURISDICTION: u16 = 999;

#[constant]
pub const MAX_TELEMETRY_ENTRIES: u8 = 20;

/// Shortest time the affected owner has to veto a share recovery. It rules out a seizure
/// within one transaction and still fits a devnet demo. Mainnet must configure at least
/// 72 hours and keep the admin role in a Squads multisig (see the program's README).
#[constant]
pub const MIN_RECOVERY_DELAY: i64 = 60 * 60;
/// Longest recovery delay; it catches a delay given in milliseconds instead of seconds.
#[constant]
pub const MAX_RECOVERY_DELAY: i64 = 30 * 24 * 60 * 60;

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
