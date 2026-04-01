import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const idlPath = join(import.meta.dirname!, "..", "target", "idl", "axel.json");
const idl = JSON.parse(readFileSync(idlPath, "utf-8"));

const codama = createFromRoot(rootNodeFromAnchor(idl));
codama.accept(
  renderVisitor(join(import.meta.dirname!, "..", "sdk", "generated"))
);

console.log("Codama clients generated at sdk/generated/");
