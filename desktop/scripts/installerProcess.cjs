const { spawn } = require("node:child_process");

function quotePowerShellArgument(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildPowerShellStartProcessScript(command, args, cwd) {
  const argumentList = args.map(quotePowerShellArgument).join(", ");
  const workingDirectory = cwd ? ` -WorkingDirectory ${quotePowerShellArgument(cwd)}` : "";
  return [
    "$ErrorActionPreference = 'Stop'",
    `$process = Start-Process -FilePath ${quotePowerShellArgument(command)} -ArgumentList @(${argumentList})${workingDirectory} -Wait -PassThru`,
    "exit $process.ExitCode",
  ].join("\n");
}

function runDirectProcessAndWait(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      windowsHide: true,
      ...options,
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

function runWindowsProcessAndWait(command, args, options = {}) {
  if (process.platform !== "win32") {
    return runDirectProcessAndWait(command, args, options);
  }

  const encodedCommand = Buffer.from(
    buildPowerShellStartProcessScript(command, args, options.cwd),
    "utf16le",
  ).toString("base64");

  return runPowerShellProcessAndWait("pwsh.exe", encodedCommand, command, args, options)
    .catch((error) => {
      if (error.code !== "ENOENT") {
        throw error;
      }

      return runPowerShellProcessAndWait("powershell.exe", encodedCommand, command, args, options);
    });
}

function runPowerShellProcessAndWait(powershellExecutable, encodedCommand, command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershellExecutable,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand],
      {
        ...options,
        stdio: options.stdio ?? "inherit",
        windowsHide: true,
      },
    );

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

module.exports = {
  buildPowerShellStartProcessScript,
  quotePowerShellArgument,
  runWindowsProcessAndWait,
};
