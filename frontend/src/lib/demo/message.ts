/**
 * The text a wallet signs to ask for demo access. The server rebuilds it from the wallet and
 * the nonce it issued, so the client cannot slip in anything else, and the wallet shows the
 * reader exactly what it signs: no transaction, nothing that moves funds.
 */
export function accessMessage(wallet: string, nonce: string): string {
  return [
    'AXEL devnet demo access',
    '',
    'Sign to receive demo KYC, test tenge and a little devnet SOL for this wallet.',
    'This is not a transaction and costs nothing.',
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}
