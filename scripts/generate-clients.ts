import {
  accountNode,
  bottomUpTransformerVisitor,
  constantPdaSeedNodeFromString,
  createFromRoot,
  numberTypeNode,
  pdaLinkNode,
  pdaNode,
  pdaSeedValueNode,
  pdaValueNode,
  programNode,
  publicKeyTypeNode,
  variablePdaSeedNode,
  type PdaNode,
  type PdaValueNode,
  type ProgramNode,
} from "codama";
import { rootNodeFromAnchor, type AnchorIdl } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dirname, "..");
const idlPath = join(repo, "target", "idl", "axel_v2.json");
const sdkPath = join(repo, "sdk", "axel-v2");

/** Every PDA of axel_v2 once, named after what it holds, with seeds as in `constants.rs`. */
const pdas: PdaNode[] = [
  pdaNode({ name: "config", seeds: [constantPdaSeedNodeFromString("utf8", "config")] }),
  pdaNode({
    name: "investor",
    seeds: [constantPdaSeedNodeFromString("utf8", "investor"), variablePdaSeedNode("wallet", publicKeyTypeNode())],
  }),
  pdaNode({
    name: "project",
    seeds: [constantPdaSeedNodeFromString("utf8", "project"), variablePdaSeedNode("shareMint", publicKeyTypeNode())],
  }),
  pdaNode({
    name: "position",
    seeds: [
      constantPdaSeedNodeFromString("utf8", "position"),
      variablePdaSeedNode("project", publicKeyTypeNode()),
      variablePdaSeedNode("owner", publicKeyTypeNode()),
    ],
  }),
  pdaNode({
    name: "revenuePeriod",
    seeds: [
      constantPdaSeedNodeFromString("utf8", "period"),
      variablePdaSeedNode("project", publicKeyTypeNode()),
      variablePdaSeedNode("index", numberTypeNode("u32")),
    ],
  }),
  pdaNode({
    name: "escrowVault",
    seeds: [constantPdaSeedNodeFromString("utf8", "escrow"), variablePdaSeedNode("project", publicKeyTypeNode())],
  }),
  pdaNode({
    name: "revenueVault",
    seeds: [constantPdaSeedNodeFromString("utf8", "revenue"), variablePdaSeedNode("project", publicKeyTypeNode())],
  }),
  pdaNode({
    name: "recoveryRequest",
    seeds: [
      constantPdaSeedNodeFromString("utf8", "recovery"),
      variablePdaSeedNode("project", publicKeyTypeNode()),
      variablePdaSeedNode("fromOwner", publicKeyTypeNode()),
    ],
  }),
  pdaNode({
    name: "extraAccountMetas",
    seeds: [
      constantPdaSeedNodeFromString("utf8", "extra-account-metas"),
      variablePdaSeedNode("shareMint", publicKeyTypeNode()),
    ],
  }),
];

/** Program accounts that live at one of the PDAs above. */
const accountPdas: Record<string, string> = {
  config: "config",
  investor: "investor",
  project: "project",
  position: "position",
  revenuePeriod: "revenuePeriod",
  recoveryRequest: "recoveryRequest",
};

/**
 * Codama names a PDA after the instruction account it was found on, so one address gets a
 * name per account (`fromInvestor`, `toPosition`, ...). This maps those names, and their
 * seed names, onto the canonical PDAs.
 */
const aliases: Record<string, { pda: string; seeds: Record<string, string> }> = {
  investor: { pda: "investor", seeds: { owner: "wallet" } },
  setInvestorInvestor: { pda: "investor", seeds: { wallet: "wallet" } },
  fromInvestor: { pda: "investor", seeds: { fromOwner: "wallet" } },
  toInvestor: { pda: "investor", seeds: { toOwner: "wallet" } },
  fromPosition: { pda: "position", seeds: { fromOwner: "owner" } },
  toPosition: { pda: "position", seeds: { toOwner: "owner" } },
  executeProject: { pda: "project", seeds: { mint: "shareMint" } },
  request: { pda: "recoveryRequest", seeds: {} },
};

function canonicalPdaValue(node: PdaValueNode): PdaValueNode {
  if (node.pda.kind !== "pdaLinkNode") {
    return node;
  }
  const alias = aliases[node.pda.name];
  if (alias === undefined) {
    return node;
  }
  return pdaValueNode(
    pdaLinkNode(alias.pda),
    node.seeds.map((seed) => pdaSeedValueNode(alias.seeds[seed.name] ?? seed.name, seed.value)),
  );
}

function canonicalProgram(program: ProgramNode): ProgramNode {
  const known = new Set<string>(pdas.map((pda) => pda.name));
  const unknown = program.pdas.filter((pda) => !known.has(aliases[pda.name]?.pda ?? pda.name));
  if (unknown.length > 0) {
    throw new Error(`PDAs without a canonical definition: ${unknown.map((pda) => pda.name).join(", ")}`);
  }
  return programNode({
    ...program,
    pdas,
    accounts: program.accounts.map((account) =>
      accountPdas[account.name] === undefined ? account : accountNode({ ...account, pda: pdaLinkNode(accountPdas[account.name]) }),
    ),
  });
}

const idl = JSON.parse(readFileSync(idlPath, "utf-8")) as AnchorIdl;
const codama = createFromRoot(rootNodeFromAnchor(idl));
codama.update(
  bottomUpTransformerVisitor([
    { select: "[pdaValueNode]", transform: (node) => canonicalPdaValue(node as PdaValueNode) },
    { select: "[programNode]", transform: (node) => canonicalProgram(node as ProgramNode) },
  ]),
);
await codama.accept(renderVisitor(sdkPath, { syncPackageJson: false }));

console.log(`axel_v2 client generated in ${join("sdk", "axel-v2", "src", "generated")}`);
