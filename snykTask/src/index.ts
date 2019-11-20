import * as tl from "azure-pipelines-task-lib/task";
import * as tr from "azure-pipelines-task-lib/toolrunner";
import { TaskArgs, getAuthToken } from "./task-args";

class SnykError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const CLI_EXIT_CODE_SUCCESS = 0;
const CLI_EXIT_CODE_ISSUES_FOUND = 1;
const CLI_EXIT_CODE_INVALID_USE = 2;
const SNYK_MONITOR_EXIT_CODE_SUCCESS = 0;
const SNYK_MONITOR_EXIT_INVALID_FILE_OR_IMAGE = 2;

const isDebugMode = () => {
  const taskDebug = true;
  // taskDebug = tl.getBoolInput("debug-task", false);

  return taskDebug;
};

function buildToolRunner(tool: string, requiresSudo: boolean): tr.ToolRunner {
  const toolPath = requiresSudo ? tl.which("sudo") : tl.which(tool);
  let toolRunner = tl.tool(toolPath);

  if (requiresSudo) toolRunner = toolRunner.arg(tool);
  if (isDebugMode()) console.log(`toolPath: ${toolPath}`);

  return toolRunner;
}

function parseInputArgs(): TaskArgs {
  const taskArgs: TaskArgs = new TaskArgs();
  taskArgs.targetFile = tl.getInput("targetFile", false);
  taskArgs.dockerImageName = tl.getInput("dockerImageName", false);
  taskArgs.dockerfilePath = tl.getInput("dockerfilePath", false);
  taskArgs.projectName = tl.getInput("projectName", false);
  taskArgs.organization = tl.getInput("organization", false);
  taskArgs.monitorOnBuild = tl.getBoolInput("monitorOnBuild", true);
  taskArgs.failOnIssues = tl.getBoolInput("failOnIssues", true);
  taskArgs.additionalArguments = tl.getInput("additionalArguments", false);
  taskArgs.testDirectory = tl.getInput("testDirectory", false);
  taskArgs.severityThreshold = tl.getInput("severityThreshold", false);
  if (taskArgs.severityThreshold) {
    taskArgs.severityThreshold = taskArgs.severityThreshold.toLowerCase();
    if (isNotValidThreshold(taskArgs.severityThreshold)) {
      const errorMsg =
        "If set, severity threshold must be 'high' or 'medium' or 'low' (case insensitive). If not set, the default is 'low'.";
      throw new Error(errorMsg);
    }
  }

  if (isDebugMode()) {
    logAllTaskArgs(taskArgs);
  }

  return taskArgs;
}

const isNotValidThreshold = (threshold: string) => {
  const severityThresholdLowerCase = threshold.toLowerCase();

  return (
    severityThresholdLowerCase !== "high" &&
    severityThresholdLowerCase !== "medium" &&
    severityThresholdLowerCase !== "low"
  );
};

const logAllTaskArgs = (taskArgs: TaskArgs) => {
  console.log(`taskArgs.targetFile: ${taskArgs.targetFile}`);
  console.log(`taskArgs.dockerImageName: ${taskArgs.dockerImageName}`);
  console.log(`taskArgs.dockerfilePath: ${taskArgs.dockerfilePath}`);
  console.log(`taskArgs.severityThreshold: ${taskArgs.severityThreshold}`);
  console.log(`taskArgs.projectName: ${taskArgs.projectName}`);
  console.log(`taskArgs.organization: ${taskArgs.organization}`);
  console.log(`taskArgs.monitorOnBuild: ${taskArgs.monitorOnBuild}`);
  console.log(`taskArgs.failOnIssues: ${taskArgs.failOnIssues}`);
  console.log(`taskArgs.additionalArguments: ${taskArgs.additionalArguments}`);
  console.log("\n");
};

async function showDirectoryListing(options: tr.IExecOptions) {
  const lsPath = tl.which("ls");
  console.log(`\nlsPath: ${lsPath}\n`);

  const lsToolRunner: tr.ToolRunner = tl.tool(lsPath);
  lsToolRunner.arg("-la");
  const lsExitCode = await lsToolRunner.exec(options);
  console.log(`lsExitCode: ${lsExitCode}\n`);
}

async function installSnyk(options: tr.IExecOptions, useSudo: boolean) {
  const installSnykToolRunner: tr.ToolRunner = buildToolRunner("npm", useSudo)
    .arg("install")
    .arg("-g")
    .arg("snyk");

  const installSnykExitCode = await installSnykToolRunner.exec(options);
  if (isDebugMode())
    console.log(`installSnykExitCode: ${installSnykExitCode}\n`);
}

async function authorizeSnyk(
  snykToken: string,
  options: tr.IExecOptions,
  useSudo: boolean
) {
  // TODO: play with setVariable as an option to use instead of running `snyk auth`
  // tl.setVariable('SNYK_TOKEN', authToken, true);

  const snykAuthToolRunner: tr.ToolRunner = buildToolRunner("snyk", useSudo)
    .arg("auth")
    .arg(snykToken);

  const snykAuthExitCode = await snykAuthToolRunner.exec(options);
  if (isDebugMode()) console.log(`snykAuthExitCode: ${snykAuthExitCode}\n`);
}

