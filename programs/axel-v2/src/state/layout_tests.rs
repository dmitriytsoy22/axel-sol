//! Account sizes and memcmp offsets are part of the client interface.

use anchor_lang::prelude::Pubkey;
use anchor_lang::{AccountSerialize, Discriminator};

use super::*;

fn serialize<T: AccountSerialize>(account: &T) -> Vec<u8> {
    let mut data = Vec::new();
    account.try_serialize(&mut data).unwrap();
    data
}

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}

#[test]
fn config_layout() {
    let config = Config {
        admin: key(1),
        pending_admin: key(2),
        kyc_authority: key(3),
        demo_kyc_authority: key(4),
        treasury: key(5),
        raise_fee_bps: 1,
        revenue_fee_bps: 2,
        min_raise_duration: 3,
        max_activation_window: 4,
        allowed_payment_mints: [key(6), key(7), key(8), key(9)],
        paused: true,
        project_count: 5,
        bump: 6,
        _reserved: [0; 32],
    };
    let data = serialize(&config);
    assert_eq!(Config::SPACE, 358);
    assert_eq!(data.len(), Config::SPACE);
    assert_eq!(&data[..8], Config::DISCRIMINATOR);
    assert_eq!(&data[8..40], key(1).as_ref());
}

#[test]
fn investor_layout() {
    let investor = Investor {
        wallet: key(1),
        status: InvestorStatus::Frozen,
        flags: Investor::FLAG_DEMO,
        jurisdiction: 398,
        expires_at: 10,
        updated_at: 11,
        provider: KycProvider::Demo,
        bump: 255,
    };
    let data = serialize(&investor);
    assert_eq!(Investor::SPACE, 62);
    assert_eq!(data.len(), Investor::SPACE);
    assert_eq!(&data[8..40], key(1).as_ref());
    assert_eq!(data[40], 3, "status");
    assert_eq!(data[41], 1, "flags");
    assert_eq!(&data[42..44], &398u16.to_le_bytes());
    assert_eq!(data[60], 2, "provider");
}

#[test]
fn project_layout() {
    let project = Project {
        share_mint: key(1),
        payment_mint: key(2),
        payment_token_program: key(3),
        operator: key(4),
        oracle: key(5),
        escrow_vault: key(6),
        revenue_vault: key(7),
        state: ProjectState::Closed,
        flags: Project::FLAG_ALLOW_DEMO,
        price_per_share: 1,
        total_shares: 2,
        soft_cap_shares: 3,
        shares_sold: 4,
        shares_refunded: 5,
        raise_deadline: 6,
        activation_window: 7,
        activation_deadline: 8,
        created_at: 9,
        activated_at: 10,
        closed_at: 11,
        raise_fee_bps: 12,
        revenue_fee_bps: 13,
        acc_per_share: 14,
        total_deposited_net: 15,
        total_fees: 16,
        total_claimed: 17,
        total_refunded: 18,
        period_count: 19,
        telemetry_head: [20; 32],
        telemetry_count: 21,
        last_telemetry_date: 22,
        acquisition_doc_hash: [23; 32],
        bump: 24,
        escrow_bump: 25,
        revenue_bump: 26,
        shares_retired: 27,
        _reserved: [0; 56],
    };
    let data = serialize(&project);
    assert_eq!(Project::SPACE, 517);
    assert_eq!(data.len(), Project::SPACE);
    assert_eq!(&data[8..40], key(1).as_ref());
    assert_eq!(data[232], 5, "state");
    assert_eq!(&data[453..461], &27u64.to_le_bytes(), "shares_retired");
}

#[test]
fn position_layout() {
    let position = Position {
        project: key(1),
        owner: key(2),
        shares: 3,
        acc_checkpoint: 4,
        accrued: 5,
        total_claimed: 6,
        paid_in: 7,
        bump: 8,
    };
    let data = serialize(&position);
    assert_eq!(Position::SPACE, 121);
    assert_eq!(data.len(), Position::SPACE);
    assert_eq!(&data[8..40], key(1).as_ref(), "project at offset 8");
    assert_eq!(&data[40..72], key(2).as_ref(), "owner at offset 40");
    assert_eq!(&data[72..80], &3u64.to_le_bytes());
}

#[test]
fn revenue_period_layout() {
    let period = RevenuePeriod {
        project: key(1),
        index: 2,
        period_start: 20260101,
        period_end: 20260131,
        gross: 3,
        fee: 4,
        net: 5,
        supply: 6,
        acc_after: 7,
        report_hash: [8; 32],
        attestor: key(12),
        telemetry_head: [9; 32],
        kind: RevenueKind::Final,
        deposited_at: 10,
        bump: 11,
    };
    let data = serialize(&period);
    assert_eq!(RevenuePeriod::SPACE, 206);
    assert_eq!(data.len(), RevenuePeriod::SPACE);
    assert_eq!(&data[8..40], key(1).as_ref(), "project at offset 8");
    assert_eq!(&data[40..44], &2u32.to_le_bytes());
    assert_eq!(&data[132..164], key(12).as_ref(), "attestor");
    assert_eq!(data[196], 1, "kind");
}

#[test]
fn position_settle_moves_checkpoint() {
    let mut position = Position {
        project: key(1),
        owner: key(2),
        shares: 40,
        acc_checkpoint: 2 << 64,
        accrued: 7,
        total_claimed: 0,
        paid_in: 0,
        bump: 0,
    };
    position.settle(5 << 64).unwrap();
    assert_eq!(position.accrued, 127);
    assert_eq!(position.acc_checkpoint, 5 << 64);
    assert!(position.settle(4 << 64).is_err());
}

#[test]
fn config_validation() {
    let valid = Config {
        admin: key(1),
        pending_admin: Pubkey::default(),
        kyc_authority: key(2),
        demo_kyc_authority: Pubkey::default(),
        treasury: key(3),
        raise_fee_bps: 500,
        revenue_fee_bps: 2_000,
        min_raise_duration: 60,
        max_activation_window: 604_800,
        allowed_payment_mints: [key(4), Pubkey::default(), Pubkey::default(), key(5)],
        paused: false,
        project_count: 0,
        bump: 255,
        _reserved: [0; 32],
    };
    valid.validate().unwrap();
    assert!(valid.is_payment_mint_allowed(&key(5)));
    assert!(!valid.is_payment_mint_allowed(&Pubkey::default()));
    assert!(!valid.demo_kyc_enabled());

    let rejects = |mutate: fn(&mut Config), error: crate::errors::AxelError| {
        let mut config = valid.clone();
        mutate(&mut config);
        assert_eq!(
            config.validate().unwrap_err(),
            anchor_lang::error::Error::from(error)
        );
    };
    use crate::errors::AxelError::*;
    rejects(|c| c.raise_fee_bps = 501, FeeTooHigh);
    rejects(|c| c.revenue_fee_bps = 2_001, FeeTooHigh);
    rejects(|c| c.min_raise_duration = 0, InvalidDuration);
    rejects(|c| c.max_activation_window = -1, InvalidDuration);
    rejects(|c| c.admin = Pubkey::default(), InvalidAddress);
    rejects(|c| c.kyc_authority = Pubkey::default(), InvalidAddress);
    rejects(|c| c.treasury = Pubkey::default(), InvalidAddress);
    rejects(
        |c| c.demo_kyc_authority = c.kyc_authority,
        DemoAuthorityConflict,
    );
    rejects(
        |c| c.allowed_payment_mints[2] = c.allowed_payment_mints[0],
        DuplicatePaymentMint,
    );
}
