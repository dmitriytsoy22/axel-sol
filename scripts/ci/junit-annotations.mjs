// Turns failed test cases in a JUnit report into GitHub Actions error annotations.
// Annotations are readable through the public checks API, unlike job logs.
// An optional second argument is the raw test output: native crashes (a test file's process
// aborting) never reach the JUnit report, so their panic lines are annotated from there.
import { existsSync, readFileSync } from "node:fs";

const MAX_ANNOTATIONS = 10;
const MAX_CRASH_LINES = 40;
const path = process.argv[2];
const outputPath = process.argv[3];

if (!path || !existsSync(path)) {
  console.log(`::notice title=No JUnit report::${path ?? "(no path given)"} was not written`);
  process.exit(0);
}

const decode = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

// Workflow commands treat %, CR and LF specially in the message and ":" / "," in properties.
const escapeData = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (text) => escapeData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");

if (outputPath && existsSync(outputPath)) {
  const lines = readFileSync(outputPath, "utf8").split("\n");
  const crashPattern = /panicked at|fatal runtime error|SIGABRT|memory allocation|thread '/;
  // Since Rust 1.73 the panic message itself is on the line after "panicked at <location>:".
  const crashLines = [
    ...new Set(
      lines
        .flatMap((line, index) =>
          crashPattern.test(line) ? [line, /panicked at/.test(line) ? lines[index + 1] ?? "" : ""] : [],
        )
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_CRASH_LINES);
  if (crashLines.length > 0) {
    console.log(`::error title=Crash output::${escapeData(crashLines.join("\n"))}`);
  }
}

const xml = readFileSync(path, "utf8");
const failures = [];
for (const match of xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g)) {
  const [, attributes, body] = match;
  const failure = body.match(/<failure\b([^>]*)>([\s\S]*?)<\/failure>/);
  if (!failure) continue;
  const name = decode(attributes.match(/\bname="([^"]*)"/)?.[1] ?? "unnamed test");
  const message = decode(failure[1].match(/\bmessage="([^"]*)"/)?.[1] ?? "");
  const details = decode(failure[2]).trim().split("\n").slice(0, 12).join("\n");
  failures.push({ name, text: [message, details].filter(Boolean).join("\n") });
}

for (const { name, text } of failures.slice(0, MAX_ANNOTATIONS)) {
  console.log(`::error title=${escapeProperty(name)}::${escapeData(text)}`);
}
if (failures.length > MAX_ANNOTATIONS) {
  console.log(`::error title=More failures::${failures.length - MAX_ANNOTATIONS} more failed tests, see the job log`);
}
console.log(`${failures.length} failed test case(s) in ${path}`);
