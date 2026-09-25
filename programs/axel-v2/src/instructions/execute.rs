use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022;
use spl_token_2022::extension::transfer_hook::TransferHookAccount;
use spl_token_2022::extension::{BaseStateWithExtensions, PodStateWithExtensions};
use spl_token_2022::pod::PodAccount;

use crate::constants::{CONFIG_SEED, PROJECT_SEED};
use crate::errors::AxelError;
use crate::events::SharesTransferred;
use crate::state::{Config, Investor, Position, Project, ProjectState};

/// Transfer hook of every share mint. Token-2022 invokes it after a share transfer has
/// moved the balances and before the transfer completes, with the accounts laid out in
/// [`crate::hook`]. It settles revenue for both sides, moves the shares in the ledger and
/// fails the transfer unless both balances still equal their positions.
///
/// Token-2022 checks that the extra accounts are the PDAs derived from the token
/// accounts' owners, but the hook still re-checks everything it relies on, because
/// anyone can call it directly with accounts of their choosing.
#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: checked in the handler to be a share account in the middle of a transfer.
    pub source: UncheckedAccount<'info>,

    /// CHECK: the project PDA is derived from it, so it is the project's share mint.
    pub mint: UncheckedAccount<'info>,

    /// CHECK: checked in the handler like `source`.
    pub destination: UncheckedAccount<'info>,

    /// CHECK: owner or delegate of `source`. Eligibility follows the token accounts'
    /// owners instead, so a delegate cannot move shares of an owner who lost KYC.
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Token-2022 derives it from the mint and resolves the accounts below from it.
    pub extra_account_metas: UncheckedAccount<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(seeds = [PROJECT_SEED, mint.key().as_ref()], bump = project.bump)]
    pub project: Box<Account<'info, Project>>,

    /// CHECK: KYC record of the source owner. Loaded in the handler so that a missing
    /// record fails as `SourceNotAllowed`.
    pub source_investor: UncheckedAccount<'info>,

    /// CHECK: KYC record of the destination owner, loaded like `source_investor`.
    pub destination_investor: UncheckedAccount<'info>,

    /// CHECK: loaded and stored in the handler, because it may be the same account as
    /// `destination_position` and Anchor does not reject duplicate mutable accounts.
    #[account(mut)]
    pub source_position: UncheckedAccount<'info>,

    /// CHECK: loaded in the handler; it is empty when the recipient has no position.
    #[account(mut)]
    pub destination_position: UncheckedAccount<'info>,
}

impl Execute<'_> {
    pub fn handle(&self, amount: u64) -> Result<()> {
        let mint = self.mint.key();
        let source = ShareAccount::in_transfer(&self.source, &mint)?;
        let destination = ShareAccount::in_transfer(&self.destination, &mint)?;

        let project = &self.project;
        require_keys_eq!(project.share_mint, mint, AxelError::ShareMintMismatch);
        require!(!self.config.paused, AxelError::ProtocolPaused);
        require!(
            project.state == ProjectState::Operating,
            AxelError::InvalidState
        );

        let now = Clock::get()?.unix_timestamp;
        let allows_demo = project.allows_demo();
        require_investor(
            &self.source_investor,
            &source.owner,
            now,
            allows_demo,
            AxelError::SourceNotAllowed,
        )?;
        require_investor(
            &self.destination_investor,
            &destination.owner,
            now,
            allows_demo,
            AxelError::DestinationNotAllowed,
        )?;

        let project_key = project.key();
        let acc = project.acc_per_share;
        if self.source_position.key() == self.destination_position.key() {
            // One owner on both sides: only its revenue is settled. The balance check
            // below cannot pass for two live accounts of one owner, so it fails closed.
            let mut position = load_position(&self.source_position, &project_key, &source.owner)?;
            require_keys_eq!(
                position.owner,
                destination.owner,
                AxelError::PositionMismatch
            );
            position.settle(acc)?;
            require!(
                source.amount == position.shares && destination.amount == position.shares,
                AxelError::LedgerMismatch
            );
            store_position(&self.source_position, &position)?;
        } else {
            let mut from = load_position(&self.source_position, &project_key, &source.owner)?;
            require!(
                !self.destination_position.data_is_empty(),
                AxelError::RecipientNotOnboarded
            );
            let mut to =
                load_position(&self.destination_position, &project_key, &destination.owner)?;
            from.settle(acc)?;
            to.settle(acc)?;
            from.shares = from
                .shares
                .checked_sub(amount)
                .ok_or(AxelError::LedgerMismatch)?;
            to.shares = to.shares.checked_add(amount).ok_or(AxelError::Overflow)?;
            require!(
                source.amount == from.shares && destination.amount == to.shares,
                AxelError::LedgerMismatch
            );
            store_position(&self.source_position, &from)?;
            store_position(&self.destination_position, &to)?;
        }

        emit!(SharesTransferred {
            project: project_key,
            from: source.owner,
            to: destination.owner,
            amount,
        });
        Ok(())
    }
}

