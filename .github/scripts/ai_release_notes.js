const fs = require("fs");
const path = require("path");

const MODEL = "claude-sonnet-5";
const ANTHROPIC_AUDIENCE = "https://api.anthropic.com";

// Identifiers, not secrets: safe to commit. Registered under the
// "ha-parcel-integrations" GitHub Actions federation rule in the Claude
// Console (Settings -> Workload identity).
const FEDERATION_RULE_ID = "fdrl_01VgUFSQbCJ1D7o4SwoK1MPo";
const ORGANIZATION_ID = "f65f4e75-a0fc-404d-82aa-2d494a471042";
const SERVICE_ACCOUNT_ID = "svac_01LcoHxucYj1ar67gXPmJB7F";
const WORKSPACE_ID = "wrkspc_019hYCFKV6dbqwVy5WyjWbtg";

async function accessToken(core) {
  const jwt = await core.getIDToken(ANTHROPIC_AUDIENCE);
  const response = await fetch("https://api.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
      federation_rule_id: FEDERATION_RULE_ID,
      organization_id: ORGANIZATION_ID,
      service_account_id: SERVICE_ACCOUNT_ID,
      workspace_id: WORKSPACE_ID,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`WIF exchange failed: ${data.error?.message || response.status}`);
  }
  return data.access_token;
}

// Whoever reported or tested on a referenced issue earns a credit: its author
// and everyone who commented on it. Maintainers and bots never do — the
// tester-request issues are opened by a maintainer, so the real reporters are
// the commenters. Who tested a fix elsewhere (PRs, chat) isn't attributable,
// so that stays a human's call.
const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MAINTAINER_PERMISSIONS = new Set(["admin", "maintain", "write"]);

function earnsCredit(user, association) {
  return Boolean(user?.login) && user.type !== "Bot" && !MAINTAINER_ASSOCIATIONS.has(association);
}

// `author_association` is not enough on its own. It only reads MEMBER for a
// viewer who can *see* the org membership, and this org's memberships are
// private, so the release token sees the maintainer as NONE and credited them
// for reporting their own tester-request issue. Repo permission is visible to
// the token and settles it.
async function isMaintainer(login, { github, context, core }, cache) {
  if (cache.has(login)) return cache.get(login);
  let maintainer = false;
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      owner: context.repo.owner,
      repo: context.repo.repo,
      username: login,
    });
    maintainer = MAINTAINER_PERMISSIONS.has(data.permission);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      // The token cannot read permissions at all, so every login looks like an
      // outside reporter. Credit them rather than dropping a real one, but say
      // so: a wrong credit in the log beats a silent one in the release.
      core.warning(`Could not check whether @${login} is a maintainer (${error.status}); crediting them — check the release PR.`);
    }
    // Anything else (a 404 for someone with no access) is simply not a
    // maintainer, which is the common case.
  }
  cache.set(login, maintainer);
  return maintainer;
}

async function issueAuthors(changes, { github, context, core }) {
  const numbers = [...new Set(changes.flatMap((change) => change.issues || []))];
  const candidates = [];
  const consider = (user, association) => {
    if (earnsCredit(user, association) && !candidates.includes(user.login)) candidates.push(user.login);
  };
  for (const number of numbers) {
    const params = { owner: context.repo.owner, repo: context.repo.repo, issue_number: Number(number) };
    try {
      const { data: issue } = await github.rest.issues.get(params);
      if (issue.pull_request) continue;
      consider(issue.user, issue.author_association);
      const comments = await github.paginate(github.rest.issues.listComments, { ...params, per_page: 100 });
      for (const comment of comments) consider(comment.user, comment.author_association);
    } catch {
      // Deleted or inaccessible issue: no credit to give.
    }
  }
  const cache = new Map();
  const logins = [];
  for (const login of candidates) {
    if (!(await isMaintainer(login, { github, context, core }, cache))) logins.push(login);
  }
  return logins;
}

// A bullet is a short first line plus optional prose paragraphs underneath it,
// the same shape the mechanical notes render. An earlier version asked for "one
// flowing sentence" per change, which turned any commit with a real body into a
// single semicolon-chained paragraph — unreadable, and worse than the fallback
// it was replacing.
const BULLET_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "The bullet's first line: one short user-facing sentence, no leading dash, no line breaks. Keep it to the one thing that changed — if you need a semicolon to chain separate facts, the rest belongs in details. Preserve any trailing \"(#N)\" verbatim.",
    },
    details: {
      type: "array",
      items: { type: "string" },
      description:
        "Optional prose paragraphs expanding the summary, each a plain paragraph with no line breaks and no list syntax. One is usually enough: what they will now see, what they had to do before, or what still will not work. Omit entirely when the summary says everything, and never pad.",
    },
  },
  required: ["summary"],
};

const NOTES_TOOL = {
  name: "emit_release_notes",
  description: "Emit polished, user-facing release notes bullets for a Home Assistant integration release.",
  input_schema: {
    type: "object",
    properties: {
      new_features: {
        type: "array",
        items: BULLET_SCHEMA,
        description: "One bullet per feat: change.",
      },
      bug_fixes: {
        type: "array",
        items: BULLET_SCHEMA,
        description: "One bullet per fix: change.",
      },
    },
    required: ["new_features", "bug_fixes"],
  },
};

