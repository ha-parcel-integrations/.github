const fs = require("fs");
const path = require("path");

const ISSUE_REF = /\(#(\d+)\)/;
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

// Only the reporter earns a credit; who tested a fix lives in PR/issue
// comments and isn't reliably attributable, so that stays a human's call.
async function issueAuthors(changes, github, context) {
  const numbers = [...new Set(changes.map((change) => ISSUE_REF.exec(change.description)?.[1]).filter(Boolean))];
  const logins = [];
  for (const number of numbers) {
    try {
      const { data: issue } = await github.rest.issues.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: Number(number),
      });
      if (!issue.pull_request && issue.user?.login && !logins.includes(issue.user.login)) {
        logins.push(issue.user.login);
      }
    } catch {
      // Deleted or inaccessible issue: no credit to give.
    }
  }
  return logins;
}

const NOTES_TOOL = {
  name: "emit_release_notes",
  description: "Emit polished, user-facing release notes bullets for a Home Assistant integration release.",
  input_schema: {
    type: "object",
    properties: {
      new_features: {
        type: "array",
        items: { type: "string" },
        description: "One bullet per feat: change, as a single flowing sentence (no leading dash, no embedded line breaks).",
      },
      bug_fixes: {
        type: "array",
        items: { type: "string" },
        description: "One bullet per fix: change, same rules as new_features.",
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
- Merge multiple commits that describe the same user-visible change into one bullet rather than listing them separately.
- Each bullet is one flowing sentence, no embedded line breaks, no markdown list syntax (the caller adds the "- ").
- Preserve any trailing "(#N)" issue reference verbatim.
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

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim());
}

function render(sections, helpWanted, credits, repo) {
  const lines = [];
  for (const [heading, bullets] of sections) {
    if (!bullets.length) continue;
    lines.push(`## ${heading}`);
    for (const bullet of bullets) lines.push(`- ${bullet}`);
    lines.push("");
  }
  if (helpWanted) {
    const issueUrl = `https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22`;
    lines.push(`🙋 [${helpWanted} open question${helpWanted === 1 ? "" : "s"} need a real parcel to answer](${issueUrl})`, "");
  }
  if (credits.length) {
    lines.push("## Credits", `- Thanks to ${credits.map((login) => `@${login}`).join(", ")} for reporting.`, "");
  }
  lines.push("---", "", "📦 [See every supported carrier](https://ha-parcel-integrations.github.io/carriers/) — new ones land regularly.", "💛 [Support the project](https://ha-parcel-integrations.github.io/sponsor/)");
  return lines.join("\n");
}

// Renders AI-polished release notes; throws on anything that doesn't look
// trustworthy so the caller can fall back to the mechanical notes instead of
// publishing something malformed or hallucinated.
async function aiReleaseNotes(changes, helpWanted, repo, { github, context, core, suitePath }) {
  const houseStyle = fs.readFileSync(path.join(suitePath, "RELEASE_NOTES.md"), "utf8");
  const [token, credits] = await Promise.all([accessToken(core), issueAuthors(changes, github, context)]);
  const result = await callClaude(token, changes, houseStyle);

  if (!isStringArray(result.new_features) || !isStringArray(result.bug_fixes)) {
    throw new Error(`Unexpected shape from emit_release_notes: ${JSON.stringify(result)}`);
  }

  const expectedFeat = changes.filter((change) => change.type === "feat").length;
  const expectedFix = changes.filter((change) => change.type === "fix").length;
  // Bullets may be merged, never invented: more bullets than source commits
  // of that type means the model added something that wasn't there.
  if (result.new_features.length > expectedFeat || result.bug_fixes.length > expectedFix) {
    throw new Error("Model returned more bullets than source commits; discarding to avoid inventing content.");
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
