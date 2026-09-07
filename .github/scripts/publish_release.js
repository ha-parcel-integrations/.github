// GitHub appends " (#N)" to a squash subject depending on the repository's
// merge settings, so accept it either way.
const VERSION_IN_SUBJECT = /^Bump version to (\d+\.\d+\.\d+)(?: \(#\d+\))?$/;
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

  // The release, not the tag, is what decides whether there is work left: a run
  // that died between the two would otherwise leave the draft unpublished
  // forever. Drafts carry no tag, so they only show up in the full listing.
  const releases = await github.paginate(github.rest.repos.listReleases, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    per_page: 100,
  });
  let release = releases.find((candidate) => candidate.tag_name === version);
  if (release && !release.draft) {
    core.notice(`Release ${version} already exists; nothing to publish.`);
    return;
  }

  try {
    await github.rest.git.getRef({ owner: context.repo.owner, repo: context.repo.repo, ref: `tags/${version}` });
  } catch (error) {
    if (error.status !== 404) throw error;
    await github.rest.git.createRef({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: `refs/tags/${version}`,
      sha,
    });
  }

  // Released as a draft first: HACS downloads the archive by asset name, so a
  // release must never be visible without one attached.
  if (!release) {
    ({ data: release } = await github.rest.repos.createRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag_name: version,
      target_commitish: sha,
      name: version,
      body: (releasePr.body || "").trim(),
      draft: true,
    }));
  }

  const zipName = require("node:path").basename(process.env.ZIP_PATH);
  const stale = (release.assets || []).find((asset) => asset.name === zipName);
  if (stale) {
    await github.rest.repos.deleteReleaseAsset({
      owner: context.repo.owner,
      repo: context.repo.repo,
      asset_id: stale.id,
    });
  }
  const zip = require("node:fs").readFileSync(process.env.ZIP_PATH);
  await github.rest.repos.uploadReleaseAsset({
    owner: context.repo.owner,
    repo: context.repo.repo,
    release_id: release.id,
    name: zipName,
    data: zip,
    headers: { "content-type": "application/zip", "content-length": zip.length },
  });
  const { data: published } = await github.rest.repos.updateRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    release_id: release.id,
    draft: false,
  });
  core.notice(`Published ${version}: ${published.html_url}`);
};
