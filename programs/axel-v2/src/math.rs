//! Pure fixed-point math for the revenue accumulator.
//!
//! `acc` is revenue per share in Q64.64. A deposit of `net` over `supply` shares adds
//! `floor(net * 2^64 / supply)`; a holder of `shares` is owed
//! `floor(shares * (acc - checkpoint) / 2^64)` since its checkpoint. Every rounding step
//! floors, so the sum of all payouts never exceeds the sum of all deposits.
//!
//! Overflow bound: `shares * delta <= supply * acc <= total_deposited_net * 2^64 < 2^128`
//! as long as `total_deposited_net` fits in u64, which the program enforces with
//! `checked_add`.

use crate::constants::BPS_DENOMINATOR;
use crate::errors::AxelError;

/// Fractional bits of the accumulator.
pub const Q: u32 = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathError {
    Overflow,
    DivisionByZero,
    CheckpointAhead,
    InvalidBps,
}

impl From<MathError> for anchor_lang::error::Error {
    fn from(error: MathError) -> Self {
        match error {
            MathError::Overflow => AxelError::Overflow.into(),
            MathError::DivisionByZero => AxelError::DivisionByZero.into(),
            MathError::CheckpointAhead => AxelError::CheckpointAhead.into(),
            MathError::InvalidBps => AxelError::InvalidBps.into(),
        }
    }
}

pub type MathResult<T> = core::result::Result<T, MathError>;

/// Splits `amount` into `(fee, rest)` with `fee = floor(amount * bps / 10_000)`.
pub fn split_fee(amount: u64, bps: u16) -> MathResult<(u64, u64)> {
    if bps > BPS_DENOMINATOR {
        return Err(MathError::InvalidBps);
    }
    let fee = u64::try_from(u128::from(amount) * u128::from(bps) / u128::from(BPS_DENOMINATOR))
        .map_err(|_| MathError::Overflow)?;
    let rest = amount.checked_sub(fee).ok_or(MathError::Overflow)?;
    Ok((fee, rest))
}

/// `shares * price` in base units of the payment mint: purchase cost, refund, activation gross.
pub fn shares_value(shares: u64, price_per_share: u64) -> MathResult<u64> {
    let value = u128::from(shares)
        .checked_mul(u128::from(price_per_share))
        .ok_or(MathError::Overflow)?;
    u64::try_from(value).map_err(|_| MathError::Overflow)
}

/// `floor(amount * part / whole)`: the part of `amount` that belongs to `part` of `whole`.
/// Never more than `amount` while `part <= whole`, and exactly `amount` when they are equal.
pub fn pro_rata(amount: u64, part: u64, whole: u64) -> MathResult<u64> {
    if whole == 0 {
        return Err(MathError::DivisionByZero);
    }
    let value = u128::from(amount) * u128::from(part) / u128::from(whole);
    u64::try_from(value).map_err(|_| MathError::Overflow)
}

/// Accumulator growth from distributing `net` over `supply` shares: `floor(net * 2^64 / supply)`.
pub fn acc_increment(net: u64, supply: u64) -> MathResult<u128> {
    if supply == 0 {
        return Err(MathError::DivisionByZero);
    }
    Ok((u128::from(net) << Q) / u128::from(supply))
}

/// Revenue earned by `shares` between `checkpoint` and `acc`.
pub fn owed(shares: u64, acc: u128, checkpoint: u128) -> MathResult<u64> {
    let delta = acc
        .checked_sub(checkpoint)
        .ok_or(MathError::CheckpointAhead)?;
    let product = u128::from(shares)
        .checked_mul(delta)
        .ok_or(MathError::Overflow)?;
    u64::try_from(product >> Q).map_err(|_| MathError::Overflow)
}

