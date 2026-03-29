import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DataTable, ColumnDef } from '../DataTable';

interface TestData {
  id: number;
  name: string;
  amount: number;
}

const mockData: TestData[] = [
  { id: 1, name: 'Alice', amount: 300 },
  { id: 2, name: 'Bob', amount: 100 },
  { id: 3, name: 'Charlie', amount: 200 },
];

const mockColumns: ColumnDef<TestData>[] = [
  { header: 'ID', accessorKey: 'id', sortable: true },
  { header: 'Name', accessorKey: 'name', sortable: true },
  { header: 'Amount', accessorKey: 'amount', sortable: true, cell: (item) => `$${item.amount}` },
];

describe('DataTable', () => {
  it('renders data correctly', () => {
    render(<DataTable data={mockData} columns={mockColumns} />);
    
    expect(screen.getAllByText('Alice')[0]).toBeInTheDocument();
    expect(screen.getAllByText('$300')[0]).toBeInTheDocument();
  });

  it('handles empty state', () => {
    render(<DataTable data={[]} columns={mockColumns} emptyMessage="No items found" />);
    
    expect(screen.getAllByText('No items found')[0]).toBeInTheDocument();
  });

  it('sorts data ascending and descending', () => {
    render(<DataTable data={mockData} columns={mockColumns} />);
    
    const amountHeader = screen.getAllByText('Amount')[0].closest('th');
    
    // Initial order is unsorted (renders in array order)
    let cells = screen.getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('$300'); // Alice's amount
    expect(cells[5]).toHaveTextContent('$100'); // Bob's amount
    expect(cells[8]).toHaveTextContent('$200'); // Charlie's amount

    // Click to sort ascending by amount
    fireEvent.click(amountHeader!);
    
    cells = screen.getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('$100'); // Bob
    expect(cells[5]).toHaveTextContent('$200'); // Charlie
    expect(cells[8]).toHaveTextContent('$300'); // Alice

    // Click to sort descending by amount
    fireEvent.click(amountHeader!);
    
    cells = screen.getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('$300'); // Alice
    expect(cells[5]).toHaveTextContent('$200'); // Charlie
    expect(cells[8]).toHaveTextContent('$100'); // Bob
  });

  it('paginates data correctly', () => {
    const manyData = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      name: `Person ${i}`,
      amount: i * 10,
    }));

    render(<DataTable data={manyData} columns={mockColumns} pageSize={10} />);
    
    // Page 1
    expect(screen.getAllByText('Person 0')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Person 9')[0]).toBeInTheDocument();
    expect(screen.queryByText('Person 10')).not.toBeInTheDocument();
    
    // Page indicators
    expect(screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content === '1';
    })[0]).toBeInTheDocument();
    
    expect(screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content === '2';
    })[0]).toBeInTheDocument();

    const nextBtn = screen.getByLabelText('Next Page');
    const prevBtn = screen.getByLabelText('Previous Page');
    
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Go to Page 2
    fireEvent.click(nextBtn);
    
    expect(screen.queryByText('Person 9')).not.toBeInTheDocument();
    expect(screen.getAllByText('Person 10')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Person 14')[0]).toBeInTheDocument();

    expect(nextBtn).toBeDisabled();
    expect(prevBtn).not.toBeDisabled();
  });
});
