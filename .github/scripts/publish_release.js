const VERSION_IN_SUBJECT = /^Bump version to (\d+\.\d+\.\d+)$/;
const RELEASE_BRANCH = "automation/release";

module.exports = async ({ github, context, core }) => {
  const sha = process.env.HEAD_SHA || context.sha;
  const { data: commit } = await github.rest.repos.getCommit({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: sha,
  });
  const match = VERSION_IN_SUBJECT.exec(commit.commit.message.split("\n", 1)[0]);
  if (!match) {
    core.notice("The validated main commit is not a release bump.");
    return;
  }
  const version = match[1];

  // Provenance is the merged automation/release branch rather than a marker in
  // the body, so the maintainer can rewrite the notes before merging.
  const { data: pullRequests } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
    owner: context.repo.owner,
    repo: context.repo.repo,
    commit_sha: sha,
  });
  const releasePr = pullRequests.find((pr) => pr.merged_at && pr.head.ref === RELEASE_BRANCH);
  if (!releasePr) {
    core.notice(`No merged ${RELEASE_BRANCH} PR is associated with this commit; nothing to publish.`);
    return;
  }

  const { data: file } = await github.rest.repos.getContent({
    owner: context.repo.owner,
    repo: context.repo.repo,
    path: process.env.MANIFEST_PATH,
    ref: sha,
  });
  const manifest = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  if (manifest.version !== version) {
    throw new Error(`Manifest is at ${manifest.version} but the bump commit claims ${version}.`);
  }

  try {
    await github.rest.git.getRef({ owner: context.repo.owner, repo: context.repo.repo, ref: `tags/${version}` });
    core.notice(`Tag ${version} already exists; nothing to publish.`);
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await github.rest.git.createRef({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: `refs/tags/${version}`,
    sha,
  });
  const { data: release } = await github.rest.repos.createRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    tag_name: version,
    target_commitish: sha,
    name: version,
    body: (releasePr.body || "").trim(),
  });
  core.notice(`Published ${version}: ${release.html_url}`);
};