/// Owner and balance of a share account, read after Token-2022 has moved the balances.
struct ShareAccount {
    owner: Pubkey,
    amount: u64,
}

impl ShareAccount {
    /// Reads a Token-2022 account of `mint` that is flagged as part of the transfer in
    /// progress. Token-2022 sets the flag only while it invokes the hook, so a direct call
    /// to `execute` fails here.
    fn in_transfer(info: &AccountInfo, mint: &Pubkey) -> Result<Self> {
        require_keys_eq!(*info.owner, spl_token_2022::ID, AxelError::NotTransferring);
        let data = info.try_borrow_data()?;
        let account = PodStateWithExtensions::<PodAccount>::unpack(&data)
            .map_err(|_| AxelError::NotTransferring)?;
        let transferring = account
            .get_extension::<TransferHookAccount>()
            .is_ok_and(|extension| bool::from(extension.transferring));
        require!(transferring, AxelError::NotTransferring);
        require_keys_eq!(account.base.mint, *mint, AxelError::ShareMintMismatch);
        Ok(Self {
            owner: account.base.owner,
            amount: account.base.amount.into(),
        })
    }
}

/// Fails with `rejection` unless `info` is an active KYC record of `wallet` that the
/// project accepts. The reason is logged, the error names the side of the transfer.
fn require_investor(
    info: &AccountInfo,
    wallet: &Pubkey,
    now: i64,
    allows_demo: bool,
    rejection: AxelError,
) -> Result<()> {
    let reason = match read_investor(info) {
        Some(investor) if investor.wallet == *wallet => investor.ineligibility(now, allows_demo),
        _ => Some(AxelError::InvestorNotActive),
    };
    match reason {
        Some(reason) => {
            msg!("{}: {}", wallet, reason);
            Err(rejection.into())
        }
        None => Ok(()),
    }
}

/// The KYC record stored in `info`, if it holds one.
fn read_investor(info: &AccountInfo) -> Option<Investor> {
    if *info.owner != crate::ID {
        return None;
    }
    let data = info.try_borrow_data().ok()?;
    Investor::try_deserialize(&mut &data[..]).ok()
}

/// Loads the position of `owner` in `project`. Positions are created only at the PDA
/// derived from the two keys they store, so matching them identifies the PDA.
fn load_position(info: &AccountInfo, project: &Pubkey, owner: &Pubkey) -> Result<Position> {
    require_keys_eq!(*info.owner, crate::ID, AxelError::PositionMismatch);
    let position = Position::try_deserialize(&mut &info.try_borrow_data()?[..])?;
    require!(
        position.project == *project && position.owner == *owner,
        AxelError::PositionMismatch
    );
    Ok(position)
}

fn store_position(info: &AccountInfo, position: &Position) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    let mut writer: &mut [u8] = &mut data;
    position.try_serialize(&mut writer)
}