async function runSnykTest(
  taskArgs: TaskArgs,
  options: tr.IExecOptions,
  useSudo: boolean
) {
  const fileArg = taskArgs.getFileParameter();
  const snykTestToolRunner: tr.ToolRunner = buildToolRunner("snyk", useSudo)
    .arg("test")
    .argIf(
      taskArgs.severityThreshold,
      `--severity-threshold=${taskArgs.severityThreshold}`
    )
    .argIf(taskArgs.dockerImageName, `--docker`)
    .argIf(taskArgs.dockerImageName, `${taskArgs.dockerImageName}`)
    .argIf(fileArg, `--file=${fileArg}`)

    .argIf(taskArgs.additionalArguments, taskArgs.additionalArguments);

  const snykTestExitCode = await snykTestToolRunner.exec(options);
  if (isDebugMode()) console.log(`snykTestExitCode: ${snykTestExitCode}\n`);

  if (
    taskArgs.failOnIssues &&
    snykTestExitCode === CLI_EXIT_CODE_ISSUES_FOUND
  ) {
    const errorMsg = "failing task because `snyk test` found issues";
    throw new SnykError(errorMsg);
  }

  if (snykTestExitCode >= CLI_EXIT_CODE_INVALID_USE) {
    const errorMsg =
      "failing task because `snyk test` was improperly used or had other errors";
    throw new SnykError(errorMsg);
  }
}

async function runSnykMonitor(
  taskArgs: TaskArgs,
  options: tr.IExecOptions,
  useSudo: boolean
) {
  const fileArg = taskArgs.getFileParameter();
  const snykMonitorToolRunner: tr.ToolRunner = buildToolRunner("snyk", useSudo)
    .arg("monitor")
    .argIf(taskArgs.dockerImageName, `--docker`)
    .argIf(taskArgs.dockerImageName, `${taskArgs.dockerImageName}`)
    .argIf(fileArg, `--file=${fileArg}`)
    .argIf(taskArgs.organization, `--org=${taskArgs.organization}`)
    .argIf(taskArgs.projectName, `--project-name=${taskArgs.projectName}`)
    .argIf(taskArgs.additionalArguments, taskArgs.additionalArguments);

  const snykMonitorExitCode = await snykMonitorToolRunner.exec(options);
  if (isDebugMode())
    console.log(`snykMonitorExitCode: ${snykMonitorExitCode}\n`);

  if (snykMonitorExitCode !== SNYK_MONITOR_EXIT_CODE_SUCCESS) {
    let errorMsg = "failing task because `snyk monitor` had an error";

    if (snykMonitorExitCode === SNYK_MONITOR_EXIT_INVALID_FILE_OR_IMAGE)
      errorMsg =
        "failing task because `snyk monitor` had an error - unknown file or image";

    throw new SnykError(errorMsg);
  }
}

const isSudoMode = (): boolean => {
  let useSudo = true;
  try {
    const p: tl.Platform = tl.getPlatform();
    useSudo = p === tl.Platform.Linux; // we need to use sudo for Linux
  } catch (Error) {
    // this occurs during tests as tl.getPlatform() is not mocked
    // https://github.com/microsoft/azure-pipelines-task-lib/issues/530
    console.log("Warning: Error caught calling tl.getPlatform()");
  }
  return useSudo;
};

async function run() {
  try {
    const currentWorkingDirectory: string = tl.cwd();
    if (isDebugMode())
      console.log(`currentWorkingDirectory: ${currentWorkingDirectory}\n`);

    const taskArgs: TaskArgs = parseInputArgs();
    const authTokenToUse = getAuthToken();
    if (!authTokenToUse) {
      const errorMsg =
        "auth token is not set. Setup SnykAuth service connection and specify serviceConnectionEndpoint input parameter.";
      throw new SnykError(errorMsg);
    }

    const options = {
      cwd: taskArgs.testDirectory,
      failOnStdErr: false,
      ignoreReturnCode: true
    } as tr.IExecOptions;

    if (isDebugMode()) {
      showDirectoryListing(options);
    }

    const useSudo = isSudoMode();
    if (isDebugMode()) console.log(`useSudo: ${useSudo}`);

    await installSnyk(options, useSudo);
    await authorizeSnyk(authTokenToUse, options, useSudo);
    await runSnykTest(taskArgs, options, useSudo);
    if (taskArgs.monitorOnBuild)
      await runSnykMonitor(taskArgs, options, useSudo);
  } catch (err) {
    console.error("\n\n***************************");
    console.error("** We have a problem! :( **");
    console.error("***************************\n");
    console.error(err.message);
    if (isDebugMode()) console.log(err);
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

run();

export { isSudoMode };
