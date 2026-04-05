use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_spl::token_2022::Token2022;
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::state::Mint as MintState;

use crate::errors::AxelError;
use crate::state::{ProjectState, ProjectStatus};

/// Transfer fee: 1% = 100 basis points
const TRANSFER_FEE_BASIS_POINTS: u16 = 100;

/// Token shares have no decimal places (integer shares only)
const TOKEN_DECIMALS: u8 = 0;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeProjectParams {
    pub car_cost_lamports: u64,
    pub price_per_share_lamports: u64,
    pub transfer_hook_program_id: Pubkey,
    pub oracle_pubkey: Pubkey,
    pub token_name: String,
    pub token_symbol: String,
    pub token_uri: String,
    pub vin: String,
    pub make: String,
    pub model: String,
    pub year: u16,
    pub valuation_sol: u64,
}

#[derive(Accounts)]
#[instruction(params: InitializeProjectParams)]
pub struct InitializeProject<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut)]
    pub mint: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ProjectState::DISCRIMINATOR.len() + ProjectState::INIT_SPACE,
        seeds = [b"project", mint.key().as_ref()],
        bump,
    )]
    pub project_state: Account<'info, ProjectState>,

    /// CHECK: PDA for revenue SOL vault, validated by seeds
    #[account(
        seeds = [b"revenue", mint.key().as_ref()],
        bump,
    )]
    pub revenue_vault: UncheckedAccount<'info>,

    pub token_extensions_program: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    context: Context<InitializeProject>,
    params: InitializeProjectParams,
) -> Result<()> {
    // --- Validation ---
    require!(
        params.price_per_share_lamports > 0,
        AxelError::ZeroPricePerShare
    );
    require!(
        params.car_cost_lamports % params.price_per_share_lamports == 0,
        AxelError::InvalidTokenSupplyDivision
    );

    let token_supply = params.car_cost_lamports / params.price_per_share_lamports;

    // Build additional metadata key-value pairs for the token
    let additional_metadata = vec![
        ("vin".to_string(), params.vin.clone()),
        ("make".to_string(), params.make.clone()),
        ("model".to_string(), params.model.clone()),
        ("year".to_string(), params.year.to_string()),
        ("valuation_sol".to_string(), params.valuation_sol.to_string()),
    ];

    // --- Compute mint account size ---
    // Fixed-size extensions that are part of the mint
    let fixed_extensions = &[
        ExtensionType::TransferFeeConfig,
        ExtensionType::DefaultAccountState,
        ExtensionType::PermanentDelegate,
        ExtensionType::TransferHook,
        ExtensionType::MetadataPointer,
    ];
    let base_mint_size =
        ExtensionType::try_calculate_account_len::<MintState>(fixed_extensions)?;

    // TokenMetadata is variable-length; Token-2022 will realloc the account
    // when we initialize metadata in step 8. We only allocate the fixed
    // extensions now, but fund the account with enough lamports for the
    // final size (including metadata) so rent stays covered after realloc.
    let metadata_borsh_size = compute_metadata_borsh_size(
        &params.token_name,
        &params.token_symbol,
        &params.token_uri,
        &additional_metadata,
    );
    let extension_header_size = std::mem::size_of::<u16>() + std::mem::size_of::<u16>();
    let spl_tlv_header_size = 8 + std::mem::size_of::<u32>();
    let metadata_extension_size = extension_header_size + spl_tlv_header_size + metadata_borsh_size;
    let total_mint_size = base_mint_size + metadata_extension_size;

    // Fund for the final size, but allocate only the fixed-extensions size.
    // Token-2022's metadata init will realloc the account to fit metadata.
    let mint_rent = Rent::get()?.minimum_balance(total_mint_size);

    let mint_key = context.accounts.mint.key();
    let admin_key = context.accounts.admin.key();

    // --- Step 1: Create mint account owned by Token Extensions Program ---
    anchor_lang::system_program::create_account(
        CpiContext::new(
            context.accounts.system_program.to_account_info(),
            anchor_lang::system_program::CreateAccount {
                from: context.accounts.admin.to_account_info(),
                to: context.accounts.mint.to_account_info(),
            },
        ),
        mint_rent,
        base_mint_size as u64,
        &anchor_spl::token_2022::ID,
    )?;

    // --- Step 2: Initialize TransferHook extension ---
    // Every token transfer will CPI into the transfer-hook program for KYC enforcement
    invoke(
        &spl_token_2022::extension::transfer_hook::instruction::initialize(
            &anchor_spl::token_2022::ID,
            &mint_key,
            Some(admin_key),
            Some(params.transfer_hook_program_id),
        )?,
        &[context.accounts.mint.to_account_info()],
    )?;

    // --- Step 3: Initialize DefaultAccountState (Frozen) ---
    // New token accounts are frozen by default; must be thawed after KYC approval
    invoke(
        &spl_token_2022::extension::default_account_state::instruction::initialize_default_account_state(
            &anchor_spl::token_2022::ID,
            &mint_key,
            &spl_token_2022::state::AccountState::Frozen,
        )?,
        &[context.accounts.mint.to_account_info()],
    )?;

    // --- Step 4: Initialize PermanentDelegate ---
    // Admin (Squads multisig in production) can transfer/burn tokens from any holder
    invoke(
        &spl_token_2022::instruction::initialize_permanent_delegate(
            &anchor_spl::token_2022::ID,
            &mint_key,
            &admin_key,
        )?,
        &[context.accounts.mint.to_account_info()],
    )?;

    // --- Step 5: Initialize TransferFeeConfig ---
    invoke(
        &spl_token_2022::extension::transfer_fee::instruction::initialize_transfer_fee_config(
            &anchor_spl::token_2022::ID,
            &mint_key,
            Some(&admin_key),
            Some(&admin_key),
            TRANSFER_FEE_BASIS_POINTS,
            u64::MAX, // no maximum fee cap
        )?,
        &[context.accounts.mint.to_account_info()],
    )?;

    // --- Step 6: Initialize MetadataPointer (points to mint itself) ---
    // Metadata lives on the mint account rather than a separate account
    invoke(
        &spl_token_2022::extension::metadata_pointer::instruction::initialize(
            &anchor_spl::token_2022::ID,
            &mint_key,
            Some(admin_key),
            Some(mint_key),
        )?,
        &[context.accounts.mint.to_account_info()],
    )?;

    // --- Step 7: Initialize the mint ---
    // mint_authority = project_state PDA (only the program can mint shares)
    // freeze_authority = project_state PDA (program can thaw accounts during buy_tokens)
    let project_state_key = context.accounts.project_state.key();

    anchor_spl::token_2022::initialize_mint2(
        CpiContext::new(
            context.accounts.token_extensions_program.to_account_info(),
            anchor_spl::token_2022::InitializeMint2 {
                mint: context.accounts.mint.to_account_info(),
            },
        ),
        TOKEN_DECIMALS,
        &project_state_key,
        Some(&project_state_key),
    )?;

    // --- Step 8: Initialize token metadata ---
    // mint_authority is the project_state PDA, so we need invoke_signed
    let bump = context.bumps.project_state;
    let signer_seeds: &[&[u8]] = &[b"project", mint_key.as_ref(), &[bump]];

    invoke_signed(
        &spl_token_metadata_interface::instruction::initialize(
            &anchor_spl::token_2022::ID,
            &mint_key,
            &admin_key,
            &mint_key,
            &project_state_key,
            params.token_name.clone(),
            params.token_symbol.clone(),
            params.token_uri.clone(),
        ),
        &[
            context.accounts.mint.to_account_info(),
            context.accounts.admin.to_account_info(),
            context.accounts.mint.to_account_info(),
            context.accounts.project_state.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // Write additional metadata fields (VIN, make, model, etc.)
    // update_authority is admin who is already a signer on the transaction
    for (key, value) in &additional_metadata {
        invoke(
            &spl_token_metadata_interface::instruction::update_field(
                &anchor_spl::token_2022::ID,
                &mint_key,
                &admin_key,
                spl_token_metadata_interface::state::Field::Key(key.clone()),
                value.clone(),
            ),
            &[
                context.accounts.mint.to_account_info(),
                context.accounts.admin.to_account_info(),
            ],
        )?;
    }

    // --- Write ProjectState ---
    let project_state = &mut context.accounts.project_state;
    project_state.admin = admin_key;
    project_state.mint = mint_key;
    project_state.revenue_vault = context.accounts.revenue_vault.key();
    project_state.token_supply = token_supply;
    project_state.tokens_sold = 0;
    project_state.price_per_share = params.price_per_share_lamports;
    project_state.status = ProjectStatus::Active;
    project_state.period_count = 0;
    project_state.oracle_pubkey = params.oracle_pubkey;
    project_state.bump = bump;
    project_state.revenue_vault_bump = context.bumps.revenue_vault;

    Ok(())
}

/// Compute the borsh-serialized size of TokenMetadata.
///
/// Layout: OptionalNonZeroPubkey(Pubkey) + Pubkey + String*3 + Vec<(String,String)>
/// Pubkey = 32 bytes, borsh String = 4-byte length prefix + data,
/// borsh Vec = 4-byte length prefix + elements
fn compute_metadata_borsh_size(
    name: &str,
    symbol: &str,
    uri: &str,
    additional_metadata: &[(String, String)],
) -> usize {
    let pubkey_size = std::mem::size_of::<Pubkey>();
    let borsh_string_size = |s: &str| std::mem::size_of::<u32>() + s.len();
    let borsh_vec_header = std::mem::size_of::<u32>();

    pubkey_size // update_authority (OptionalNonZeroPubkey stores raw Pubkey bytes)
        + pubkey_size // mint
        + borsh_string_size(name)
        + borsh_string_size(symbol)
        + borsh_string_size(uri)
        + borsh_vec_header
        + additional_metadata
            .iter()
            .map(|(k, v)| borsh_string_size(k) + borsh_string_size(v))
            .sum::<usize>()
}
