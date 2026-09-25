//! AXEL v2: tokenized taxi cars. Shares are Token-2022 tokens whose transfer hook is this
//! program, so the share ledger and revenue accounting settle on every transfer.

use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

pub mod constants;
pub mod dates;
pub mod errors;
pub mod events;
pub mod hook;
pub mod instructions;
pub mod math;
pub mod payment_mint;
pub mod share_account;
pub mod state;
pub mod telemetry;

pub use instructions::*;

declare_id!("AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi");

#[program]
pub mod axel_v2 {
    use super::*;

    /// Creates the global config. Only the program's upgrade authority may call it.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        params: InitializeConfigParams,
    ) -> Result<()> {
        ctx.accounts.handle(params, ctx.bumps.config)
    }

    /// Updates fees, windows, payment mints, pause flag and KYC keys. Admin only.
    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        ctx.accounts.handle(params)
    }

    /// First step of the admin handover. The default key withdraws a pending proposal.
    pub fn propose_admin(ctx: Context<ProposeAdmin>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.handle(new_admin)
    }

    /// Second step of the admin handover, signed by the proposed admin.
    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        ctx.accounts.handle()
    }

    /// Creates or updates the KYC record of `wallet`. Signed by the KYC authority, or by the
    /// demo KYC authority for DEMO records that expire within 30 days.
    pub fn set_investor(
        ctx: Context<SetInvestor>,
        wallet: Pubkey,
        params: SetInvestorParams,
    ) -> Result<()> {
        ctx.accounts.handle(wallet, params, ctx.bumps.investor)
    }

    /// Creates a share mint, its transfer hook accounts, the project and its escrow and
    /// revenue vaults, and opens the raise. Admin only.
    pub fn create_project(ctx: Context<CreateProject>, params: CreateProjectParams) -> Result<()> {
        ctx.accounts.handle(params, &ctx.bumps)
    }

    /// Buys shares in an open raise; payment goes to the escrow. Moves the project to
    /// Funded when the last share is sold.
    pub fn buy_shares(ctx: Context<BuyShares>, shares: u64, max_total_cost: u64) -> Result<()> {
        ctx.accounts
            .handle(shares, max_total_cost, ctx.bumps.position)
    }

    /// Settles a raise whose outcome is certain: Funded or Failed. Anyone may call it.
    pub fn finalize_raise(ctx: Context<FinalizeRaise>) -> Result<()> {
        ctx.accounts.handle()
    }

    /// Pays a funded raise out to the treasury and the operator and starts operation.
    /// Admin only, before the activation deadline.
    pub fn activate_project(
        ctx: Context<ActivateProject>,
        acquisition_doc_hash: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.handle(acquisition_doc_hash)
    }

    /// Fails a raise that has not been activated, opening refunds. Admin only.
    pub fn cancel_raise(ctx: Context<ManageProject>) -> Result<()> {
        ctx.accounts.cancel_raise()
    }

    /// Burns the owner's shares of a failed raise and returns what they cost.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        ctx.accounts.handle()
    }

    /// Opens the owner's position and thaws its share account so it can receive shares.
    /// Anyone may pay; the owner needs an eligible KYC record but does not sign.
    pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
        ctx.accounts.handle(ctx.bumps.position)
    }

    /// Closes an empty position and its share account, returning the rent to the owner.
    /// Once the project is closed it also burns the shares left in the position.
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        ctx.accounts.handle()
    }

    /// The operator pays in one period's revenue, co-signed by the project's oracle as
    /// attestor. The platform fee goes to the treasury, the rest to the holders pro rata.
    pub fn deposit_revenue(
        ctx: Context<DepositRevenue>,
        params: DepositRevenueParams,
    ) -> Result<()> {
        ctx.accounts.handle(params, ctx.bumps.period)
    }

    /// Pays a position's unclaimed revenue to the owner's canonical payment account.
    /// Anyone may trigger it for any owner.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        ctx.accounts.handle()
    }

    /// Appends up to 20 daily records to the project's telemetry hash chain. Oracle only.
    pub fn record_telemetry(
        ctx: Context<RecordTelemetry>,
        entries: Vec<TelemetryEntry>,
    ) -> Result<()> {
        ctx.accounts.handle(entries)
    }

    /// Pauses an operating project: no transfers or deposits, claims keep working. Admin only.
    pub fn pause_project(ctx: Context<ManageProject>) -> Result<()> {
        ctx.accounts.pause()
    }

    /// Resumes a paused project. Admin only.
    pub fn resume_project(ctx: Context<ManageProject>) -> Result<()> {
        ctx.accounts.resume()
    }

    /// Replaces the operator or the oracle of an operating or paused project. Admin only.
    pub fn set_project_roles(
        ctx: Context<ManageProject>,
        operator: Option<Pubkey>,
        oracle: Option<Pubkey>,
    ) -> Result<()> {
        ctx.accounts.set_roles(operator, oracle)
    }

    /// Closes an operating or paused project for good without moving any funds; revenue
    /// stays claimable. Admin only.
    pub fn close_project(ctx: Context<ManageProject>) -> Result<()> {
        ctx.accounts.close()
    }

    /// Proposes moving `shares` of `from_owner`, a holder who lost its key, to its new wallet
    /// `to_owner` once `config.recovery_delay` has passed. Admin only.
    pub fn propose_recovery(
        ctx: Context<ProposeRecovery>,
        shares: u64,
        reason_hash: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.handle(shares, reason_hash, ctx.bumps.request)
    }

    /// Withdraws a pending recovery: the affected owner can veto it until its eta, the admin
    /// can withdraw it until it is executed.
    pub fn cancel_recovery(ctx: Context<CancelRecovery>) -> Result<()> {
        ctx.accounts.handle()
    }

    /// Carries out a recovery after its delay: burns the shares of the old wallet, mints as
    /// many to the new one and moves the unclaimed revenue with them. Anyone may call it.
    pub fn execute_recovery(ctx: Context<ExecuteRecovery>) -> Result<()> {
        ctx.accounts.handle(ctx.bumps.to_position)
    }

    /// Transfer hook of the share mints, invoked by Token-2022 on every share transfer.
    /// Settles revenue for both owners, moves the shares in their positions and rejects
    /// the transfer unless both owners are eligible and the project is operating.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        ctx.accounts.handle(amount)
    }
}
