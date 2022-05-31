# GitHub Actions: sharing your secrets with third-party actions

<!-- markdownlint-disable-next-line MD013 -->
[![Default Organization Configuration](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/default-config.yml/badge.svg)](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/default-config.yml) [![Disable GITHUB_TOKEN](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/disable-github-token.yml/badge.svg)](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/disable-github-token.yml) [![Environment secret](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/environment-secret.yml/badge.svg)](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/environment-secret.yml) [![MegaLinter](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/mega-linter.yml/badge.svg)](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/mega-linter.yml) [![Print GitHub Context](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/print-github-context.yml/badge.svg)](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/print-github-context.yml) [![Print env vars in docker](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/test-env-action.yml/badge.svg)](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/test-env-action.yml)

- [Setup the workflow with the minimum permissions](#setup-the-workflow-with-the-minimum-permissions)
  - [Solution 1: Using CODEOWNERS configuration](#solution-1-using-codeowners-configuration)
  - [Solution 2: Using branch protection rules and environment secrets](#solution-2-using-branch-protection-rules-and-environment-secrets)
  - [Solution 3: Use a different repository to run MegaLinter](#solution-3-use-a-different-repository-to-run-megalinter)
  - [Conclusion](#conclusion)
- [How GitHub Actions can get access to secrets](#how-github-actions-can-get-access-to-secrets)
- [Other questions](#other-questions)
- [Links](#links)
- [Hot to contribute](#how-to-contribute)

We are using [MegaLinter](https://github.com/megalinter/megalinter) in most of our projects. It is a very useful GitHub Action to check your code, not only for basic things like the code format, but it also has some packages to detect security problems. But we have been wondering if the MegaLinter itself could be a security problem. This is the default workflow configuration when you install it:

```yml
- name: MegaLinter
    id: ml
    uses: megalinter/megalinter/flavors/documentation@v5
    env:
        VALIDATE_ALL_CODEBASE: true
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

That means you are passing the `GITHUB_TOKEN` as an environment variable. MegaLinter is a docker action and it is called this way on the GitHub runners:

```s
/usr/bin/docker run --name megalintermegalinterdocumentationv5_b424a0 --label 08450d --workdir /github/workspace --rm -e VALIDATE_ALL_CODEBASE -e GITHUB_TOKEN -e HOME -e GITHUB_JOB -e GITHUB_REF -e GITHUB_SHA -e GITHUB_REPOSITORY -e GITHUB_REPOSITORY_OWNER -e GITHUB_RUN_ID -e GITHUB_RUN_NUMBER -e GITHUB_RETENTION_DAYS -e GITHUB_RUN_ATTEMPT -e GITHUB_ACTOR -e GITHUB_WORKFLOW -e GITHUB_HEAD_REF -e GITHUB_BASE_REF -e GITHUB_EVENT_NAME -e GITHUB_SERVER_URL -e GITHUB_API_URL -e GITHUB_GRAPHQL_URL -e GITHUB_REF_NAME -e GITHUB_REF_PROTECTED -e GITHUB_REF_TYPE -e GITHUB_WORKSPACE -e GITHUB_ACTION -e GITHUB_EVENT_PATH -e GITHUB_ACTION_REPOSITORY -e GITHUB_ACTION_REF -e GITHUB_PATH -e GITHUB_ENV -e GITHUB_STEP_SUMMARY -e RUNNER_OS -e RUNNER_ARCH -e RUNNER_NAME -e RUNNER_TOOL_CACHE -e RUNNER_TEMP -e RUNNER_WORKSPACE -e ACTIONS_RUNTIME_URL -e ACTIONS_RUNTIME_TOKEN -e ACTIONS_CACHE_URL -e GITHUB_ACTIONS=true -e CI=true -v "/var/run/docker.sock":"/var/run/docker.sock" -v "/home/runner/work/_temp/_github_home":"/github/home" -v "/home/runner/work/_temp/_github_workflow":"/github/workflow" -v "/home/runner/work/_temp/_runner_file_commands":"/github/file_commands" -v "/home/runner/work/github-actions-secrets/github-actions-secrets":"/github/workspace" megalinter/megalinter-documentation:v5  "-v" "/var/run/docker.sock:/var/run/docker.sock:rw"
```

You can check it on any of the [workflow executions](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/mega-linter.yml) in this repo.

As you can see there is an environment variable `-e GITHUB_TOKEN`. MegaLinter has 97 packages at the moment. That means there are a lot of dependencies that have access to the `GITHUB_TOKEN`.

**But, what could MegaLinter and its dependencies do with that token?**

Currently, the [default permissions for all workflows](https://github.blog/changelog/2021-04-20-github-actions-control-permissions-for-github_token/) in any organization are:

```yml
permissions:
  actions: read|write
  checks: read|write
  contents: read|write
  deployments: read|write
  issues: read|write
  packages: read|write
  pull-requests: read|write
  repository-projects: read|write
  security-events: read|write
  statuses: read|write
```

If you do not overwrite those permissions for the MegaLinter workflow, the MegalInter will have full write access to the API when the workflow is executed by a maintainer in a local branch. For forked repositories, GitHub automatically changes the [permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token) of the `GITHUB_TOKEN` to only "read". But you still have read access to all the data. In most cases, you probably do not need it.

So with that default configuration, any of the MegaLinter packages could use the token to create a new branch, create or modify a new workflow and export all your secrets.

**Could the action export the secrets without modifying a workflow?**

You might think that MegaLinter could release a new minor version of their package with malicious code. They could update one of the embedded packages in the docker image and that package could contain malicious code to obtain secrets or the `GITHUB_TOKEN` from the environment. Since you normally use a major version for the action `megalinter/megalinter/flavors/documentation@v5` that could happen. But actions cannot obtain the secrets (including `GITHUB_TOKEN`) if you do not pass them explicitly. See the section [How GitHub Actions can get access to secrets](#how-github-actions-can-get-access-to-secrets) below to understand the different ways in which an action can get access to secrets.

## Setup the workflow with the minimum permissions

According to the [Principle of least privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege), we should grant MegaLinter only the permissions it needs. Depending on whether you want MegalInter to create comments on your PRs or auto-fix things you might need to give extra permissions to it.

There are some courses and articles explaining how to implement secure workflows with GitHub Actions. See the [links](#links) below.

What we have done is:

1. Change the default token permissions for the organization. You can [change the default permissions](https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization#configuring-the-default-github_token-permissions) granted to the `GITHUB_TOKEN` to read-only.

2. Remove all permissions on the workflow for the token. You can do it by adding the following to the `.github/workflows/mega-linter.yml` file: `permissions: {}`.

3. Depending on what you want the MegaLinter to do you will need to grant some specific permissions. For example `pull-requests: write` if you want it to write comments on pull requests or `contents: write` if you want it to auto-fix your code and push the changes.

> NOTICE: you do not even need to give `contents: read` permission to the `GITHUB_TOKEN` in order to checkout the code if the repo is a public repo.

In this example repository, we neither wanted to write comments on pull requests nor push new commits so we do not need to pass the `GITHUB_TOKEN` to the MegaLinter action.

But, what happens if you want to give MegaLinter `contents: write` permission? is there a way to avoid giving access to those 97 packages to your secrets?

### Solution 1: Using CODEOWNERS configuration

One of the solutions we thought of was using the [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) configuration.

If actions can only get secrets from arguments and we are only passing the `GITHUB_TOKEN` to the action, the only way to get the secrets is by modifying a workflow to export the secrets. The CODEOWNERS file allows the repo admins to specify who should review changes on certain files. You could configure a team that has access to the `.\github\workflows` directory but this would not work because:

- CODEOWNERS only works on pull requests. And in that case, `contents: write` permission is not granted.
- We are talking about branches created on the same repo by developers who already have write access. Even if the file requires a review by the user, the user is allowed to modify and review those files.

So there is no option to limit the write access to the workflow files.

### Solution 2: Using branch protection rules and environment secrets

You can avoid using repository secrets. If all your secrets are [environment secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-an-environment) the MegaLinter action would not have access to the secrets. Only the jobs linked to the environments could have access to those secrets.

We think this is a good practice anyway because normally secrets are related to one environment. But in some cases, having a repository secret makes sense, so this solution is not possible always.

### Solution 3: Use a different repository to run MegaLinter

If you want to run the MegaLinter, for example, on every push to the `main` branch, you could create a MegaLinter repository that has a workflow that runs MegaLinter for a different repo. It would be a kind of MegaLinter worker.

Although it might work, it does not seem to be an easy solution, both to implement and use.

Besides, the problem was we wanted to give MegaLinter write permissions to auto-fix and push errors and in this case, we still would need write access to the remote origin repo.

### Conclusion

There is no way to give MegaLinter write permission without trusting its 97 packages to not steal your secrets. Either you disable write permissions and fix things manually or you stick to a concrete docker image (hash) and you review carefully all the package updates.

You might argue that that's the same problem you have when you trust all your node dependencies. For example, you might be using some development dependencies on your tests. If you run tests when a developer pushes a new commit to the `main` branch, you are giving those dependencies access to those secrets. Maybe that's another example of things you could be doing wrongly.

In general, we found the environment secrets solution to be the best solution. You should only use organization or repository secrets for secrets that could be potentially captured by third-party development tools. And use those secrets with your custom actions, actions you completely trust or actions you review.

If you have an alternative solution, please do not hesitate to [open a new discussion](https://github.com/Nautilus-Cyberneering/github-actions-secrets/discussions) on this repo.

## How GitHub Actions can get access to secrets

GitHub Actions has [contexts](https://docs.github.com/en/actions/learn-github-actions/contexts). Contexts are data structures where GitHub stores the information needed by workflows. There is one special context called [secrets context](https://docs.github.com/en/actions/learn-github-actions/contexts#secrets-context).

That context contains your secrets and a special secret called `GITHUB_TOKEN` automatically added by GitHub. The permissions of the `GITHUB_TOKEN` depend on your organization's default configuration for the token and the event that triggered the workflow.

**How can actions get access to secrets?**

1. [Inputs in the step](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepswith).
2. [Arguments in the step](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepswithargs). Only for docker actions.
3. [Environment variables](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepsenv).

According to GitHub documentation, an action could have access to the `GITHUB_TOKEN` even if you do not explicitly pass the token in one of the previous ways.

> Important: An action can access the GITHUB_TOKEN through the github.token context even if the workflow does not explicitly pass the GITHUB_TOKEN to the action. As a good security practice, you should always make sure that actions only have the minimum access they require by limiting the permissions granted to the GITHUB_TOKEN. For more information, see "Permissions for the GITHUB_TOKEN."

You can read that message [here](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow).

As far as we know that's only possible because the action can also get a secret from its action.yml configuration file.

For example, in the GitHub [actions/checkout@v2](https://github.com/actions/checkout) action you can pass the token as an input, but if you do not pass it the actions will take it as a default value. You can see how the [default value is taken from the context](https://github.com/actions/checkout/blob/2541b1294d2704b0964813337f33b291d3f8596b/action.yml#L24).

It is something not well documented in the documentation. You can use contexts not only in the workflow `yml` files but also in the `action.yml` files.

You do not have access to all contexts in all places. See [this table](https://docs.github.com/en/actions/learn-github-actions/contexts#context-availability) to know what contexts are available and when.

In this repo, you can see how an embedded action does not have access to the secrets.

- [The embedded docker action](./.github/actions/env/).
- [The workflow using the action](./.github/workflows/test-env-action.yml).
- [The output of the action](https://github.com/Nautilus-Cyberneering/github-actions-secrets/actions/workflows/test-env-action.yml).

The action only prints the environment variables inside the container. This is the output:

```s
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOSTNAME=ae6e9d0aeb16
GITHUB_GRAPHQL_URL=https://api.github.com/graphql
GITHUB_REF_NAME=main
GITHUB_REF_PROTECTED=false
GITHUB_STEP_SUMMARY=/github/file_commands/step_summary_9f775e7c-222f-474c-af92-9e61206d7ce4
GITHUB_BASE_REF=
GITHUB_SERVER_URL=https://github.com
GITHUB_API_URL=https://api.github.com
GITHUB_ACTION_REPOSITORY=
RUNNER_ARCH=X64
RUNNER_WORKSPACE=/home/runner/work/github-actions-secrets
GITHUB_ACTIONS=true
GITHUB_JOB=print-env-vars
GITHUB_REF=refs/heads/main
GITHUB_ACTOR=josecelano
GITHUB_ACTION=__self
GITHUB_REPOSITORY_OWNER=Nautilus-Cyberneering
GITHUB_HEAD_REF=
GITHUB_WORKSPACE=/github/workspace
GITHUB_PATH=/github/file_commands/add_path_9f775e7c-222f-474c-af92-9e61206d7ce4
RUNNER_OS=Linux
RUNNER_TEMP=/home/runner/work/_temp
GITHUB_REPOSITORY=Nautilus-Cyberneering/github-actions-secrets
GITHUB_ACTION_REF=
GITHUB_ENV=/github/file_commands/set_env_9f775e7c-222f-474c-af92-9e61206d7ce4
RUNNER_TOOL_CACHE=/opt/hostedtoolcache
ACTIONS_RUNTIME_URL=https://pipelines.actions.githubusercontent.com/J2bBGbKRuIqd1wfytSShy42Isw56QMlCsoBc38NVOsni9X2pHC/
CI=true
HOME=/github/home
GITHUB_SHA=87de66d88ac9362ee029a768589d808f4fdad0a2
GITHUB_RUN_ID=2397754211
GITHUB_RUN_NUMBER=9
GITHUB_RUN_ATTEMPT=1
GITHUB_WORKFLOW=Print env vars in docker
ACTIONS_RUNTIME_TOKEN=***
GITHUB_EVENT_NAME=push
GITHUB_REF_TYPE=branch
GITHUB_EVENT_PATH=/github/workflow/event.json
RUNNER_NAME=Hosted Agent
GITHUB_RETENTION_DAYS=90
ACTIONS_CACHE_URL=https://artifactcache.actions.githubusercontent.com/J2bBGbKRuIqd1wfytSShy42Isw56QMlCsoBc38NVOsni9X2pHC/
```

We also want to add a standard embedded Javascript action to print the environment variables that it has access to.

Given that actions do not have direct access to secrets, the only way to give access to them is by explicitly passing them. But you have to be careful because there could ways to do that without you knowing it. You can read [here](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#accessing-secrets) different ways to accidentally pass secrets to actions.

For example, if you define an environment variable at the workflow level like this:

```s
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

All the actions in your workflow will have access to the token.

## Other questions

**Is there a way to completely disable the GITHUB_TOKEN in a workflow?**

No, there is not.

**Is there a way to completely disable access to secrets in a workflow?**

As you can see in this [workflow example](./.github/workflows/disable-github-token.yml), even if you disable the permissions for the `GITHUB_TOKEN` you are still able to get the secrets because you get them from the context not using the `GITHUB_TOKEN`.

**Are contexts stored on disk in the GitHub runners?**

As far as we know, they are not. But something we miss from the documentation it's a better explanation of the lifecycle of the runners and how it is the communication between GitHub and runners. We assume that the context for jobs is used only at the Github's servers. The secrets are shared with the runner only before executing a job and they are not stored on the disk.

The documentation says the secrets are deleted from memory when the job is done.

> Although GitHub Actions scrubs secrets from memory that are not referenced in the workflow (or an included action), the GITHUB_TOKEN and any referenced secrets can be harvested by a determined attacker.

See [accessing secrets](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#accessing-secrets).

## Links

- [GitHub Course - Securing your workflows](https://lab.github.com/githubtraining/securing-your-workflows).
- [Accessing GH context in actions](https://github.community/t/accessing-gh-context-in-actions/206203).

## How to contribute

Security is a complex topic. GitHub Actions have a lot of features and extensive documentation but sometimes it is hard to put together all the things.
Handling secrets in a safe way is a challenge. If you want to improve or fix this article, please do not hesitate to open an issue or discussion.
