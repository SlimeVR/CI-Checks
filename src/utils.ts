export const OWNER = "SlimeVR";
export const REPO_DEPENDENCY = "SolarXR-Protocol";
export const REPO_DEP_PR_REGEX = new RegExp(
	`(?:https:\\/\\/github\\.com\\/)?${OWNER}\\/${REPO_DEPENDENCY}(?:\\/pull\\/|#)(\\d+)`,
	"i",
);
export const CI_CHECK_NAME = "SlimeVR Checks / validate SolarXR submodule";
export const LISTENING_REPOS = new Set(["SlimeVR-Server"]);
