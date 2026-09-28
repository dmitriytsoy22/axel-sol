import React from 'react';
import { carTitle, type CarMetadata } from '@/lib/solana/tokens';

/*
 * A fleet has several cars of one model (three Chevrolet Cobalts in the seed), so wherever a
 * car is named outside its own page, its share symbol comes with the model to tell it apart.
 */

/** "Chevrolet Cobalt AXCOB002", for a car named inside a sentence. */
export function carLabel(car: CarMetadata): string {
  return [carTitle(car), car.symbol].filter(Boolean).join(' ');
}

/** The model with the share symbol muted in mono beside it, as the holdings table shows it. */
export function CarName({ car }: { car: CarMetadata }): JSX.Element {
  return (
    <>
      {carTitle(car)}
      {car.symbol && (
        <>
          {' '}
          <span className="font-mono font-normal text-muted-foreground">{car.symbol}</span>
        </>
      )}
    </>
  );
}
