#!/usr/bin/env node
// Writes the version log page: one <details> per release, newest first, built from the v0.0.N git tags,
// and version.json next to it, which the app reads for the version link in the sidebar.
// A commit with no tag yet is the next release; the pages workflow tags it once it's deployed.
//
//   node bin/version-log.mjs <output.html>

import { appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

const output = process.argv[2];
if (!output)
{
    console.error("usage: version-log.mjs <output.html>");
    process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf-8" }).trim();
const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const tags = git("tag", "--list", "v0.0.*").split("\n").filter(Boolean)
    .sort((a, b) => Number(a.split(".")[2]) - Number(b.split(".")[2]));

// `git tag --points-at` so a re-run of the same commit doesn't count as a new release
const current = git("tag", "--points-at", "HEAD", "--list", "v0.0.*").split("\n").filter(Boolean)[0];
const last = tags[tags.length - 1];
const version = current ?? `v0.0.${last ? Number(last.split(".")[2]) + 1 : 1}`;

const refs = tags.map(tag => ({ version: tag, ref: tag }));
if (!current) refs.push({ version, ref: "HEAD" });

const releases = refs.map(({ version, ref }, index) => {
    const previous = refs[index - 1]?.ref;
    return {
        version,
        date: git("log", "-1", "--format=%cs", ref),
        changes: git("log", "--format=%s", previous ? `${previous}..${ref}` : ref).split("\n").filter(Boolean),
    };
}).reverse();

const entry = (release, index) => `        <details id="${release.version}"${index === 0 ? " open" : ""}>
            <summary>${release.version} (${release.date}): ${release.changes.length} ${release.changes.length === 1 ? "change" : "changes"}</summary>
            <ul>
${release.changes.map(change => `                <li>${escape(change)}</li>`).join("\n")}
            </ul>
        </details>`;

writeFileSync(output, `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>papchat versions</title>
</head>
<body>
    <main>
        <h1>papchat versions</h1>
        <p>Current version: ${version}. <a href="./">Open papchat</a></p>
${releases.map(entry).join("\n")}
    </main>
    <script>
        // a link to a version opens it
        document.getElementById(location.hash.slice(1))?.setAttribute("open", "");
    </script>
</body>
</html>
`);

writeFileSync(join(dirname(output), "version.json"), JSON.stringify({ version }) + "\n");

console.log(`${output}: ${releases.length} releases, current ${version}`);

// the workflow tags a new release after it's deployed
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${current ? "" : version}\n`);
