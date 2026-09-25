/**
 * Where the e2e burner wallet keeps its secret key in localStorage, as the JSON array of 64
 * bytes `solana-keygen` writes. The Playwright suite (frontend/e2e) puts a key of its own here
 * before the app loads, so every test knows which wallet it drives. Kept apart from the adapter
 * so the tests can import it without the wallet libraries.
 */
export const E2E_BURNER_STORAGE_KEY = 'axel:e2e-burner-secret-key';
