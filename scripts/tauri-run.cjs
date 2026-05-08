const { existsSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const root = join(__dirname, "..");
const isWindows = process.platform === "win32";
const tauriBin = isWindows
  ? join(root, "node_modules", ".bin", "tauri.cmd")
  : join(root, "node_modules", ".bin", "tauri");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    cwd: root,
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

function findVcVars64() {
  const candidates = [
    process.env.VCVARS64_PATH,
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

if (!existsSync(tauriBin)) {
  console.error("Tauri CLI local não encontrado. Rode `npm install` antes.");
  process.exit(1);
}

if (isWindows && args[0] === "build") {
  const vcvars = findVcVars64();
  if (vcvars) {
    const tmpDir = join(root, ".tmp");
    const tmpCmd = join(tmpDir, `tauri-msvc-build-${process.pid}.cmd`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      tmpCmd,
      [
        "@echo off",
        `call "${vcvars}" >nul`,
        "if errorlevel 1 exit /b %errorlevel%",
        `"${tauriBin}" %*`,
        "",
      ].join("\r\n"),
    );
    const result = spawnSync("cmd.exe", ["/d", "/c", tmpCmd, ...args], {
      stdio: "inherit",
      cwd: root,
    });
    try {
      rmSync(tmpCmd, { force: true });
    } catch {
      /* ignore cleanup failures */
    }
    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }
    process.exit(result.status ?? 1);
  }
}

run(tauriBin, args, { shell: isWindows });
