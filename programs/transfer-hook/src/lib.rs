use anchor_lang::prelude::*;

declare_id!("CgbtcZvWngGWNH2uQa8vXfiNSYGpQKVNdx7wDUuMFqmC");

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
