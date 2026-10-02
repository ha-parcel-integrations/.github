const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { aiReleaseNotes } = require("./ai_release_notes.js");

const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_SUBJECT = /^(feat|fix)(!)?(?:\([^)]+\))?: (.+)$/;
const RELEASE_BUMP_SUBJECT = /^Bump version to \d+\.\d+\.\d+(?: \(#\d+\))?$/;

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

const TRAILER = /^(?:Co-Authored-By|Signed-off-by|Reviewed-by|Refs):\s/i;
// An issue reference may sit in the body instead of the subject; it still
// owes the bullet its "(#N)" and the reporter their credit.
const BODY_ISSUE_REF = /^(?:Refs?|Fix(?:es|ed)?|Close[sd]?|Resolve[sd]?):?\s+(#\d+(?:\s*,\s*#\d+)*)\s*$/i;
const SUBJECT_ISSUE_REF = /\(#(\d+)\)/g;
// A squash merge composes the body from the squashed subjects, which are
// already the bullets above.
const SQUASHED_SUBJECT = /^\* /;
const LIST_MARKER = /^\s*[-*] /;

function commitDetails(bodyLines) {
  const lines = bodyLines
    .map((line) => line.trimEnd())
    .filter((line) => !TRAILER.test(line) && !BODY_ISSUE_REF.test(line) && !SQUASHED_SUBJECT.test(line));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();

  // Git commit bodies are hand-wrapped at ~72 columns, but GitHub renders
  // every one of those soft line breaks as a hard <br>. Re-flow each
  // wrapped paragraph into a single line so it reads as prose; a blank
  // line in the commit body still starts a new paragraph.
  //
  // So does a list marker, even without a blank line before it. The house
  // style asks for prose, but maintainers do write "- " lists, and re-flowing
  // one into a single paragraph welds every item together into something
  // nobody can read.
  const paragraphs = [];
  let current = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.join(" "));
    current = [];
  };
  for (const line of lines) {
    if (line) {
      if (LIST_MARKER.test(line)) flush();
      // Trimmed, or a hanging-indented continuation line leaves a double
      // space in the middle of the re-flowed paragraph.
      current.push(line.trim());
    } else {
      flush();
    }
  }
  flush();
  return paragraphs;
}

function releaseNotes(changes, helpWanted, repo) {
  const sections = [
    ["New features", changes.filter((change) => change.type === "feat")],
    ["Bug fixes", changes.filter((change) => change.type === "fix")],
  ];
  const lines = [];
  for (const [heading, entries] of sections) {
    if (!entries.length) continue;
    lines.push(`## ${heading}`);
    for (const entry of entries) {
      lines.push(`- ${entry.description}`);
      // Indented so the paragraph(s) stay inside the bullet they explain;
      // a blank line only appears between multiple real paragraphs.
      entry.details.forEach((paragraph, index) => {
        if (index > 0) lines.push("");
        lines.push(`  ${paragraph}`);
      });
    }
    lines.push("");
  }
  if (helpWanted) {
    const issueUrl = `https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22`;
    lines.push(`🙋 [${helpWanted} open question${helpWanted === 1 ? "" : "s"} ${helpWanted === 1 ? "needs" : "need"} a real parcel to answer](${issueUrl})`, "");
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
  // A carrier that has never released yet is normal: the first release is a
  // maintainer decision, not something to derive from commits.
  return release ? release.tag_name : null;
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
    const [subject, ...rest] = commit.commit.message.split("\n");
    const match = RELEASE_SUBJECT.exec(subject);
    if (!match) return [];
    const subjectIssues = [...match[3].matchAll(SUBJECT_ISSUE_REF)].map((ref) => ref[1]);
    const bodyIssues = rest.flatMap((line) => {
      const ref = BODY_ISSUE_REF.exec(line.trim());
      return ref ? [...ref[1].matchAll(/#(\d+)/g)].map((number) => number[1]) : [];
    });
    const issues = [...new Set([...subjectIssues, ...bodyIssues])];
    const unlisted = issues.filter((number) => !subjectIssues.includes(number));
    return [{
      type: match[1],
      breaking: Boolean(match[2]),
      description: unlisted.length
        ? `${match[3]} (${unlisted.map((number) => `#${number}`).join(", ")})`
        : match[3],
      details: commitDetails(rest),
      issues,
    }];
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

// The release PR body is the release, and the house style asks a maintainer to
// edit it before merging — but every later feat:/fix: push regenerates it and
// used to throw that editing away. A fingerprint of what the generator last
// wrote tells the two apart: body still matching it, overwrite freely; body
// changed, a human has been here.
const NOTES_FINGERPRINT = /\n*<!-- notes-sha: ([0-9a-f]{64}) -->\s*$/;

// GitHub hands a PR body back with CRLF line endings and its own trailing
// whitespace, so the fingerprint is taken over a normalised form. Without
// this, a body nobody touched reads as edited and the notes would never
// regenerate again.
function canonical(notes) {
  return notes.replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

function fingerprint(notes) {
  return crypto.createHash("sha256").update(canonical(notes)).digest("hex");
}

function stamp(notes) {
  return `${canonical(notes)}\n\n<!-- notes-sha: ${fingerprint(notes)} -->`;
}

function editedByHand(body) {
  const normalised = (body || "").replace(/\r\n/g, "\n");
  const match = NOTES_FINGERPRINT.exec(normalised);
  // No stamp at all means it predates this check or was written by hand; either
  // way, keeping it is the safe choice.
  if (!match) return true;
  return fingerprint(normalised.slice(0, match.index)) !== match[1];
}

async function openReleasePr(github, context) {
  const { data: pulls } = await github.rest.pulls.list({
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: "open",
    head: `${context.repo.owner}:automation/release`,
    per_page: 1,
  });
  return pulls[0] || null;
}

// Returns the body to hand to create-pull-request: the freshly stamped notes,
// or the maintainer's own edited body with the regenerated notes posted as a
// comment instead of silently replacing their work.
async function bodyPreservingEdits(notes, { github, context, core }) {
  let existing;
  try {
    existing = await openReleasePr(github, context);
  } catch (error) {
    core.warning(`Could not read the open release PR (${error.message}); writing the generated notes.`);
    return stamp(notes);
  }
  if (!existing || !editedByHand(existing.body)) return stamp(notes);

  try {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: existing.number,
      body: `This PR's body was edited by hand, so it was left alone. Here are the regenerated notes, including the change that just landed — fold in whatever is worth keeping.\n\n---\n\n${notes}`,
    });
    core.notice(`Release PR #${existing.number} was edited by hand; kept it and posted the regenerated notes as a comment.`);
  } catch (error) {
    core.warning(`Could not post the regenerated notes as a comment (${error.message}); the PR body was still left as edited.`);
  }
  return existing.body;
}

function writeManifestVersion(version) {
  const path = process.env.MANIFEST_PATH;
  const original = fs.readFileSync(path, "utf8");
  const field = /"version":\s*"[^"]+"/;
  if (!field.test(original)) throw new Error(`Could not find version in ${path}`);
  // A manifest already carrying the proposed version (a hand-bumped release, a
  // re-run) is not an error; the PR simply has nothing left to change here.
  fs.writeFileSync(path, original.replace(field, `"version": "${version}"`));
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
  if (!tag) {
    core.notice("No stable release yet; the first one is published by hand.");
    core.setOutput("has_release", "false");
    return;
  }

  const changes = await changesSinceRelease(github, context, tag, head);
  if (!changes.length) {
    core.notice("No feat: or fix: commits since the last stable release; no release PR is needed.");
    core.setOutput("has_release", "false");
    return;
  }

  const version = bumpedVersion(tag, changes);
  const helpWanted = await openHelpWanted(github, context);
  writeManifestVersion(version);

  const repo = `${context.repo.owner}/${context.repo.repo}`;
  let notes;
  try {
    // Suite scripts are checked out two levels above this file (see
    // carrier-release.yml); CONVENTIONS.md lives at that root.
    const suitePath = path.join(__dirname, "..", "..");
    notes = await aiReleaseNotes(changes, helpWanted, repo, { github, context, core, suitePath });
  } catch (error) {
    core.warning(`AI release notes failed, falling back to the mechanical notes: ${error.message}`);
    notes = releaseNotes(changes, helpWanted, repo);
  }

  const body = await bodyPreservingEdits(notes, { github, context, core });

  core.setOutput("has_release", "true");
  core.setOutput("version", version);
  core.setOutput("notes", body);
  core.notice(`Proposing ${version} (${tag} + ${changes.length} change(s)).`);
  core.info(`Release notes:\n${notes}`);
};
