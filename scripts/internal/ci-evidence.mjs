// Only successful master push runs of our CI at the exact checked-out release SHA qualify.
export async function findCiEvidence(github, repo, sha) {
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...repo,
    workflow_id: 'ci.yml',
    head_sha: sha,
    event: 'push',
    branch: 'master',
    status: 'success',
    per_page: 100,
  });
  const required = ['Quality (Node 24.x)', 'build-and-test (20.x)', 'build-and-test (22.x)'];
  for (const run of runs) {
    if (
      run.head_sha !== sha ||
      run.event !== 'push' ||
      run.head_branch !== 'master' ||
      run.path !== '.github/workflows/ci.yml' ||
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
