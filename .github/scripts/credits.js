// Two kinds of credit, both for people outside the maintainers:
// - contributors wrote a released commit (a squash-merged outside PR keeps its
//   author on the commit) or opened a pull request a commit references;
// - reporters opened or commented on an issue a commit references. The
//   tester-request issues are opened by a maintainer, so there the real
//   reporters are the commenters.
// Who tested a fix outside GitHub (chat, mail) isn't attributable, so that
// stays a human's call on the release PR.
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

async function collectCredits(changes, { github, context, core }) {
  const contributors = [];
  const reporters = [];
  const add = (list, user, association) => {
    if (earnsCredit(user, association) && !list.includes(user.login)) list.push(user.login);
  };

  for (const change of changes) {
    // A commit author has no association on the compare payload; the
    // permission check below is what filters the maintainer out.
    if (change.author) add(contributors, change.author, "NONE");
  }

  const numbers = [...new Set(changes.flatMap((change) => change.issues || []))];
  for (const number of numbers) {
    const params = { owner: context.repo.owner, repo: context.repo.repo, issue_number: Number(number) };
    try {
      const { data: issue } = await github.rest.issues.get(params);
      add(issue.pull_request ? contributors : reporters, issue.user, issue.author_association);
      const comments = await github.paginate(github.rest.issues.listComments, { ...params, per_page: 100 });
      for (const comment of comments) add(reporters, comment.user, comment.author_association);
    } catch {
      // Deleted or inaccessible issue: no credit to give.
    }
  }

  const cache = new Map();
  const outsiders = async (logins) => {
    const kept = [];
    for (const login of logins) {
      if (!(await isMaintainer(login, { github, context, core }, cache))) kept.push(login);
    }
    return kept;
  };
  const credited = await outsiders(contributors);
  return {
    contributors: credited,
    reporters: (await outsiders(reporters)).filter((login) => !credited.includes(login)),
  };
}

function creditLines({ contributors, reporters }) {
  if (!contributors.length && !reporters.length) return [];
  const mention = (logins) => logins.map((login) => `@${login}`).join(", ");
  const lines = ["## Credits"];
  if (contributors.length) lines.push(`- Thanks to ${mention(contributors)} for contributing.`);
  if (reporters.length) lines.push(`- Thanks to ${mention(reporters)} for testing and reporting.`);
  lines.push("");
  return lines;
}

module.exports = { collectCredits, creditLines };
