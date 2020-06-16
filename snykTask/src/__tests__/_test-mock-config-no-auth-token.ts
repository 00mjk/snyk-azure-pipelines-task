import * as ma from "azure-pipelines-task-lib/mock-answer";
import * as tmrm from "azure-pipelines-task-lib/mock-run";
import * as path from "path";

const taskPath = path.join(__dirname, "..", "index.js");
const tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tmr.setInput("stepDisplayName", "some stepDisplayName");
tmr.setInput("projectName", "some-projectName");
tmr.setInput("testDirectory", "some/dir");
tmr.setInput("organization", "some-snyk-org");
tmr.setInput("severityThreshold", "");
tmr.setInput("failOnIssues", "true");
tmr.setInput("monitorOnBuild", "true");
tmr.setInput("additionalArguments", "--someAdditionalArgs");
tmr.setInput("isTest", "true");
tmr.setInput("testType", "app");

const answers: ma.TaskLibAnswers = {
  which: {
    ls: "/bin/ls",
    npm: "/usr/bin/npm",
    snyk: "/usr/bin/snyk",
    sudo: "/usr/bin/sudo"
  },
  exec: {
    "/bin/ls -la": {
      code: 0,
      stdout: "(directory listing for `ls -la)"
    },
    "/bin/ls": {
      code: 0,
      stdout: "(directory listing)"
    },
    "/usr/bin/npm install -g snyk snyk-to-html": {
      code: 0,
      stdout: "Ok"
    },
    "/usr/bin/sudo npm install -g snyk snyk-to-html": {
      code: 0,
      stdout: "Ok"
    },
    "/usr/bin/snyk auth": {
      code: 0,
      stdout: "Snyk CLI authorized!"
    },
    "/usr/bin/sudo snyk auth": {
      code: 0,
      stdout: "Snyk CLI authorized!"
    },
    "/usr/bin/sudo snyk test --someAdditionalArgs --json": {
      code: 0,
      stdout: "No issues found"
    },
    "/usr/bin/sudo snyk-to-html -i report.json": {
      code: 0,
      stdout: "No issues found"
    },
    "/usr/bin/sudo snyk monitor --org=some-snyk-org --project-name=some-projectName --someAdditionalArgs": {
      code: 0,
      stdout: "No issues found"
    }
  }
};

tmr.setAnswers(answers);

tmr.run();
