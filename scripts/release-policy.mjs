export function assertVersionBump(next, previous) {
  const parse = value => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error("Release versions must be numeric major.minor.patch");
    return value.split(".").map(BigInt);
  };
  const n = parse(next), p = parse(previous);
  for (let i = 0; i < 3; i++) {
    if (n[i] > p[i]) return;
    if (n[i] < p[i]) break;
  }
  throw new Error(`Release ${next} must be greater than ${previous}`);
}

export function releaseMessage(version, description) {
  if (typeof description !== "string" || description.trim().length < 10) throw new Error("A meaningful release change description is required");
  const message = `v${version}: ${description.trim()}`;
  if (message.length > 120 || /[\r\n]/.test(message)) throw new Error("Release description must fit one deployment message of at most 120 characters");
  return message;
}

export function assertCiDeployment(env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "haroldolivieri/pomona" ||
      env.GITHUB_REF !== "refs/heads/main" ||
      !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error("Production deployments must run through the GitHub Actions workflow on main");
  }
}
