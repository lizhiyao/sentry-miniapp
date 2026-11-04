export const releaseWorkflows = {
  ci: {
    workflow: 'ci.yml',
    jobs: ['Quality (Node 24.x)', 'build-and-test (20.x)', 'build-and-test (22.x)'],
  },
  frameworks: {
    workflow: 'framework-examples.yml',
    jobs: ['Build Taro example', 'Build uni-app example'],
  },
};
// Only successful master push runs at the exact release SHA qualify.
export async function findCiEvidence(github, repo, sha, group = 'ci') {
  const { workflow, jobs: required } = releaseWorkflows[group];
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...repo,
    workflow_id: workflow,
    head_sha: sha,
    event: 'push',
    branch: 'master',
    status: 'success',
    per_page: 100,
  });
  for (const run of runs) {
    if (
      run.head_sha !== sha ||
      run.event !== 'push' ||
      run.head_branch !== 'master' ||
      run.path !== `.github/workflows/${workflow}` ||
      !Number.isSafeInteger(run.run_attempt) ||
      run.run_attempt < 1 ||
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      run.head_repository?.full_name !== `${repo.owner}/${repo.repo}`
    )
      continue;
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
      ...repo,
      run_id: run.id,
      attempt_number: run.run_attempt,
      per_page: 100,
    });
    if (
      required.every((name) =>
        jobs.some(
          (job) =>
            job.name === name &&
            job.head_sha === sha &&
            job.status === 'completed' &&
            job.conclusion === 'success',
        ),
      )
    ) {
      return { sha, runId: run.id, attempt: run.run_attempt, url: run.html_url, jobs: required };
    }
  }
  return null;
}

/** A query failure in one group cannot suppress the other group's fallback. */
export async function findReleaseEvidence(github, repo, sha) {
  return Object.fromEntries(
    await Promise.all(
      Object.keys(releaseWorkflows).map(async (group) => {
        try {
          const evidence = await findCiEvidence(github, repo, sha, group);
          return [
            group,
            {
              reused: Boolean(evidence),
              evidence,
              ...(!evidence && {
                reason: 'No complete successful master push evidence at release SHA',
              }),
            },
          ];
        } catch (error) {
          return [
            group,
            { reused: false, evidence: null, reason: `Evidence query failed: ${error.message}` },
          ];
        }
      }),
    ),
  );
}
