let input = "";

for await (const chunk of process.stdin) {
  input += chunk;
}

const status = JSON.parse(input);
const buildNumberIndex = process.argv.indexOf("--build-number");
const expectedBuildNumber =
  buildNumberIndex >= 0 ? process.argv[buildNumberIndex + 1] : undefined;
const builds = status?.ios?.testFlightBuilds ?? [];
const latestBuild = expectedBuildNumber
  ? builds.find(
      (build) => String(build?.buildNumber) === String(expectedBuildNumber),
    )
  : builds[0];
const requireExternal = process.argv.includes("--require-external");

if (!latestBuild) {
  throw new Error(
    expectedBuildNumber
      ? `TestFlight build ${expectedBuildNumber} was not returned by EAS.`
      : "TestFlight build status was not returned by EAS.",
  );
}

const failures = [];

if (latestBuild.processingState !== "VALID") {
  failures.push(`processingState=${latestBuild.processingState ?? "missing"}`);
}

if (latestBuild.internalState !== "IN_BETA_TESTING") {
  failures.push(`internalState=${latestBuild.internalState ?? "missing"}`);
}

if (requireExternal && latestBuild.externalState !== "IN_BETA_TESTING") {
  failures.push(`externalState=${latestBuild.externalState ?? "missing"}`);
}

if (failures.length > 0) {
  throw new Error(
    `Latest TestFlight build ${latestBuild.appVersion} (${latestBuild.buildNumber}) is not available to all required tester groups: ${failures.join(", ")}`,
  );
}

console.log(
  `Verified TestFlight ${latestBuild.appVersion} (${latestBuild.buildNumber}): processingState=${latestBuild.processingState}, internalState=${latestBuild.internalState}, externalState=${latestBuild.externalState}.`,
);
