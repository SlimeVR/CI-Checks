export const OWNER = "ImUrX";
export const REPO_DEPENDENCY = "SolarXR-Protocol";
export const REPO_DEP_PR_REGEX = new RegExp(
	`(?:https:\\/\\/github\\.com\\/)?ImUrX\\/SolarXR-Protocol(?:\\/pull\\/|#)(\\d+)`,
	"i",
);
export const CI_CHECK_NAME = "SlimeVR Checks / validate SolarXR submodule";
export const LISTENING_REPOS = new Set(["SlimeVR-Server"]);
