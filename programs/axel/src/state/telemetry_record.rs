use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TelemetryRecord {
    pub project: Pubkey,

    /// Date identifier (e.g. 20260401 for 2026-04-01)
    pub date: u32,

    /// SHA-256 hash of the Yandex Pro telemetry data
    pub data_hash: [u8; 32],

    /// Oracle that submitted this record
    pub oracle_pubkey: Pubkey,

    /// When recorded (Unix timestamp)
    pub recorded_at: i64,

    pub bump: u8,
}
