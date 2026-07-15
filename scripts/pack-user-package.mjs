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
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

const getInstalledPackageDir = (packageName) => {
  return join(repoRoot, "node_modules", ...packageNameToPathParts(packageName));
};

const collectExternalDependencies = async () => {
  const collected = new Set();
  const visited = new Set();
  const queue = [];

  const enqueueDependencies = (pkg) => {
    for (const dependencyName of Object.keys(pkg.dependencies ?? {})) {
      if (!internalPackageNames.has(dependencyName)) {
        queue.push(dependencyName);
      }
    }
  };

  enqueueDependencies(await readJson(rootPackage.packageJsonPath));

  for (const item of bundledPackages) {
    enqueueDependencies(await readJson(item.packageJsonPath));
  }

  while (queue.length > 0) {
    const dependencyName = queue.shift();

    if (!dependencyName || visited.has(dependencyName)) {
      continue;
    }

    visited.add(dependencyName);
    collected.add(dependencyName);

    const dependencyPackageJson = await readJson(
      join(getInstalledPackageDir(dependencyName), "package.json")
    );

    for (const childDependencyName of Object.keys(
      dependencyPackageJson.dependencies ?? {}
    )) {
      if (!internalPackageNames.has(childDependencyName)) {
        queue.push(childDependencyName);
      }
    }
  }

  return [...collected].sort((left, right) => left.localeCompare(right));
};

const copyPackage = async ({ packageJsonPath, distPath, name }, targetRoot) => {
  const packageJson = sanitizePackageJson(await readJson(packageJsonPath));
  const packageDir = join(targetRoot, "node_modules", ...name.split("/"));

  await mkdir(packageDir, { recursive: true });
  await writeJson(join(packageDir, "package.json"), packageJson);
  await cp(distPath, join(packageDir, "dist"), { recursive: true });
};

const copyExternalDependency = async (name, targetRoot) => {
  const sourceDir = getInstalledPackageDir(name);
  const targetDir = join(targetRoot, "node_modules", ...packageNameToPathParts(name));

  await mkdir(dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true, dereference: true });
};

const main = async () => {
  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(releaseRoot, { recursive: true });

  const externalDependencies = await collectExternalDependencies();

  const rootPackageJson = sanitizePackageJson(
    await readJson(rootPackage.packageJsonPath),
    {
      bundledDependencies: [
        ...bundledPackages.map((item) => item.name),
        ...externalDependencies
      ]
    }
  );

  await writeJson(join(releaseRoot, "package.json"), rootPackageJson);
  await cp(rootPackage.distPath, join(releaseRoot, "dist"), { recursive: true });

  for (const item of bundledPackages) {
    await copyPackage(item, releaseRoot);
  }

  if (existsSync(join(webDistPath, "index.html"))) {
    await cp(
      webDistPath,
      join(releaseRoot, "node_modules", "@loopmarshal", "core", "web"),
      { recursive: true }
    );
  }

  for (const dependencyName of externalDependencies) {
    await copyExternalDependency(dependencyName, releaseRoot);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        releaseRoot,
        bundledExternalDependencies: externalDependencies,
        nextCommand: "npm pack ./release/loopmarshal --json --cache .npm-cache"
      },
      null,
      2
    )}\n`
  );
};

main().catch((error) => {
  console.error("Failed to prepare and pack user package.", error);
  process.exitCode = 1;
});
