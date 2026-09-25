/**
 * Compares the chain with the plan's ledger model after a complete run: every project's
 * state, totals and telemetry head, and every position's shares, claims and pending revenue
 * must be exactly what the plan computed.
 */
import { big, variant } from "./lib/program";
import { investorKey } from "./documents";
import { projectRefOf, type Context } from "./execute";

export async function checkExpectations(ctx: Context): Promise<string[]> {
  const problems: string[] = [];
  const mismatch = (what: string, actual: unknown, expected: unknown) => {
    if (actual !== expected) {
      problems.push(`${what}: chain ${String(actual)}, plan ${String(expected)}`);
    }
  };
  for (const project of ctx.plan.projects) {
    const expected = ctx.plan.expected[project.index];
    const ref = projectRefOf(ctx, project.index);
    const account = await ctx.chain.account(ref.address);
    if (account === null) {
      problems.push(`${project.id}: project account missing`);
      continue;
    }
    const state = ctx.axel.decode("project", account.data);
    const acc = big(state.accPerShare);
    mismatch(`${project.id} state`, variant(state.state), expected.state);
    mismatch(`${project.id} shares sold`, big(state.sharesSold), expected.sold);
    mismatch(`${project.id} shares refunded`, big(state.sharesRefunded), expected.refunded);
    mismatch(`${project.id} periods`, state.periodCount, expected.periods);
    mismatch(`${project.id} telemetry days`, state.telemetryCount, expected.telemetryDays);
    mismatch(
      `${project.id} telemetry head`,
      Buffer.from(state.telemetryHead).toString("hex"),
      ctx.docs.projects[project.index].finalHead.toString("hex"),
    );
    mismatch(`${project.id} deposited net`, big(state.totalDepositedNet), expected.depositedNet);
    mismatch(`${project.id} claimed`, big(state.totalClaimed), expected.claimed);

    const owners = [...expected.positions.keys()];
    const accounts = await ctx.chain.accounts(
      owners.map((owner) => ctx.axel.position(ref.address, investorKey(ctx.keys, owner).publicKey)),
    );
    owners.forEach((owner, i) => {
      const raw = accounts[i];
      const want = expected.positions.get(owner)!;
      if (raw === null) {
        problems.push(`${project.id} ${owner}: position missing`);
        return;
      }
      const position = ctx.axel.decode("position", raw.data);
      const pending =
        big(position.accrued) + ((big(position.shares) * (acc - big(position.accCheckpoint))) >> 64n);
      mismatch(`${project.id} ${owner} shares`, big(position.shares), want.shares);
      mismatch(`${project.id} ${owner} claimed`, big(position.totalClaimed), want.claimed);
      mismatch(`${project.id} ${owner} pending`, pending, want.pending);
      mismatch(`${project.id} ${owner} paid in`, big(position.paidIn), want.paidIn);
    });
  }
  return problems;
}
