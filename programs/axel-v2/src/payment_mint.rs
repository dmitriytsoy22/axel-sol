//! Which stablecoins a project may take payments in.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022;
use spl_token_2022::extension::default_account_state::DefaultAccountState;
use spl_token_2022::extension::transfer_hook::TransferHook;
use spl_token_2022::extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions};
use spl_token_2022::state::{AccountState, Mint};

use crate::errors::AxelError;

/// Accepts classic SPL Token mints and Token-2022 mints whose extensions keep every
/// vault transfer exact and hook-free. The check is an allowlist, so extensions added to
/// Token-2022 later are rejected until reviewed.
///
/// Rejected because they break exact escrow and revenue accounting or vault transfers:
/// transfer fees, an active transfer hook, non-transferability, frozen-by-default
/// accounts, interest-bearing and scaled UI amounts, confidential transfers and mint/burn.
///
/// Accepted, and disclosed in the UI as issuer risk: a permanent delegate and the pausable
/// extension let the issuer seize or halt vault balances, like the freeze authority of
/// USDC. A transfer hook without a program, as on PYUSD, is accepted as well.
pub fn require_supported(mint: &AccountInfo) -> Result<()> {
    if *mint.owner != spl_token_2022::ID {
        return Ok(());
    }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<Mint>::unpack(&data)?;
    for extension in state.get_extension_types()? {
        let supported = match extension {
            ExtensionType::MintCloseAuthority
            | ExtensionType::PermanentDelegate
            | ExtensionType::MetadataPointer
            | ExtensionType::TokenMetadata
            | ExtensionType::GroupPointer
            | ExtensionType::TokenGroup
            | ExtensionType::GroupMemberPointer
            | ExtensionType::TokenGroupMember
            | ExtensionType::Pausable => true,
            ExtensionType::DefaultAccountState => {
                state.get_extension::<DefaultAccountState>()?.state
                    == AccountState::Initialized as u8
            }
            ExtensionType::TransferHook => {
                Option::<Pubkey>::from(state.get_extension::<TransferHook>()?.program_id).is_none()
            }
            _ => false,
        };
        require!(supported, AxelError::UnsupportedPaymentMint);
    }
    Ok(())
}
