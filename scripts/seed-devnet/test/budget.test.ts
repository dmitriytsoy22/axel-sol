import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeBudget, feePayerOf, SHARE_ACCOUNT_SIZE, type Budget } from "../budget";
import { buildPlan, type Plan } from "../plan";

/** Devnet's rent as measured in the design spec: (size + 128) * 5 080 lamports. */
const rent = async (size: number) => BigInt(size + 128) * 5_080n;

async function budgetOf(scale: "tiny" | "full"): Promise<{ plan: Plan; budget: Budget }> {
  const plan = buildPlan({ seed: "axel-demo-2026", scale, anchorDate: "2026-09-25" });
  return { plan, budget: await computeBudget({ plan, rent, mintSize: () => 729 }) };
}

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

describe("SOL budget", () => {
  test("prices every line as count × rent of its size", async () => {
    const { budget } = await budgetOf("tiny");
    for (const line of budget.lines) {
      assert.equal(line.total, BigInt(line.count) * (await rent(line.size)), line.label);
    }
  });

  test("splits the peak exactly between the payers", async () => {
    const { budget } = await budgetOf("full");
    assert.equal(sum([...budget.needs.values()]), budget.peak);
  });

  test("counts one position and one share account per planned holder, and one period per deposit", async () => {
    const { plan, budget } = await budgetOf("full");
    const positions = plan.expected.reduce((total, project) => total + project.positions.size, 0);
    const line = (label: string) => budget.lines.filter((l) => l.label.startsWith(label)).reduce((n, l) => n + l.count, 0);

    assert.equal(line("Positions"), positions);
    assert.equal(line("Share accounts"), positions);
    assert.equal(line("Revenue periods"), plan.steps.filter((step) => step.kind === "deposit").length);
  });

  test("counts the faucet's signature only on onboardings that mint tKZT", async () => {
    const { plan } = await budgetOf("tiny");
    const onboard = (investor: string) =>
      feePayerOf(plan, plan.steps.find((step) => step.kind === "onboard" && step.investor === investor)!);

    assert.deepEqual(onboard("investor-01"), { payer: "master", signatures: 3 });
    assert.deepEqual(onboard("recovery-new"), { payer: "master", signatures: 2 });
  });

  test("charges 5 000 lamports per signature of every step", async () => {
    const { plan, budget } = await budgetOf("full");
    const signatures = plan.steps.reduce((total, step) => total + feePayerOf(plan, step).signatures, 0);
    assert.equal(sum([...budget.fees.values()].map((fee) => fee.lamports)), BigInt(signatures) * 5_000n);
  });

  test("leaves out of the locked total only the rent that comes back", async () => {
    const { budget } = await budgetOf("full");
    const returned = sum(budget.lines.filter((line) => line.returned).map((line) => line.total));
    assert.equal(budget.locked, budget.peak - returned);
  });

  test("sizes a holder's share account as a Token-2022 ATA with the transfer hook extension", () => {
    assert.equal(SHARE_ACCOUNT_SIZE, 175);
  });
});
