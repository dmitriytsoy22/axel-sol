//! Account layout of the share mint's transfer hook.
//!
//! Token-2022 calls `execute` with `source, mint, destination, authority, validation`
//! followed by the extra accounts below, which it resolves from the validation account
//! `["extra-account-metas", mint]`. Investors and positions are derived from the token
//! accounts' owners (bytes 32..64 of a token account), not from the transfer authority,
//! so a delegate can never move shares on behalf of an owner who lost KYC.
//!
//! The config and project addresses never change for a mint, so they are stored as fixed
//! keys: Token-2022 derives every seeded address with `find_program_address` on each
//! transfer, and each bump it tries costs 1 500 compute units.

use anchor_lang::prelude::*;
use spl_tlv_account_resolution::account::ExtraAccountMeta;
use spl_tlv_account_resolution::seeds::Seed;
use spl_tlv_account_resolution::state::ExtraAccountMetaList;

use crate::constants::{INVESTOR_SEED, POSITION_SEED};

pub const SOURCE_INDEX: u8 = 0;
pub const MINT_INDEX: u8 = 1;
pub const DESTINATION_INDEX: u8 = 2;
pub const CONFIG_INDEX: u8 = 5;
pub const PROJECT_INDEX: u8 = 6;
pub const SOURCE_INVESTOR_INDEX: u8 = 7;
pub const DESTINATION_INVESTOR_INDEX: u8 = 8;
pub const SOURCE_POSITION_INDEX: u8 = 9;
pub const DESTINATION_POSITION_INDEX: u8 = 10;

const EXTRA_ACCOUNT_COUNT: usize = 6;

/// Offset and length of the owner field in an SPL token account.
const TOKEN_ACCOUNT_OWNER_OFFSET: u8 = 32;
const PUBKEY_LEN: u8 = 32;

fn token_account_owner(account_index: u8) -> Seed {
    Seed::AccountData {
        account_index,
        data_index: TOKEN_ACCOUNT_OWNER_OFFSET,
        length: PUBKEY_LEN,
    }
}

fn literal(bytes: &[u8]) -> Seed {
    Seed::Literal {
        bytes: bytes.to_vec(),
    }
}

/// Extra accounts of `execute` for the mint of `project`, in order, starting at index 5.
pub fn extra_account_metas(
    config: &Pubkey,
    project: &Pubkey,
) -> Result<[ExtraAccountMeta; EXTRA_ACCOUNT_COUNT]> {
    let position = |owner_of: u8| {
        ExtraAccountMeta::new_with_seeds(
            &[
                literal(POSITION_SEED),
                Seed::AccountKey {
                    index: PROJECT_INDEX,
                },
                token_account_owner(owner_of),
            ],
            false,
            true,
        )
    };
    Ok([
        ExtraAccountMeta::new_with_pubkey(config, false, false)?,
        ExtraAccountMeta::new_with_pubkey(project, false, false)?,
        ExtraAccountMeta::new_with_seeds(
            &[literal(INVESTOR_SEED), token_account_owner(SOURCE_INDEX)],
            false,
            false,
        )?,
        ExtraAccountMeta::new_with_seeds(
            &[
                literal(INVESTOR_SEED),
                token_account_owner(DESTINATION_INDEX),
            ],
            false,
            false,
        )?,
        position(SOURCE_INDEX)?,
        position(DESTINATION_INDEX)?,
    ])
}

/// Size of the validation account holding [`extra_account_metas`].
pub fn extra_account_metas_len() -> Result<usize> {
    Ok(ExtraAccountMetaList::size_of(EXTRA_ACCOUNT_COUNT)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extra_accounts_are_derived_in_the_documented_order() {
        let config = Pubkey::new_unique();
        let project = Pubkey::new_unique();
        let metas = extra_account_metas(&config, &project).unwrap();
        assert_eq!(
            usize::from(DESTINATION_POSITION_INDEX - CONFIG_INDEX) + 1,
            metas.len()
        );
        let writable: Vec<bool> = metas.iter().map(|meta| meta.is_writable.into()).collect();
        assert_eq!(writable, [false, false, false, false, true, true]);
        assert!(metas.iter().all(|meta| !bool::from(meta.is_signer)));
        assert_eq!(metas[0].address_config, config.to_bytes());
        assert_eq!(metas[1].address_config, project.to_bytes());
        assert_eq!(metas[0].discriminator, 0, "config is a fixed key");
        assert_eq!(metas[1].discriminator, 0, "project is a fixed key");
        assert!(
            metas[2..].iter().all(|meta| meta.discriminator == 1),
            "the rest are seeded"
        );
        assert_eq!(extra_account_metas_len().unwrap(), 226);
    }
}
