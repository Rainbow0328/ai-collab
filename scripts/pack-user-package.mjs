/*
 * Copyright 2024 Cloud Skill Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = join(repoRoot, "release", "loopmarshal");
const webDistPath = join(repoRoot, "apps", "web", "dist");

const rootPackage = {
  packageJsonPath: join(repoRoot, "apps", "cli", "package.json"),
  distPath: join(repoRoot, "apps", "cli", "dist")
};

const bundledPackages = [
  {
    name: "@loopmarshal/core",
    packageJsonPath: join(repoRoot, "apps", "core", "package.json"),
    distPath: join(repoRoot, "apps", "core", "dist")
  },
  {
    name: "@loopmarshal/protocol",
    packageJsonPath: join(repoRoot, "packages", "protocol", "package.json"),
    distPath: join(repoRoot, "packages", "protocol", "dist")
  },
  {
    name: "@loopmarshal/shared",
    packageJsonPath: join(repoRoot, "packages", "shared", "package.json"),
    distPath: join(repoRoot, "packages", "shared", "dist")
  },
  {
    name: "@loopmarshal/sdk",
    packageJsonPath: join(repoRoot, "packages", "sdk", "package.json"),
    distPath: join(repoRoot, "packages", "sdk", "dist")
  },
  {
    name: "@loopmarshal/store",
    packageJsonPath: join(repoRoot, "packages", "store", "package.json"),
    distPath: join(repoRoot, "packages", "store", "dist")
  }
];

const internalPackageNames = new Set([
  "loopmarshal",
  ...bundledPackages.map((item) => item.name)
]);

const readJson = async (path) => {
  return JSON.parse(await readFile(path, "utf8"));
};

const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
};

const sanitizePackageJson = (pkg, overrides = {}) => {
  const next = {
    ...pkg,
    ...overrides,
    private: false
  };

  delete next.scripts;
  delete next.workspaces;

  return next;
};

const packageNameToPathParts = (name) => name.split("/");

const resolveInstalledPackage = async (packageName, issuerPackageJsonPath) => {
  let searchDir = dirname(issuerPackageJsonPath);
  while (searchDir !== dirname(searchDir)) {
    const candidates = [
      join(searchDir, "node_modules", ...packageNameToPathParts(packageName)),
      ...(basename(searchDir) === "node_modules"
        ? [join(searchDir, ...packageNameToPathParts(packageName))]
        : [])
    ];
    for (const packageDir of candidates) {
      const linkedPackageJsonPath = join(packageDir, "package.json");
      if (!existsSync(linkedPackageJsonPath)) continue;
      const resolvedPackageDir = await realpath(packageDir);
      const packageJsonPath = join(resolvedPackageDir, "package.json");
      const packageJson = await readJson(packageJsonPath);
      if (packageJson.name === packageName) {
        return {
          name: packageName,
          packageDir: resolvedPackageDir,
          packageJson,
          packageJsonPath
        };
      }
    }
    searchDir = dirname(searchDir);
  }

  const requireFromIssuer = createRequire(issuerPackageJsonPath);
  let resolvedEntry;
  try {
    resolvedEntry = requireFromIssuer.resolve(packageName);
  } catch {
    throw new Error(
      `Unable to resolve external dependency '${packageName}' from '${issuerPackageJsonPath}'.`
    );
  }

  let currentDir = dirname(resolvedEntry);
  while (currentDir !== dirname(currentDir)) {
    const packageJsonPath = join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = await readJson(packageJsonPath);
      if (packageJson.name === packageName) {
        return { name: packageName, packageDir: currentDir, packageJson, packageJsonPath };
      }
    }
    currentDir = dirname(currentDir);
  }
  throw new Error(
    `Resolved '${packageName}' from '${issuerPackageJsonPath}', but could not locate its package.json.`
  );
};

const bundledExternalDependencyNames = new Set();
const copiedExternalTargets = new Set();

const copyExternalDependencyTree = async ({ packageName, issuerPackageJsonPath, targetIssuerDir }) => {
  const dependency = await resolveInstalledPackage(packageName, issuerPackageJsonPath);
  const targetDir = join(targetIssuerDir, "node_modules", ...packageNameToPathParts(packageName));
  if (copiedExternalTargets.has(targetDir)) return;
  copiedExternalTargets.add(targetDir);
  bundledExternalDependencyNames.add(packageName);
  await mkdir(dirname(targetDir), { recursive: true });
  await cp(dependency.packageDir, targetDir, { recursive: true, dereference: true });
  for (const childName of Object.keys(dependency.packageJson.dependencies ?? {})) {
    if (internalPackageNames.has(childName)) continue;
    await copyExternalDependencyTree({
      packageName: childName,
      issuerPackageJsonPath: dependency.packageJsonPath,
      targetIssuerDir: targetDir
    });
  }
};

const copyExternalDependenciesForPackage = async ({ packageJson, packageJsonPath, targetPackageDir }) => {
  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
    if (internalPackageNames.has(dependencyName)) continue;
    await copyExternalDependencyTree({
      packageName: dependencyName,
      issuerPackageJsonPath: packageJsonPath,
      targetIssuerDir: targetPackageDir
    });
  }
};

const normalizeWorkspaceDependencies = (pkg, internalVersions) => {
  const dependencies = { ...(pkg.dependencies ?? {}) };
  for (const [name, version] of internalVersions) {
    if (typeof dependencies[name] === "string" && dependencies[name].startsWith("workspace:")) {
      dependencies[name] = version;
    }
  }
  return { ...pkg, dependencies };
};

const copyPackage = async (
  { packageJsonPath, distPath, name },
  targetRoot,
  internalVersions
) => {
  const sourcePackageJson = await readJson(packageJsonPath);
  const packageJson = sanitizePackageJson(
    normalizeWorkspaceDependencies(sourcePackageJson, internalVersions)
  );
  const packageDir = join(targetRoot, "node_modules", ...name.split("/"));

  await mkdir(packageDir, { recursive: true });
  await writeJson(join(packageDir, "package.json"), packageJson);
  await cp(distPath, join(packageDir, "dist"), { recursive: true });
  return { packageDir, packageJson: sourcePackageJson, packageJsonPath };
};

const main = async () => {
  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(releaseRoot, { recursive: true });
  const bundledSources = await Promise.all(
    bundledPackages.map(async (item) => ({ item, packageJson: await readJson(item.packageJsonPath) }))
  );
  const internalVersions = new Map(
    bundledSources.map(({ item, packageJson }) => [item.name, packageJson.version])
  );
  const sourceRootPackageJson = await readJson(rootPackage.packageJsonPath);
  const rootExternalDependencies = Object.keys(sourceRootPackageJson.dependencies ?? {})
    .filter((name) => !internalPackageNames.has(name));
  const rootPackageJson = sanitizePackageJson(
    normalizeWorkspaceDependencies(sourceRootPackageJson, internalVersions),
    {
      bundledDependencies: [
        ...bundledPackages.map((item) => item.name),
        ...rootExternalDependencies
      ]
    }
  );
  await writeJson(join(releaseRoot, "package.json"), rootPackageJson);
  await cp(rootPackage.distPath, join(releaseRoot, "dist"), { recursive: true });
  const bundledTargets = new Map();
  for (const { item } of bundledSources) {
    const copied = await copyPackage(item, releaseRoot, internalVersions);
    bundledTargets.set(item.name, copied);
  }
  if (existsSync(join(webDistPath, "index.html"))) {
    await cp(webDistPath, join(releaseRoot, "node_modules", "@loopmarshal", "core", "web"), { recursive: true });
  }
  await copyExternalDependenciesForPackage({
    packageJson: sourceRootPackageJson,
    packageJsonPath: rootPackage.packageJsonPath,
    targetPackageDir: releaseRoot
  });
  for (const { item, packageJson } of bundledSources) {
    await copyExternalDependenciesForPackage({
      packageJson,
      packageJsonPath: item.packageJsonPath,
      targetPackageDir: bundledTargets.get(item.name).packageDir
    });
  }
  process.stdout.write(
    JSON.stringify(
      {
        releaseRoot,
        bundledExternalDependencies: [...bundledExternalDependencyNames].sort(),
        nextCommand: "npm pack ./release/loopmarshal --json --cache .npm-cache"
      },
      null,
      2
    ) + "\n"
  );
};

main().catch((error) => {
  console.error("Failed to prepare and pack user package.", error);
  process.exitCode = 1;
});
