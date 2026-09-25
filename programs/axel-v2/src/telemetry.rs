//! Telemetry hash chain. Daily fleet reports stay off-chain; each project stores only the
//! chain head, so anyone holding the published reports can recompute it and compare.

use solana_sha256_hasher::hashv;

/// Head after appending one daily record: `sha256(head || date as u32 LE || data_hash)`,
/// where `data_hash` is the SHA-256 of the canonical (RFC 8785) JSON report of that day.
pub fn next_head(head: &[u8; 32], date: u32, data_hash: &[u8; 32]) -> [u8; 32] {
    hashv(&[head.as_slice(), &date.to_le_bytes(), data_hash.as_slice()]).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(bytes: &[u8; 32]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    /// Reference values computed independently with Node's `crypto.createHash("sha256")`.
    #[test]
    fn matches_an_independent_sha256_implementation() {
        let first = next_head(&[0; 32], 20261001, &[0x11; 32]);
        assert_eq!(
            hex(&first),
            "9cda215c2d7196bacfa2ba5c6b6b49fd715cdefa07dac71a7a4d54253e315e0d"
        );
        let second = next_head(&first, 20261002, &[0x22; 32]);
        assert_eq!(
            hex(&second),
            "5408cc2e761e8f551820d65088f7ccafe180834d659dde923aaad56baa82291c"
        );
    }

    #[test]
    fn every_input_changes_the_head() {
        let base = next_head(&[1; 32], 20261001, &[2; 32]);
        assert_ne!(base, next_head(&[3; 32], 20261001, &[2; 32]));
        assert_ne!(base, next_head(&[1; 32], 20261002, &[2; 32]));
        assert_ne!(base, next_head(&[1; 32], 20261001, &[4; 32]));
    }
}
