const fs = require("fs");

const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_SUBJECT = /^(feat|fix)(!)?(?:\([^)]+\))?: (.+)$/;
const RELEASE_BUMP_SUBJECT = /^Bump version to \d+\.\d+\.\d+$/;

function parseStable(version) {
  const match = STABLE_VERSION.exec(version);
  if (!match) throw new Error(`Expected a stable X.Y.Z tag, got ${version}`);
  return match.slice(1).map(Number);
}

function bumpedVersion(version, changes) {
  const [major, minor, patch] = parseStable(version);
  if (changes.some((change) => change.breaking)) return `${major + 1}.0.0`;
  if (changes.some((change) => change.type === "feat")) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function releaseNotes(changes, helpWanted, repo) {
  const sections = [
    ["New features", changes.filter((change) => change.type === "feat")],
    ["Bug fixes", changes.filter((change) => change.type === "fix")],
  ];
  const lines = [];
  for (const [heading, entries] of sections) {
    if (!entries.length) continue;
    lines.push(`## ${heading}`, ...entries.map((entry) => `- ${entry.description}`), "");
  }
  if (helpWanted) {
    const issueUrl = `https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22`;
    lines.push(`🙋 [${helpWanted} open question${helpWanted === 1 ? "" : "s"} need a real parcel to answer](${issueUrl})`, "");
  }
  lines.push("---", "", "📦 [See every supported carrier](https://ha-parcel-integrations.github.io/carriers/) — new ones land regularly.", "💛 [Support the project](https://ha-parcel-integrations.github.io/sponsor/)");
  return lines.join("\n");
}

async function latestStableRelease(github, context) {
  const { data: releases } = await github.rest.repos.listReleases({
    owner: context.repo.owner,
    repo: context.repo.repo,
    per_page: 100,
  });
  const release = releases.find((item) => !item.prerelease && STABLE_VERSION.test(item.tag_name));
  if (!release) throw new Error("No stable GitHub release was found to use as the release base.");
  return release.tag_name;
}

async function changesSinceRelease(github, context, tag, head) {
  const { data } = await github.rest.repos.compareCommits({
    owner: context.repo.owner,
    repo: context.repo.repo,
    base: tag,
    head,
  });
  if (data.total_commits > data.commits.length) {
    throw new Error("More than 250 commits since the last release; split the release before continuing.");
  }
  return data.commits.flatMap((commit) => {
    const subject = commit.commit.message.split("\n", 1)[0];
    const match = RELEASE_SUBJECT.exec(subject);
    if (!match) return [];
    return [{ type: match[1], breaking: Boolean(match[2]), description: match[3] }];
  });
}

async function openHelpWanted(github, context) {
  const { data: issues } = await github.rest.issues.listForRepo({
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: "open",
    labels: "help wanted",
    per_page: 100,
  });
  // The issues endpoint also returns pull requests, which are never questions
  // waiting on a real parcel.
  return issues.filter((issue) => !issue.pull_request).length;
}

function writeManifestVersion(version) {
  const path = process.env.MANIFEST_PATH;
  const original = fs.readFileSync(path, "utf8");
  const updated = original.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`);
  if (updated === original) throw new Error(`Could not find version in ${path}`);
  fs.writeFileSync(path, updated);
}

module.exports = async ({ github, context, core }) => {
  const head = process.env.HEAD_SHA || context.sha;
  const { data: headCommit } = await github.rest.repos.getCommit({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: head,
  });
  if (RELEASE_BUMP_SUBJECT.test(headCommit.commit.message.split("\n", 1)[0])) {
    core.notice("Head is a generated version bump; it is never a release signal.");
    core.setOutput("has_release", "false");
    return;
  }

  const tag = await latestStableRelease(github, context);
  const changes = await changesSinceRelease(github, context, tag, head);
  if (!changes.length) {
    core.notice("No feat: or fix: commits since the last stable release; no release PR is needed.");
    core.setOutput("has_release", "false");
    return;
  }

  const version = bumpedVersion(tag, changes);
  const helpWanted = await openHelpWanted(github, context);
  writeManifestVersion(version);
  core.setOutput("has_release", "true");
  core.setOutput("version", version);
  core.setOutput("notes", releaseNotes(changes, helpWanted, `${context.repo.owner}/${context.repo.repo}`));
  core.notice(`Proposing ${version} (${tag} + ${changes.length} change(s)).`);
};
