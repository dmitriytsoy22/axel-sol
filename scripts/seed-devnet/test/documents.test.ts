import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  additionalMetadata,
  buildDocuments,
  EMPTY_HEAD,
  hex,
  nextHead,
  telemetryMonthFile,
} from "../documents";
import { hashJson, type Json } from "../lib/jcs";
import { KeyRing } from "../lib/keys";
import { buildPlan, DATA_ORIGIN, SCALES, type Plan } from "../plan";

const SECRET = "test-secret-for-unit-tests-only-0123456789";
const SITE = "https://demo.example";

function plan(scale: (typeof SCALES)[number] = "tiny"): Plan {
  return buildPlan({ seed: "unit-test", scale, anchorDate: "2026-09-25" });
}

function docsOf(p: Plan) {
  return buildDocuments(p, new KeyRing(SECRET, "localnet", `${p.seed}|${p.scale}`), SITE);
}

describe("telemetry hash chain", () => {
  test("matches the program's reference vectors (programs/axel-v2/src/telemetry.rs)", () => {
    const first = nextHead(EMPTY_HEAD, 20261001, Buffer.alloc(32, 0x11));
    const second = nextHead(first, 20261002, Buffer.alloc(32, 0x22));

    assert.equal(hex(first), "9cda215c2d7196bacfa2ba5c6b6b49fd715cdefa07dac71a7a4d54253e315e0d");
    assert.equal(hex(second), "5408cc2e761e8f551820d65088f7ccafe180834d659dde923aaad56baa82291c");
  });

  test("published month files recompute to each car's final head from raw records alone", () => {
    const p = plan();
    const docs = docsOf(p);
    for (const project of p.projects.filter((car) => car.months.length > 0)) {
      let head: Buffer = EMPTY_HEAD;
      for (const report of project.months) {
        const file = telemetryMonthFile(project, docs.projects[project.index], report) as {
          days: Array<{ record: Json & { date: string } }>;
        };
        for (const day of file.days) {
          head = nextHead(head, Number(day.record.date.replaceAll("-", "")), hashJson(day.record));
        }
      }
      assert.equal(hex(head), hex(docs.projects[project.index].finalHead), project.id);
    }
  });
});

describe("published reports", () => {
  test("each monthly report commits to the telemetry head at the end of its month", () => {
    const p = plan();
    const docs = docsOf(p);
    for (const project of p.projects.filter((car) => car.months.length > 0)) {
      const projectDocs = docs.projects[project.index];
      for (const [month, head] of projectDocs.headByMonth) {
        const report = projectDocs.reports.get(month)!.doc as { telemetry: { head: string } };
        assert.equal(report.telemetry.head, hex(head), `${project.id} ${month}`);
      }
    }
  });

  test("every document is labeled as demo seed data", () => {
    const p = plan();
    const docs = docsOf(p);
    const all = docs.projects.flatMap((project) => [
      ...[...project.reports.values()].map((report) => report.doc),
      ...(project.acquisition === undefined ? [] : [project.acquisition.doc]),
      ...[...project.days.values()].map((day) => day.record),
    ]);
    all.push(docs.recovery.doc);
    assert.ok(all.length > 200);
    for (const document of all) {
      assert.equal((document as { data_origin: string }).data_origin, DATA_ORIGIN);
    }
  });

  test("the sale report deposits the sale price as a final deposit", () => {
    const p = plan();
    const closed = p.projects.find((project) => project.target === "closed")!;
    const docs = docsOf(p).projects[closed.index];
    const [id, sale] = [...docs.reports].find(([key]) => key.endsWith("-sale"))!;
    const deposit = p.steps.find((step) => step.kind === "deposit" && step.report === id);

    assert.deepEqual(
      (sale.doc as { deposit: { kind: string; gross_base_units: string } }).deposit,
      {
        kind: "final",
        gross_base_units: (deposit as { grossBase: bigint }).grossBase.toString(),
        currency: "tKZT",
        decimals: 6,
        platform_fee_bps: 500,
      },
    );
  });
});

describe("share mint metadata", () => {
  // Limits of create_project (programs/axel-v2/src/constants.rs).
  for (const scale of SCALES) {
    test(`fits the program's metadata limits at scale ${scale}`, () => {
      const p = plan(scale);
      const docs = docsOf(p);
      for (const project of p.projects) {
        const fields = additionalMetadata(project);
        assert.ok(project.name.length <= 32, project.name);
        assert.ok(project.symbol.length <= 10, project.symbol);
        assert.ok(docs.projects[project.index].uri.length <= 200);
        assert.ok(fields.length <= 8);
        for (const field of fields) {
          assert.ok(field.key.length <= 16 && field.value.length <= 64, `${field.key}=${field.value}`);
        }
      }
    });
  }
});
