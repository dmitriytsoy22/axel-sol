use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_2022_extensions::spl_token_metadata_interface::state::Field;
use anchor_spl::token_interface::{
    self, DefaultAccountStateInitialize, InitializeMint2, MetadataPointerInitialize, Mint,
    PermanentDelegateInitialize, TokenAccount, TokenInterface, TokenMetadataInitialize,
    TokenMetadataUpdateField, TransferHookInitialize,
};
use spl_tlv_account_resolution::state::ExtraAccountMetaList;
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::state::AccountState;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::constants::*;
use crate::errors::AxelError;
use crate::events::ProjectCreated;
use crate::hook;
use crate::math;
use crate::payment_mint;
use crate::state::{Config, Project, ProjectState};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MetadataField {
    pub key: String,
    pub value: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateProjectParams {
    /// Price of one share in base units of the payment mint. Immutable.
    pub price_per_share: u64,
    pub total_shares: u64,
    /// Minimum shares sold by the deadline for the raise to succeed.
    pub soft_cap_shares: u64,
    pub raise_deadline: i64,
    /// Seconds the admin has to activate once the raise is funded.
    pub activation_window: i64,
    pub operator: Pubkey,
    pub oracle: Pubkey,
    pub allow_demo: bool,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    /// Car attributes shown by wallets and explorers, e.g. make, model, year, city.
    pub additional_metadata: Vec<MetadataField>,
}

/// Creates a share mint with its transfer hook accounts, the project and its two vaults.
///
/// Share mint: decimals 0, mint and freeze authority = project PDA, extensions
/// TransferHook (program = axel_v2, authority None), DefaultAccountState Frozen,
/// PermanentDelegate = project PDA (used only by recovery), MetadataPointer to itself
/// (authority None) and TokenMetadata (update authority = project PDA).
#[derive(Accounts)]
pub struct CreateProject<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ AxelError::Unauthorized,
    )]
    pub config: Box<Account<'info, Config>>,

    /// A fresh keypair; the share mint is created at this address.
    #[account(mut)]
    pub share_mint: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = Project::SPACE,
        seeds = [PROJECT_SEED, share_mint.key().as_ref()],
        bump,
    )]
    pub project: Box<Account<'info, Project>>,

    /// CHECK: created here and filled with the hook's extra account metas.
    #[account(
        init,
        payer = payer,
        space = hook::extra_account_metas_len()?,
        seeds = [EXTRA_ACCOUNT_METAS_SEED, share_mint.key().as_ref()],
        bump,
    )]
    pub extra_account_metas: UncheckedAccount<'info>,

    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        seeds = [ESCROW_SEED, project.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = project,
        token::token_program = payment_token_program,
    )]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        seeds = [REVENUE_SEED, project.key().as_ref()],
        bump,
        token::mint = payment_mint,
        token::authority = project,
        token::token_program = payment_token_program,
    )]
    pub revenue_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub share_token_program: Program<'info, Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateProject<'info> {
    pub fn handle(
        &mut self,
        params: CreateProjectParams,
        bumps: &CreateProjectBumps,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        self.validate(&params, now)?;

        self.project.set_inner(Project {
            share_mint: self.share_mint.key(),
            payment_mint: self.payment_mint.key(),
            payment_token_program: self.payment_token_program.key(),
            operator: params.operator,
            oracle: params.oracle,
            escrow_vault: self.escrow_vault.key(),
            revenue_vault: self.revenue_vault.key(),
            state: ProjectState::Fundraising,
            flags: if params.allow_demo {
                Project::FLAG_ALLOW_DEMO
            } else {
                0
            },
            price_per_share: params.price_per_share,
            total_shares: params.total_shares,
            soft_cap_shares: params.soft_cap_shares,
            shares_sold: 0,
            shares_refunded: 0,
            raise_deadline: params.raise_deadline,
            activation_window: params.activation_window,
            activation_deadline: 0,
            created_at: now,
            activated_at: 0,
            closed_at: 0,
            raise_fee_bps: self.config.raise_fee_bps,
            revenue_fee_bps: self.config.revenue_fee_bps,
            acc_per_share: 0,
            total_deposited_net: 0,
            total_fees: 0,
            total_claimed: 0,
            total_refunded: 0,
            period_count: 0,
            telemetry_head: [0; 32],
            telemetry_count: 0,
            last_telemetry_date: 0,
            acquisition_doc_hash: [0; 32],
            bump: bumps.project,
            escrow_bump: bumps.escrow_vault,
            revenue_bump: bumps.revenue_vault,
            shares_retired: 0,
            _reserved: [0; 56],
        });

        self.create_share_mint()?;
        self.write_metadata(&params)?;
        self.write_extra_account_metas()?;

        self.config.project_count = self
            .config
            .project_count
            .checked_add(1)
            .ok_or(AxelError::Overflow)?;

        emit!(ProjectCreated {
            project: self.project.key(),
            share_mint: self.share_mint.key(),
            payment_mint: self.payment_mint.key(),
            operator: params.operator,
            price_per_share: params.price_per_share,
            total_shares: params.total_shares,
            soft_cap_shares: params.soft_cap_shares,
            raise_deadline: params.raise_deadline,
        });
        Ok(())
    }

    fn validate(&self, params: &CreateProjectParams, now: i64) -> Result<()> {
        let config = &self.config;
        require!(
            config.is_payment_mint_allowed(&self.payment_mint.key()),
            AxelError::PaymentMintNotAllowed
        );
        payment_mint::require_supported(&self.payment_mint.to_account_info())?;

        require!(params.price_per_share > 0, AxelError::InvalidPrice);
        require!(
            params.soft_cap_shares > 0 && params.soft_cap_shares <= params.total_shares,
            AxelError::InvalidShareSupply
        );
        math::shares_value(params.total_shares, params.price_per_share)?;

        let min_deadline = now
            .checked_add(config.min_raise_duration)
            .ok_or(AxelError::Overflow)?;
        require!(
            params.raise_deadline >= min_deadline,
            AxelError::RaiseTooShort
        );
        let max_deadline = now
            .checked_add(MAX_RAISE_DURATION)
            .ok_or(AxelError::Overflow)?;
        require!(
            params.raise_deadline <= max_deadline,
            AxelError::RaiseTooLong
        );
        require!(params.activation_window > 0, AxelError::InvalidDuration);
        require!(
            params.activation_window <= config.max_activation_window,
            AxelError::ActivationWindowTooLong
        );

        require_keys_neq!(
            params.operator,
            Pubkey::default(),
            AxelError::InvalidAddress
        );
        require_keys_neq!(params.oracle, Pubkey::default(), AxelError::InvalidAddress);
        require_keys_neq!(params.operator, params.oracle, AxelError::RoleConflict);

        validate_metadata(params)
    }

    fn create_share_mint(&self) -> Result<()> {
        let mint = self.share_mint.to_account_info();
        let token_program = self.share_token_program.to_account_info();
        let project = self.project.key();

        let base_len = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&[
            ExtensionType::TransferHook,
            ExtensionType::DefaultAccountState,
            ExtensionType::PermanentDelegate,
            ExtensionType::MetadataPointer,
        ])?;
        system_program::create_account(
            CpiContext::new(
                self.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: self.payer.to_account_info(),
                    to: mint.clone(),
                },
            ),
            Rent::get()?.minimum_balance(base_len),
            base_len as u64,
            &token_program.key(),
        )?;

        token_interface::transfer_hook_initialize(
            CpiContext::new(
                token_program.clone(),
                TransferHookInitialize {
                    token_program_id: token_program.clone(),
                    mint: mint.clone(),
                },
            ),
            None,
            Some(crate::ID),
        )?;
        token_interface::default_account_state_initialize(
            CpiContext::new(
                token_program.clone(),
                DefaultAccountStateInitialize {
                    token_program_id: token_program.clone(),
                    mint: mint.clone(),
                },
            ),
            &AccountState::Frozen,
        )?;
        token_interface::permanent_delegate_initialize(
            CpiContext::new(
                token_program.clone(),
                PermanentDelegateInitialize {
                    token_program_id: token_program.clone(),
                    mint: mint.clone(),
                },
            ),
            &project,
        )?;
        token_interface::metadata_pointer_initialize(
            CpiContext::new(
                token_program.clone(),
                MetadataPointerInitialize {
                    token_program_id: token_program.clone(),
                    mint: mint.clone(),
                },
            ),
            None,
            Some(mint.key()),
        )?;
        token_interface::initialize_mint2(
            CpiContext::new(token_program, InitializeMint2 { mint }),
            SHARE_DECIMALS,
            &project,
            Some(&project),
        )
    }

    /// Token-2022 grows the mint for every metadata write without charging rent, so the
    /// payer tops the mint up to rent exemption at its final size afterwards.
    fn write_metadata(&self, params: &CreateProjectParams) -> Result<()> {
        let mint = self.share_mint.to_account_info();
        let token_program = self.share_token_program.to_account_info();
        let project = self.project.to_account_info();
        let seeds = self.project.signer_seeds();
        let signer: &[&[&[u8]]] = &[&seeds];

        token_interface::token_metadata_initialize(
            CpiContext::new_with_signer(
                token_program.clone(),
                TokenMetadataInitialize {
                    program_id: token_program.clone(),
                    metadata: mint.clone(),
                    update_authority: project.clone(),
                    mint_authority: project.clone(),
                    mint: mint.clone(),
                },
                signer,
            ),
            params.name.clone(),
            params.symbol.clone(),
            params.uri.clone(),
        )?;
        for field in &params.additional_metadata {
            token_interface::token_metadata_update_field(
                CpiContext::new_with_signer(
                    token_program.clone(),
                    TokenMetadataUpdateField {
                        program_id: token_program.clone(),
                        metadata: mint.clone(),
                        update_authority: project.clone(),
                    },
                    signer,
                ),
                Field::Key(field.key.clone()),
                field.value.clone(),
            )?;
        }

        let shortfall = Rent::get()?
            .minimum_balance(mint.data_len())
            .saturating_sub(mint.lamports());
        if shortfall > 0 {
            system_program::transfer(
                CpiContext::new(
                    self.system_program.to_account_info(),
                    system_program::Transfer {
                        from: self.payer.to_account_info(),
                        to: mint,
                    },
                ),
                shortfall,
            )?;
        }
        Ok(())
    }

    fn write_extra_account_metas(&self) -> Result<()> {
        let mut data = self.extra_account_metas.try_borrow_mut_data()?;
        let metas = hook::extra_account_metas(&self.config.key(), &self.project.key())?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;
        Ok(())
    }
}

fn validate_metadata(params: &CreateProjectParams) -> Result<()> {
    let within = |value: &str, max: u8| !value.is_empty() && value.len() <= usize::from(max);
    require!(
        within(&params.name, MAX_NAME_LEN)
            && within(&params.symbol, MAX_SYMBOL_LEN)
            && params.uri.len() <= usize::from(MAX_URI_LEN)
            && params.additional_metadata.len() <= usize::from(MAX_METADATA_FIELDS),
        AxelError::InvalidMetadata
    );
    for (i, field) in params.additional_metadata.iter().enumerate() {
        let reserved = matches!(field.key.as_str(), "name" | "symbol" | "uri");
        let duplicate = params.additional_metadata[..i]
            .iter()
            .any(|earlier| earlier.key == field.key);
        require!(
            within(&field.key, MAX_METADATA_KEY_LEN)
                && field.value.len() <= usize::from(MAX_METADATA_VALUE_LEN)
                && !reserved
                && !duplicate,
            AxelError::InvalidMetadata
        );
    }
    Ok(())
}
