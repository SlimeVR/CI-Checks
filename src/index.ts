import "dotenv/config";
import { createServer } from "node:http";
import { App, createNodeMiddleware } from "octokit";
import {
	CI_CHECK_NAME,
	CI_CHECK_TITLE,
	LISTENING_REPOS,
	REPO_DEPENDENCY,
	REPO_DEP_PR_REGEX,
} from "./utils.js";

const app = new App({
	appId: process.env.APP_ID!,
	privateKey: process.env.PRIVATE_KEY!,
	webhooks: {
		secret: process.env.WEBHOOK_SECRET!,
	},
});

app.webhooks.on(
	["pull_request.opened", "pull_request.edited", "pull_request.synchronize"],
	async ({ octokit, payload }) => {
		const [owner, repo] = payload.repository.full_name.split("/");
		if (!LISTENING_REPOS.has(repo)) {
			console.log(`Ignoring ${repo} as it's not included in LISTENING_REPOS`);
			return;
		}

		// Check if there is a SolarXR pull request being mentioned
		let pullRequestSolarXR: number | null = null;
		if (payload.pull_request.body) {
			const [, request] = payload.pull_request.body.match(REPO_DEP_PR_REGEX) ?? [
				null,
				null,
			];
			pullRequestSolarXR = request ? parseInt(request) : null;
		}

		// Fetch file data of submodule
		let fileChanged = false;
		let commitSha: string | null = null;
		{
			const iterator = octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
				owner,
				repo,
				pull_number: payload.pull_request.number,
				per_page: 100,
			});

			outerLoop: for await (const { data: files } of iterator) {
				for (const file of files) {
					if (file.filename.toLowerCase() === REPO_DEPENDENCY.toLowerCase()) {
						fileChanged = true;
						commitSha = file.sha
						break outerLoop;
					}
				}
			}
		}

		// If no pull request mentioned, check if SolarXR was changed
		if (!pullRequestSolarXR) {
			if (fileChanged) {
				return await octokit.rest.repos.createCommitStatus({
					owner,
					repo,
					sha: payload.pull_request.head.sha,
					state: "failure",
					context: CI_CHECK_NAME,
					description:
						"Change detected on SolarXR and no PR is being mentioned for it.",
				});
			}
			return await octokit.rest.repos.createCommitStatus({
				owner,
				repo,
				sha: payload.pull_request.head.sha,
				state: "success",
				context: CI_CHECK_NAME,
			});
		}

		if(!fileChanged || !commitSha) {
			return await octokit.rest.repos.createCommitStatus({
				owner,
				repo,
				sha: payload.pull_request.head.sha,
				state: "failure",
				context: CI_CHECK_NAME,
				description: "SolarXR PR found but no change on the submodule."
			});
		}

		const pullRequest = await octokit.rest.pulls.get({
			owner,
			repo: REPO_DEPENDENCY,
			pull_number: pullRequestSolarXR,
		});

		// If SolarXR PR is merged, check if merge commit sha is the same as submodule
		if(pullRequest.data.merged) {
			if(pullRequest.data.merge_commit_sha === commitSha) {
				return await octokit.rest.repos.createCommitStatus({
					owner,
					repo,
					sha: payload.pull_request.head.sha,
					state: "success",
					context: CI_CHECK_NAME,
				});
			}
			return await octokit.rest.repos.createCommitStatus({
				owner,
				repo,
				sha: payload.pull_request.head.sha,
				state: "failure",
				context: CI_CHECK_NAME,
				description: "SolarXR submodule still pointing to PR branch."
			});
		}

		return await octokit.rest.repos.createCommitStatus({
			owner,
			repo,
			sha: payload.pull_request.head.sha,
			state: "failure",
			context: CI_CHECK_NAME,
			description: "SolarXR PR still not merged."
		});
	},
);

createServer(createNodeMiddleware(app)).listen(3000);
