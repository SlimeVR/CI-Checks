import "dotenv/config";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import { App, createNodeMiddleware } from "octokit";
import {
	CI_CHECK_NAME,
	LISTENING_REPOS,
	REPO_DEPENDENCY,
	REPO_DEP_PR_REGEX,
} from "./utils.js";

let privateKey: string;
if (process.env.PRIVATE_KEY_FILE) {
	privateKey = (await fs.readFile(process.env.PRIVATE_KEY_FILE, "utf8")).trim();
} else {
	privateKey = process.env.PRIVATE_KEY!;
}

let webhookSecret: string;
if (process.env.WEBHOOK_SECRET_FILE) {
	webhookSecret = (await fs.readFile(process.env.WEBHOOK_SECRET_FILE, "utf8")).trim();
} else {
	webhookSecret = process.env.WEBHOOK_SECRET!;
}

const app = new App({
	appId: process.env.APP_ID!,
	privateKey,
	webhooks: {
		secret: webhookSecret,
	},
	oauth: { clientId: null!, clientSecret: null! },
});

app.webhooks.on("installation.created", async ({ payload }) => {
	console.log(`Installed Github App in ${payload.sender.url}`);
});

app.webhooks.on(
	["pull_request.opened", "pull_request.edited", "pull_request.synchronize"],
	async ({ octokit, payload }) => {
		if (!LISTENING_REPOS.has(payload.repository.name)) {
			console.log(
				`Ignoring ${payload.repository.name} as it's not included in LISTENING_REPOS`,
			);
			return;
		}
		const [owner, repo] = payload.repository.full_name.split("/");
		console.log(
			`Checking commit ${payload.pull_request.head.sha} in ${owner}/${repo}#${payload.pull_request.number} because of ${payload.action}`,
		);

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
						commitSha = file.sha;
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

		if (!fileChanged || !commitSha) {
			return await octokit.rest.repos.createCommitStatus({
				owner,
				repo,
				sha: payload.pull_request.head.sha,
				state: "failure",
				context: CI_CHECK_NAME,
				description: "SolarXR PR found but no change on the submodule.",
			});
		}

		const pullRequest = await octokit.rest.pulls.get({
			owner,
			repo: REPO_DEPENDENCY,
			pull_number: pullRequestSolarXR,
		});

		// If SolarXR PR is merged, check if merge commit sha is the same as submodule
		if (pullRequest.data.merged) {
			if (pullRequest.data.merge_commit_sha === commitSha) {
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
				description: "SolarXR submodule still pointing to PR branch.",
			});
		}

		return await octokit.rest.repos.createCommitStatus({
			owner,
			repo,
			sha: payload.pull_request.head.sha,
			state: "failure",
			context: CI_CHECK_NAME,
			target_url: pullRequest.data.url,
			description: "SolarXR PR still not merged.",
		});
	},
);

// Your app can now receive webhook events at `/api/github/webhooks`
const port = parseInt(process.env.PORT!) || 3000;
console.log(`Initializing server in localhost:${port}`);
const octokitMiddleware = createNodeMiddleware(app);
createServer((req, res) => {
	if (req.method === "GET" && req.url) {
		const url = new URL(req.url, `http://${req.headers.host}`);
		if (url.pathname === "/health") {
			res.writeHead(200);
			res.end("OK");
			return;
		}
	}

	return octokitMiddleware(req, res);
}).listen(port);
