import "dotenv/config";
import { createServer } from "node:http";
import { App, createNodeMiddleware } from "octokit";
import { CI_CHECK_NAME, CI_CHECK_TITLE, SOLARXR_PR_REGEX } from "./utils";

const app = new App({
	appId: process.env.APP_ID,
	privateKey: process.env.PRIVATE_KEY,
	webhooks: {
		secret: process.env.WEBHOOK_SECRET,
	},
});

app.webhooks.on("pull_request.opened", ({ octokit, payload }) => {
	if (payload.pull_request.body && SOLARXR_PR_REGEX.test(payload.pull_request.body)) {
		return octokit.rest.checks.create({
			owner: payload.repository.owner,
			repo: payload.repository.name,
			name: CI_CHECK_NAME,
			head_sha: payload.pull_request.head.sha,
			status: "completed",
			conclusion: "success",
			output: {
				title: CI_CHECK_TITLE,
				summary: "SolarXR seems to be merged!"
			}
		});
	}
});

createServer(createNodeMiddleware(app)).listen(3000);
