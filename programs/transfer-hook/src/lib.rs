use anchor_lang::prelude::*;
use anchor_lang::system_program;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;


declare_id!("CgbtcZvWngGWNH2uQa8vXfiNSYGpQKVNdx7wDUuMFqmC");

/// The axel main program ID — used to derive WhitelistEntry PDAs
const AXEL_PROGRAM_ID: Pubkey = pubkey!("DT5hRtTCLNaXwB4vbxL6CYe5g1guZajT4EfGRjd3Bdfi");

/// Whitelist PDA discriminator + approved(bool) + bump(u8) = 8 + 1 + 1 = 10
const WHITELIST_ENTRY_SIZE: usize = 10;

#[error_code]
pub enum TransferHookError {
    #[msg("Source wallet is not whitelisted")]
    SourceNotWhitelisted,
    #[msg("Destination wallet is not whitelisted")]
    DestinationNotWhitelisted,
}

#[program]
pub mod transfer_hook {
    use super::*;

    /// Called by Token-2022 on every token transfer.
    /// Verifies both source and destination owners are on the KYC whitelist.
    pub fn execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
        let source_whitelist = &ctx.accounts.source_whitelist;
        let dest_whitelist = &ctx.accounts.dest_whitelist;

        // Check source owner whitelist (account may not exist → not whitelisted)
        check_whitelist(source_whitelist, TransferHookError::SourceNotWhitelisted)?;

        // Check destination owner whitelist
        check_whitelist(dest_whitelist, TransferHookError::DestinationNotWhitelisted)?;

        Ok(())
    }

    /// Fallback: Token-2022 invokes the hook with the spl-transfer-hook-interface
    /// discriminator, not the Anchor discriminator. Route it to our execute handler.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        __private::__global::execute(program_id, accounts, data)
    }

    /// Initializes the ExtraAccountMetaList PDA that tells Token-2022
    /// which additional accounts the hook needs for each transfer.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let extra_metas = extra_account_metas()?;
        let account_size =
            ExtraAccountMetaList::size_of(extra_metas.len())? + 8; // 8 for discriminator
        let lamports = Rent::get()?.minimum_balance(account_size);
        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[
            b"extra-account-metas",
            mint_key.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ];

        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
                &[signer_seeds],
            ),
            lamports,
            account_size as u64,
            ctx.program_id,
        )?;

        // Write the extra account metas into the PDA
        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_metas)?;

        Ok(())
    }
}

/// Check that a whitelist account exists and is approved.
fn check_whitelist(account: &AccountInfo, error: TransferHookError) -> Result<()> {
    // If the account doesn't belong to the axel program, it's not a valid whitelist entry
    if account.owner != &AXEL_PROGRAM_ID {
        return Err(error.into());
    }

    let data = account.try_borrow_data()?;
    if data.len() < WHITELIST_ENTRY_SIZE {
        return Err(TransferHookError::SourceNotWhitelisted.into());
    }

    // WhitelistEntry layout: [discriminator(8)] [approved(1)] [bump(1)]
    let approved = data[8] == 1;
    if !approved {
        return Err(error.into());
    }

    Ok(())
}

/// Defines the two extra accounts the hook needs:
/// 1. WhitelistEntry PDA for the source owner (seeds: ["whitelist", source_owner])
/// 2. WhitelistEntry PDA for the destination owner (seeds: ["whitelist", dest_owner])
fn extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    // Account indices in the full transfer hook invocation:
    // 0 = source token account
    // 1 = mint
    // 2 = destination token account
    // 3 = source owner/delegate
    // 4 = extra_account_meta_list PDA
    // --- extra accounts start at index 5 ---
    // 5 = axel_program (static pubkey, must come first so PDAs can reference it)
    // 6 = source_whitelist PDA (derived via axel_program at index 5)
    // 7 = dest_whitelist PDA (derived via axel_program at index 5)
    Ok(vec![
        // [index 5] The axel program ID — needed as the derivation program for whitelist PDAs
        ExtraAccountMeta::new_with_pubkey(&AXEL_PROGRAM_ID, false, false)?,
        // [index 6] Source owner whitelist PDA
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // axel_program at index 5
            &[
                Seed::Literal {
                    bytes: b"whitelist".to_vec(),
                },
                Seed::AccountKey { index: 3 }, // source owner
            ],
            false,
            false,
        )?,
        // [index 7] Destination owner whitelist PDA — extract owner from dest token account data
        ExtraAccountMeta::new_external_pda_with_seeds(
            5, // axel_program at index 5
            &[
                Seed::Literal {
                    bytes: b"whitelist".to_vec(),
                },
                Seed::AccountData {
                    account_index: 2, // destination token account
                    data_index: 32,   // owner field offset (after mint pubkey)
                    length: 32,       // Pubkey length
                },
            ],
            false,
            false,
        )?,
    ])
}

/// Execute accounts — Token-2022 passes these automatically.
/// The first 5 are standard; the rest come from ExtraAccountMetaList.
#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Execute<'info> {
    /// Source token account
    /// CHECK: validated by Token-2022
    pub source_token: AccountInfo<'info>,

    /// Token-2022 mint
    /// CHECK: validated by Token-2022
    pub mint: AccountInfo<'info>,

    /// Destination token account
    /// CHECK: validated by Token-2022
    pub destination_token: AccountInfo<'info>,

    /// Source token account owner/delegate
    /// CHECK: validated by Token-2022
    pub owner: AccountInfo<'info>,

    /// ExtraAccountMetaList PDA
    /// CHECK: validated by Token-2022 against expected PDA
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// The axel program (needed for PDA derivation) — must be index 5
    /// CHECK: validated by ExtraAccountMetaList resolution
    pub axel_program: AccountInfo<'info>,

    /// WhitelistEntry PDA for source owner (from axel program) — index 6
    /// CHECK: validated in handler via check_whitelist
    pub source_whitelist: AccountInfo<'info>,

    /// WhitelistEntry PDA for destination owner (from axel program) — index 7
    /// CHECK: validated in handler via check_whitelist
    pub dest_whitelist: AccountInfo<'info>,
}

/// Accounts for initializing the ExtraAccountMetaList PDA.
#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The mint this hook is registered for
    pub mint: AccountInfo<'info>,

    /// The ExtraAccountMetaList PDA — stores which extra accounts the hook needs
    /// CHECK: Created in this instruction
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
