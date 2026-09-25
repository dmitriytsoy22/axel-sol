import type { ProjectAccount } from '@/lib/solana/accounts';
import type { CarMetadata, PaymentToken } from '@/lib/solana/tokens';

export type { ProjectStatus } from '@/lib/solana/accounts';

/** A project account with the car its share mint describes and the token it is priced in. */
export interface Project extends ProjectAccount {
  car: CarMetadata;
  payment: PaymentToken;
}