/// Accrued balance after settling a holder at `acc`. The caller must then move the
/// holder's checkpoint to `acc`. Clients use the same function to show pending revenue.
pub fn settled_accrued(shares: u64, checkpoint: u128, accrued: u64, acc: u128) -> MathResult<u64> {
    accrued
        .checked_add(owed(shares, acc, checkpoint)?)
        .ok_or(MathError::Overflow)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Deposit {
    pub fee: u64,
    pub net: u64,
    pub acc_after: u128,
}

/// Applies a revenue deposit of `gross` to the accumulator.
pub fn deposit(acc: u128, gross: u64, fee_bps: u16, supply: u64) -> MathResult<Deposit> {
    let (fee, net) = split_fee(gross, fee_bps)?;
    let acc_after = acc
        .checked_add(acc_increment(net, supply)?)
        .ok_or(MathError::Overflow)?;
    Ok(Deposit {
        fee,
        net,
        acc_after,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const ONE: u128 = 1 << Q;

    #[test]
    fn split_fee_floors_and_conserves() {
        assert_eq!(split_fee(1_000, 250), Ok((25, 975)));
        assert_eq!(split_fee(999, 250), Ok((24, 975)));
        assert_eq!(split_fee(1, 9_999), Ok((0, 1)));
        assert_eq!(split_fee(7, 0), Ok((0, 7)));
        assert_eq!(split_fee(7, 10_000), Ok((7, 0)));
        assert_eq!(split_fee(u64::MAX, 10_000), Ok((u64::MAX, 0)));
        assert_eq!(
            split_fee(u64::MAX, 2_000),
            Ok((u64::MAX / 5, u64::MAX - u64::MAX / 5))
        );
    }

    #[test]
    fn split_fee_rejects_more_than_100_percent() {
        assert_eq!(split_fee(1_000, 10_001), Err(MathError::InvalidBps));
        assert_eq!(split_fee(0, u16::MAX), Err(MathError::InvalidBps));
    }

    #[test]
    fn shares_value_is_checked() {
        assert_eq!(shares_value(3, 10_000_000_000), Ok(30_000_000_000));
        assert_eq!(shares_value(0, u64::MAX), Ok(0));
        assert_eq!(shares_value(1, u64::MAX), Ok(u64::MAX));
        assert_eq!(shares_value(2, u64::MAX), Err(MathError::Overflow));
        assert_eq!(shares_value(1 << 32, 1 << 32), Err(MathError::Overflow));
    }

    #[test]
    fn pro_rata_floors_and_keeps_the_whole() {
        assert_eq!(pro_rata(1_000, 50, 50), Ok(1_000));
        assert_eq!(pro_rata(1_000, 20, 50), Ok(400));
        assert_eq!(pro_rata(100, 1, 3), Ok(33));
        assert_eq!(pro_rata(0, 7, 9), Ok(0));
        assert_eq!(pro_rata(u64::MAX, u64::MAX, u64::MAX), Ok(u64::MAX));
        assert_eq!(pro_rata(u64::MAX, u64::MAX - 1, u64::MAX), Ok(u64::MAX - 1));
        assert_eq!(pro_rata(1, 0, 0), Err(MathError::DivisionByZero));
        assert_eq!(pro_rata(u64::MAX, 2, 1), Err(MathError::Overflow));
    }

    #[test]
    fn acc_increment_is_floor_of_q64_quotient() {
        assert_eq!(acc_increment(1_000, 100), Ok(10 * ONE));
        assert_eq!(acc_increment(1, 3), Ok(ONE / 3));
        assert_eq!(acc_increment(0, 5), Ok(0));
        assert_eq!(acc_increment(u64::MAX, 1), Ok(u128::from(u64::MAX) << Q));
        assert_eq!(acc_increment(5, 0), Err(MathError::DivisionByZero));
    }

    #[test]
    fn owed_rejects_checkpoint_ahead_of_accumulator() {
        assert_eq!(owed(10, ONE, ONE + 1), Err(MathError::CheckpointAhead));
    }

    #[test]
    fn owed_is_zero_without_growth_or_shares() {
        assert_eq!(owed(1_000, 5 * ONE, 5 * ONE), Ok(0));
        assert_eq!(owed(0, 5 * ONE, 0), Ok(0));
    }

    #[test]
    fn owed_detects_product_overflow() {
        assert_eq!(owed(u64::MAX, 4 * ONE, 0), Err(MathError::Overflow));
    }

    #[test]
    fn owed_at_the_theoretical_maximum_fits() {
        // The whole u64 range deposited over one share: acc = (2^64 - 1) * 2^64.
        let acc = acc_increment(u64::MAX, 1).unwrap();
        assert_eq!(owed(1, acc, 0), Ok(u64::MAX));
        // Same total over the largest possible supply.
        let acc = acc_increment(u64::MAX, u64::MAX).unwrap();
        assert_eq!(owed(u64::MAX, acc, 0), Ok(u64::MAX));
    }

    #[test]
    fn deposit_applies_fee_then_distributes_net() {
        let d = deposit(0, 1_000, 2_000, 100).unwrap();
        assert_eq!(d.fee, 200);
        assert_eq!(d.net, 800);
        assert_eq!(d.acc_after, 8 * ONE);
        assert_eq!(deposit(0, 1_000, 0, 0), Err(MathError::DivisionByZero));
        assert_eq!(deposit(u128::MAX, 1_000, 0, 1), Err(MathError::Overflow));
    }

    #[test]
    fn settled_accrued_adds_owed_to_accrued() {
        assert_eq!(settled_accrued(40, 2 * ONE, 7, 5 * ONE), Ok(127));
        assert_eq!(
            settled_accrued(1, 0, u64::MAX, ONE),
            Err(MathError::Overflow)
        );
    }

    /// Minimal holder ledger used to replay the accounting the program performs.
    #[derive(Clone, Copy, Default)]
    struct Holder {
        shares: u64,
        checkpoint: u128,
        accrued: u64,
        claimed: u64,
        settles: u64,
        /// Exact entitlement times `supply`: sum over deposits of `net * shares_at_deposit`.
        exact_times_supply: u128,
    }

    impl Holder {
        fn settle(&mut self, acc: u128) {
            self.accrued =
                settled_accrued(self.shares, self.checkpoint, self.accrued, acc).unwrap();
            self.checkpoint = acc;
            self.settles += 1;
        }

        fn claim(&mut self, acc: u128) -> u64 {
            self.settle(acc);
            let pay = self.accrued;
            self.accrued = 0;
            self.claimed += pay;
            pay
        }
    }

    /// Settles both sides, then moves shares, exactly like the transfer hook.
    fn transfer(holders: &mut [Holder], from: usize, to: usize, amount: u64, acc: u128) {
        holders[from].settle(acc);
        if from == to {
            return;
        }
        holders[to].settle(acc);
        holders[from].shares -= amount;
        holders[to].shares += amount;
    }

    #[test]
    fn transfer_after_claim_cannot_double_claim() {
        // A=60, B=40, deposit 1000. A claims 600, sends everything to B; B can only claim 400.
        let mut h = [
            Holder {
                shares: 60,
                ..Holder::default()
            },
            Holder {
                shares: 40,
                ..Holder::default()
            },
        ];
        let acc = deposit(0, 1_000, 0, 100).unwrap().acc_after;
        assert_eq!(h[0].claim(acc), 600);
        transfer(&mut h, 0, 1, 60, acc);
        assert_eq!(h[1].claim(acc), 400);
        assert_eq!(h[0].claim(acc), 0);
        assert_eq!(h[0].claimed + h[1].claimed, 1_000);
    }

    #[test]
    fn late_recipient_gets_no_past_revenue() {
        // A=60, B=40, deposit 1000, A sends 30 to C: C earns nothing from the past deposit,
        // A keeps what it earned before the transfer.
        let mut h = [
            Holder {
                shares: 60,
                ..Holder::default()
            },
            Holder {
                shares: 40,
                ..Holder::default()
            },
            Holder::default(),
        ];
        let acc = deposit(0, 1_000, 0, 100).unwrap().acc_after;
        transfer(&mut h, 0, 2, 30, acc);
        assert_eq!(h[2].claim(acc), 0);
        assert_eq!(h[0].claim(acc), 600);
        let acc = deposit(acc, 1_000, 0, 100).unwrap().acc_after;
        assert_eq!(h[2].claim(acc), 300);
        assert_eq!(h[0].claim(acc), 300);
        assert_eq!(h[1].claim(acc), 800);
    }

    #[test]
    fn indivisible_deposit_leaves_dust_in_the_vault() {
        let mut h = [
            Holder {
                shares: 1,
                ..Holder::default()
            },
            Holder {
                shares: 1,
                ..Holder::default()
            },
            Holder {
                shares: 1,
                ..Holder::default()
            },
        ];
        let acc = deposit(0, 100, 0, 3).unwrap().acc_after;
        let paid: u64 = h.iter_mut().map(|holder| holder.claim(acc)).sum();
        assert_eq!(paid, 99);
    }

    fn arb_partition() -> impl Strategy<Value = Vec<u64>> {
        prop::collection::vec(1u64..=1 << 20, 1..=20)
    }

    #[derive(Clone, Debug)]
    enum Op {
        Deposit {
            gross: u64,
            fee_bps: u16,
        },
        Transfer {
            from: usize,
            to: usize,
            fraction: u16,
        },
        Claim {
            holder: usize,
        },
    }

    fn arb_op() -> impl Strategy<Value = Op> {
        prop_oneof![
            (0u64..=1 << 40, 0u16..=2_000)
                .prop_map(|(gross, fee_bps)| Op::Deposit { gross, fee_bps }),
            (0usize..20, 0usize..20, 0u16..=10_000).prop_map(|(from, to, fraction)| Op::Transfer {
                from,
                to,
                fraction
            }),
            (0usize..20).prop_map(|holder| Op::Claim { holder }),
        ]
    }

    proptest! {
        #[test]
        fn split_fee_is_exact_floor(amount in any::<u64>(), bps in 0u16..=10_000) {
            let (fee, rest) = split_fee(amount, bps).unwrap();
            prop_assert_eq!(u128::from(fee) + u128::from(rest), u128::from(amount));
            let scaled = u128::from(amount) * u128::from(bps);
            prop_assert!(u128::from(fee) * 10_000 <= scaled);
            prop_assert!(scaled < (u128::from(fee) + 1) * 10_000);
        }

        /// Splitting accrued revenue between the two parts of a position never creates value.
        #[test]
        fn pro_rata_parts_never_exceed_the_amount(amount in any::<u64>(), whole in 1u64.., part in any::<u64>()) {
            let part = part % whole + 1;
            let moved = pro_rata(amount, part, whole).unwrap();
            let kept = pro_rata(amount, whole - part, whole).unwrap();
            prop_assert!(moved <= amount);
            prop_assert!(u128::from(moved) + u128::from(kept) <= u128::from(amount));
            prop_assert!(u128::from(amount) - u128::from(moved) - u128::from(kept) <= 1);
        }

        #[test]
        fn acc_increment_never_overstates(net in any::<u64>(), supply in 1u64..) {
            let increment = acc_increment(net, supply).unwrap();
            let target = u128::from(net) << Q;
            let distributed = increment * u128::from(supply);
            prop_assert!(distributed <= target);
            prop_assert!(target - distributed < u128::from(supply));
        }

        #[test]
        fn any_partition_is_owed_no_more_than_the_whole(
            parts in arb_partition(),
            deposits in prop::collection::vec(any::<u64>(), 1..8),
        ) {
            let supply: u64 = parts.iter().sum();
            let mut acc = 0u128;
            let mut total_net = 0u64;
            for net in deposits {
                let Some(next_total) = total_net.checked_add(net) else { break };
                total_net = next_total;
                acc = deposit(acc, net, 0, supply).unwrap().acc_after;
            }
            let whole = owed(supply, acc, 0).unwrap();
            let sum_of_parts: u64 = parts.iter().map(|&s| owed(s, acc, 0).unwrap()).sum();
            prop_assert!(sum_of_parts <= whole);
            prop_assert!(whole <= total_net);
        }

        #[test]
        fn owed_never_overflows_within_deposited_total(
            supply in 1u64..,
            holder in any::<u64>(),
            deposits in prop::collection::vec(any::<u64>(), 1..16),
        ) {
            let shares = holder % supply + 1;
            let mut acc = 0u128;
            let mut total_net = 0u64;
            for net in deposits {
                let Some(next_total) = total_net.checked_add(net) else { break };
                total_net = next_total;
                acc = deposit(acc, net, 0, supply).unwrap().acc_after;
            }
            let paid = owed(shares, acc, 0).unwrap();
            prop_assert!(paid <= total_net);
        }

        /// P1: random deposit / transfer / claim sequences against the exact rational model.
        /// Per holder `claimed <= exact` and `exact - claimed <= #settles`; the vault never
        /// pays more than was deposited and keeps at most one unit of dust per settle.
        #[test]
        fn ledger_never_overpays(
            parts in arb_partition(),
            ops in prop::collection::vec(arb_op(), 1..=1_000),
        ) {
            let supply: u64 = parts.iter().sum();
            let mut holders: Vec<Holder> = parts
                .iter()
                .map(|&shares| Holder { shares, ..Holder::default() })
                .collect();
            let n = holders.len();
            let mut acc = 0u128;
            let mut total_net = 0u64;
            let mut total_claimed = 0u64;

            for op in ops {
                match op {
                    Op::Deposit { gross, fee_bps } => {
                        let d = deposit(acc, gross, fee_bps, supply).unwrap();
                        acc = d.acc_after;
                        total_net += d.net;
                        for holder in holders.iter_mut() {
                            holder.exact_times_supply += u128::from(d.net) * u128::from(holder.shares);
                        }
                    }
                    Op::Transfer { from, to, fraction } => {
                        let (from, to) = (from % n, to % n);
                        let amount = u64::try_from(
                            u128::from(holders[from].shares) * u128::from(fraction) / 10_000,
                        )
                        .unwrap();
                        transfer(&mut holders, from, to, amount, acc);
                    }
                    Op::Claim { holder } => {
                        total_claimed += holders[holder % n].claim(acc);
                    }
                }

                prop_assert_eq!(holders.iter().map(|h| h.shares).sum::<u64>(), supply);
                prop_assert!(holders.iter().all(|h| h.checkpoint <= acc));
                let outstanding: u64 = holders
                    .iter()
                    .map(|h| settled_accrued(h.shares, h.checkpoint, h.accrued, acc).unwrap())
                    .sum();
                prop_assert!(total_claimed + outstanding <= total_net);
            }

            for holder in holders.iter_mut() {
                total_claimed += holder.claim(acc);
            }

            let supply = u128::from(supply);
            let mut total_settles = 0u64;
            for holder in &holders {
                let claimed_times_supply = u128::from(holder.claimed) * supply;
                prop_assert!(claimed_times_supply <= holder.exact_times_supply);
                // Each settle floors away < 1 unit and each deposit's accumulator floor costs a
                // holder at most shares * deposits / 2^64 < 1 / supply units, so the shortfall
                // (a multiple of 1 / supply) is bounded by the number of settles.
                prop_assert!(
                    holder.exact_times_supply - claimed_times_supply
                        <= u128::from(holder.settles) * supply
                );
                total_settles += holder.settles;
            }
            prop_assert!(total_claimed <= total_net);
            prop_assert!(total_net - total_claimed <= total_settles);
        }
    }
}
