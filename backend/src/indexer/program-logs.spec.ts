import { programLogEvents } from './program-logs';

const AXEL = 'AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';

describe('programLogEvents', () => {
  it('collects the records the program writes, in log order', () => {
    const logs = [
      `Program ${COMPUTE_BUDGET} invoke [1]`,
      `Program ${COMPUTE_BUDGET} success`,
      `Program ${AXEL} invoke [1]`,
      'Program log: Instruction: BuyShares',
      'Program data: Zmlyc3Q=',
      'Program data: c2Vjb25k',
      `Program ${AXEL} consumed 62000 of 199850 compute units`,
      `Program ${AXEL} success`,
    ];

    expect(programLogEvents(logs, AXEL)).toEqual({
      events: [
        { index: 0, data: 'Zmlyc3Q=' },
        { index: 1, data: 'c2Vjb25k' },
      ],
      truncated: false,
    });
  });

  it('collects records the program writes as the transfer hook inside Token-2022', () => {
    const logs = [
      `Program ${TOKEN_2022} invoke [1]`,
      'Program log: Instruction: TransferChecked',
      `Program ${AXEL} invoke [2]`,
      'Program log: Instruction: Execute',
      'Program data: aG9vaw==',
      `Program ${AXEL} consumed 13343 of 187000 compute units`,
      `Program ${AXEL} success`,
      `Program ${TOKEN_2022} consumed 40385 of 200000 compute units`,
      `Program ${TOKEN_2022} success`,
    ];

    expect(programLogEvents(logs, AXEL).events).toEqual([{ index: 0, data: 'aG9vaw==' }]);
  });

  it('skips records of programs the program calls, and picks up again after they return', () => {
    const logs = [
      `Program ${AXEL} invoke [1]`,
      'Program log: Instruction: Claim',
      `Program ${TOKEN} invoke [2]`,
      'Program data: dG9rZW4=',
      `Program ${TOKEN} success`,
      'Program data: YWZ0ZXI=',
      `Program ${AXEL} success`,
    ];

    expect(programLogEvents(logs, AXEL).events).toEqual([{ index: 0, data: 'YWZ0ZXI=' }]);
  });

  it('skips records another top-level instruction writes', () => {
    const logs = [
      `Program ${TOKEN_2022} invoke [1]`,
      'Program data: b3RoZXI=',
      `Program ${TOKEN_2022} success`,
      `Program ${AXEL} invoke [1]`,
      'Program data: YXhlbA==',
      `Program ${AXEL} success`,
    ];

    expect(programLogEvents(logs, AXEL).events).toEqual([{ index: 0, data: 'YXhlbA==' }]);
  });

  it('does not take a plain log message for an event', () => {
    const logs = [`Program ${AXEL} invoke [1]`, 'Program log: Zmlyc3Q=', `Program ${AXEL} success`];

    expect(programLogEvents(logs, AXEL).events).toEqual([]);
  });

  it('reports logs the runtime cut off and keeps the records before the cut', () => {
    const logs = [`Program ${AXEL} invoke [1]`, 'Program data: Zmlyc3Q=', 'Log truncated'];

    expect(programLogEvents(logs, AXEL)).toEqual({
      events: [{ index: 0, data: 'Zmlyc3Q=' }],
      truncated: true,
    });
  });
});