function systemPrompt(houseStyle) {
  return `You rewrite Home Assistant integration release notes for the ha-parcel-integrations suite, based on raw commit data.

Follow the suite's written house style for release notes exactly. Here is the full document:

${houseStyle}

Additional hard rules for this task:
- Never invent a fact that isn't in the input commits. If a detail isn't there, leave it out rather than guessing.
- Never mention internal code: field/function/module names, status codes, or enum values (e.g. "K01", "in_transit", "observationCode") unless it is literally text the user sees in the Home Assistant UI (a quoted notification string is fine to keep).
- You are the release's editor, not a transcriber of its commits. Rewrite, shorten and restructure freely: keep every fact you publish traceable to the input and keep the essence intact, but the wording, the order and the shape are yours to choose.
- Write release notes, not essays. A bullet's summary plus at most one short paragraph is the normal size. A second or third paragraph has to earn its place by telling the reader something they can act on.
- Cut everything a user cannot act on, however well the commit argues it: why one design was chosen over another, what alternative was rejected, how the change came about, and edge cases they would not recognise. That reasoning belongs in the commit and the code, not in the release.
- Split and merge by user-visible change, never by commit. One commit describing two unrelated changes becomes two bullets; several commits describing one change become one bullet. Never chain unrelated facts into one sentence with semicolons.
- Preserve any trailing "(#N)" issue reference verbatim on the summary line. When you split a commit that carries one, it goes on the bullet it actually refers to.
- A type with nothing to say gets an empty array, not an invented bullet.`;
}

async function callClaude(token, changes, houseStyle) {
  const payload = changes.map(({ type, description, details, breaking }) => ({ type, description, details, breaking }));
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(houseStyle),
      messages: [{ role: "user", content: `Rewrite these commits into release notes bullets:\n\n${JSON.stringify(payload, null, 2)}` }],
      tools: [NOTES_TOOL],
      tool_choice: { type: "tool", name: "emit_release_notes" },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Messages API failed: ${data.error?.message || response.status}`);
  }
  const toolUse = data.content?.find((block) => block.type === "tool_use" && block.name === "emit_release_notes");
  if (!toolUse) {
    throw new Error("No emit_release_notes tool call in the response.");
  }
  return toolUse.input;
}

function isProse(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function isBulletArray(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (bullet) =>
        bullet &&
        isProse(bullet.summary) &&
        (bullet.details === undefined || (Array.isArray(bullet.details) && bullet.details.every(isProse))),
    )
  );
}

function render(sections, helpWanted, credits, repo) {
  const lines = [];
  for (const [heading, bullets] of sections) {
    if (!bullets.length) continue;
    lines.push(`## ${heading}`);
    for (const bullet of bullets) {
      lines.push(`- ${bullet.summary.trim()}`);
      // Indented so the paragraph(s) stay inside the bullet they explain;
      // a blank line only appears between multiple real paragraphs. Must match
      // the mechanical notes in release_manager.js.
      (bullet.details || []).forEach((paragraph, index) => {
        if (index > 0) lines.push("");
        lines.push(`  ${paragraph.trim()}`);
      });
    }
    lines.push("");
  }
  if (helpWanted) {
    const issueUrl = `https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22`;
    lines.push(`🙋 [${helpWanted} open question${helpWanted === 1 ? "" : "s"} need a real parcel to answer](${issueUrl})`, "");
  }
  if (credits.length) {
    lines.push("## Credits", `- Thanks to ${credits.map((login) => `@${login}`).join(", ")} for testing and reporting.`, "");
  }
  lines.push("---", "", "📦 [See every supported carrier](https://ha-parcel-integrations.github.io/carriers/) — new ones land regularly.", "💛 [Support the project](https://ha-parcel-integrations.github.io/sponsor/)");
  return lines.join("\n");
}

// Renders AI-polished release notes; throws on anything that doesn't look
// trustworthy so the caller can fall back to the mechanical notes instead of
// publishing something malformed or hallucinated.
async function aiReleaseNotes(changes, helpWanted, repo, { github, context, core, suitePath }) {
  const houseStyle = fs.readFileSync(path.join(suitePath, "RELEASE_NOTES.md"), "utf8");
  const [token, credits] = await Promise.all([
    accessToken(core),
    issueAuthors(changes, { github, context, core }),
  ]);
  const result = await callClaude(token, changes, houseStyle);

  if (!isBulletArray(result.new_features) || !isBulletArray(result.bug_fixes)) {
    throw new Error(`Unexpected shape from emit_release_notes: ${JSON.stringify(result)}`);
  }

  // Bullets are split and merged by user-visible change, so a bullet count that
  // differs from the commit count is expected and no longer a signal. What a
  // commit set still cannot yield is more bullets than it holds distinct points
  // — its subject plus each paragraph of its body — so that is the bound, and it
  // still forbids any bullet at all for a type with no commits.
  const distinctPoints = (type) =>
    changes
      .filter((change) => change.type === type)
      .reduce((total, change) => total + 1 + (change.details?.length || 0), 0);
  if (
    result.new_features.length > distinctPoints("feat") ||
    result.bug_fixes.length > distinctPoints("fix")
  ) {
    throw new Error("Model returned more bullets than the source commits hold points; discarding to avoid inventing content.");
  }

  return render(
    [
      ["New features", result.new_features],
      ["Bug fixes", result.bug_fixes],
    ],
    helpWanted,
    credits,
    repo,
  );
}

module.exports = { aiReleaseNotes };
