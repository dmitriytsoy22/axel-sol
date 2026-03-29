import { useState, useEffect } from 'react';
import { ProjectState } from '@/types/project';

const MOCK_PROJECTS: ProjectState[] = [
  {
    admin: 'adminAddress1',
    mint: 'mintAddress1',
    escrowVault: 'escrow1',
    revenueVault: 'revenue1',
    status: 'fundraising',
    totalTokenSupply: 10000,
    tokensRemaining: 4000,
    pricePerToken: 1_000_000_000, // 1 SOL
    minInvestment: 500_000_000,
    maxInvestment: 50_000_000_000,
    solRaised: 6000 * 1_000_000_000, // 6000 SOL
    minRaise: 2000 * 1_000_000_000,
    maxRaise: 10000 * 1_000_000_000,
    deadline: Math.floor(Date.now() / 1000) + 86400 * 30, // +30 days
    investorCount: 120,
    carMake: 'Toyota',
    carModel: 'Camry',
    carYear: 2024,
    vin: '1NX...342',
    licensePlate: 'ABC 123',
    imageUrl: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fd?auto=format&fit=crop&q=80&w=800',
  },
  {
    admin: 'adminAddress2',
    mint: 'mintAddress2',
    escrowVault: 'escrow2',
    revenueVault: 'revenue2',
    status: 'active',
    totalTokenSupply: 5000,
    tokensRemaining: 0,
    pricePerToken: 2_000_000_000, // 2 SOL
    minInvestment: 1_000_000_000,
    maxInvestment: 10_000_000_000,
    solRaised: 5000 * 2_000_000_000, // 10000 SOL
    minRaise: 10000 * 2_000_000_000,
    maxRaise: 10000 * 2_000_000_000,
    deadline: Math.floor(Date.now() / 1000) - 86400 * 5, // -5 days
    investorCount: 250,
    carMake: 'Kia',
    carModel: 'K5',
    carYear: 2023,
    vin: 'KNX...999',
    licensePlate: 'XYZ 987',
    imageUrl: 'https://images.unsplash.com/photo-1629897048514-3dd7414df8fd?auto=format&fit=crop&q=80&w=800',
  },
  {
    admin: 'adminAddress3',
    mint: 'mintAddress3',
    escrowVault: 'escrow3',
    revenueVault: 'revenue3',
    status: 'paused',
    totalTokenSupply: 8000,
    tokensRemaining: 2000,
    pricePerToken: 500_000_000, // 0.5 SOL
    minInvestment: 500_000_000,
    maxInvestment: 20_000_000_000,
    solRaised: 6000 * 500_000_000,
    minRaise: 4000 * 500_000_000,
    maxRaise: 8000 * 500_000_000,
    deadline: Math.floor(Date.now() / 1000) + 86400 * 10, // +10 days
    investorCount: 80,
    carMake: 'Hyundai',
    carModel: 'Sonata',
    carYear: 2024,
    vin: 'KMH...555',
    licensePlate: 'DEF 456',
    imageUrl: 'https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&q=80&w=800',
  }
];

export function useProjectState(): {
  projects: ProjectState[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [toggleTracker, setToggleTracker] = useState(0);

  const refetch = () => {
    setToggleTracker(prev => prev + 1);
  };

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      if (!mounted) return;
      
      // Simulate roughly 20% chance of RPC error 
      if (Math.random() < 0.2) {
        setError(new Error('RPC Connection Timeout: Failed to load projects data.'));
        setIsLoading(false);
        return;
      }

      setProjects(MOCK_PROJECTS);
      setIsLoading(false);
    }, 1500); // simulate 1.5s network delay
    
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [toggleTracker]);

  return { projects, isLoading, error, refetch };
}
