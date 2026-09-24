let input = "";

for await (const chunk of process.stdin) {
  input += chunk;
}

const submissions = JSON.parse(input);
const buildNumberIndex = process.argv.indexOf("--build-number");
const expectedBuildNumber =
  buildNumberIndex >= 0 ? process.argv[buildNumberIndex + 1] : undefined;
const latest = expectedBuildNumber
  ? submissions.find(
      (submission) =>
        String(submission?.submittedBuild?.appBuildVersion) ===
        String(expectedBuildNumber),
    )
  : submissions?.[0];

if (!latest) {
  throw new Error(
    expectedBuildNumber
      ? `Android submission for build ${expectedBuildNumber} was not returned by EAS.`
      : "Android submission status was not returned by EAS.",
  );
}

const failures = [];

if (latest.status !== "FINISHED") {
  failures.push(`status=${latest.status ?? "missing"}`);
}

if (latest.androidConfig?.track !== "internal") {
  failures.push(`track=${latest.androidConfig?.track ?? "missing"}`);
}

if (latest.androidConfig?.releaseStatus !== "COMPLETED") {
  failures.push(
    `releaseStatus=${latest.androidConfig?.releaseStatus ?? "missing"}`,
  );
}

if (failures.length > 0) {
  throw new Error(
    `Latest Android submission is not available on the internal track: ${failures.join(", ")}`,
  );
}

console.log(
  `Verified Android ${latest.submittedBuild?.appVersion ?? "unknown"} (${latest.submittedBuild?.appBuildVersion ?? "unknown"}): track=${latest.androidConfig.track}, releaseStatus=${latest.androidConfig.releaseStatus}.`,
);
