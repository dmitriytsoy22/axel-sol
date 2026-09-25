//! Calendar dates as `YYYYMMDD` integers. Revenue periods and telemetry records carry the
//! dates the fleet reports, not block times; ordering the integers orders the dates.

const MIN_YEAR: u32 = 2000;
const MAX_YEAR: u32 = 9999;

/// True when `date` is a real calendar day between the years 2000 and 9999.
pub fn is_valid_date(date: u32) -> bool {
    let (year, month, day) = (date / 10_000, date / 100 % 100, date % 100);
    (MIN_YEAR..=MAX_YEAR).contains(&year)
        && (1..=12).contains(&month)
        && (1..=days_in_month(year, month)).contains(&day)
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        2 if is_leap_year(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn is_leap_year(year: u32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_days() {
        for date in [20000101, 20261001, 20261031, 20261130, 20261231, 99991231] {
            assert!(is_valid_date(date), "{date}");
        }
    }

    #[test]
    fn rejects_days_that_do_not_exist() {
        for date in [
            0, 19991231, 100000101, 20260001, 20261301, 20261000, 20261032, 20260431, 20260229,
            20260230,
        ] {
            assert!(!is_valid_date(date), "{date}");
        }
    }

    #[test]
    fn february_follows_the_gregorian_leap_rule() {
        assert!(is_valid_date(20280229), "divisible by 4");
        assert!(!is_valid_date(21000229), "century");
        assert!(is_valid_date(20000229), "divisible by 400");
    }
}
