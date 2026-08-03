import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vendor = resolve(root, "vendor");
const profile = JSON.parse(
  await readFile(resolve(root, "platform-rc.json"), "utf8"),
);

await mkdir(vendor, { recursive: true });

for (const asset of profile.assets) {
  const target = resolve(vendor, asset.name);
  let present = false;
  try {
    present = (await stat(target)).isFile();
  } catch {
    present = false;
  }
  if (!present) {
    const result = spawnSync(
      "gh",
      [
        "release",
        "download",
        profile.release,
        "--repo",
        profile.repository,
        "--pattern",
        asset.name,
        "--dir",
        vendor,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(`Unable to fetch pinned platform asset: ${asset.name}`);
    }
  }
  const bytes = await readFile(target);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== asset.size || digest !== asset.sha256) {
    throw new Error(`Pinned platform asset mismatch: ${asset.name}`);
  }
}

process.stdout.write(
  `PLATFORM_RC_READY release=${profile.release} assets=${profile.assets.length}\n`,
);
