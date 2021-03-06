import { TaskArgs } from "./task-args";
import * as tr from "azure-pipelines-task-lib/toolrunner";
import * as tl from "azure-pipelines-task-lib/task";
import { Platform } from "azure-pipelines-task-lib/task";
import stream = require("stream");
import * as fs from "fs";
import * as path from "path";

export const JSON_ATTACHMENT_TYPE = "JSON_ATTACHMENT_TYPE";
export const HTML_ATTACHMENT_TYPE = "HTML_ATTACHMENT_TYPE";

export const getOptionsToExecuteCmd = (taskArgs: TaskArgs): tr.IExecOptions => {
  return {
    cwd: taskArgs.testDirectory,
    failOnStdErr: false,
    ignoreReturnCode: true
  } as tr.IExecOptions;
};

export const getOptionsToExecuteSnykCLICommand = (
  taskArgs: TaskArgs,
  taskNameForAnalytics: string,
  taskVersion: string
): tr.IExecOptions => {
  const envVars = process.env;
  envVars["SNYK_INTEGRATION_NAME"] = taskNameForAnalytics;
  envVars["SNYK_INTEGRATION_VERSION"] = taskVersion;

  const options = {
    cwd: taskArgs.testDirectory,
    failOnStdErr: false,
    ignoreReturnCode: true,
    env: envVars
  } as tr.IExecOptions;

  return options;
};

export const getOptionsForSnykToHtml = (
  htmlOutputFileFullPath: string,
  taskArgs: TaskArgs
): tr.IExecOptions => {
  const writableString: stream.Writable = fs.createWriteStream(
    htmlOutputFileFullPath
  );

  return {
    cwd: taskArgs.testDirectory,
    failOnStdErr: false,
    ignoreReturnCode: true,
    outStream: writableString
  } as tr.IExecOptions;
};

export const isSudoMode = (p: Platform): boolean => {
  if (typeof p !== "number") return true; // this may not be a good assumption, but now that we're actually checking if sudo exists, it should be ok
  return p === Platform.Linux;
};

export function sudoExists(): boolean {
  const res = tl.which("sudo"); // will return an empty string if sudo does not exist or a path like `/usr/bin/sudo`
  // coerce to boolean
  if (res) {
    return true;
  } else {
    return false;
  }
}

export const getToolPath = (
  tool: string,
  whichFn: (tool: string, check?: boolean) => string,
  requiresSudo: boolean = false
): string => (requiresSudo ? whichFn("sudo") : whichFn(tool));

export function formatDate(d: Date): string {
  return d
    .toISOString()
    .split(".")[0]
    .replace(/:/g, "-");
}

export function attachReport(filePath: string, attachmentType: string) {
  if (fs.existsSync(filePath)) {
    const filename = path.basename(filePath);
    console.log(`${filePath} exists... attaching file`);
    tl.addAttachment(attachmentType, filename, filePath);
  } else {
    console.log(`${filePath} does not exist... cannot attach`);
  }
}
