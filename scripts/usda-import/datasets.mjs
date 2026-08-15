import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import chain from 'stream-chain';
import parserPkg from 'stream-json';
import pickPkg from 'stream-json/filters/pick.js';
import streamArrayPkg from 'stream-json/streamers/stream-array.js';

const { parser } = parserPkg;
const { pick } = pickPkg;
const { streamArray } = streamArrayPkg;

async function ensureDir(targetDir) {
  await mkdir(targetDir, { recursive: true });
}

async function fileExistsWithContent(filePath) {
  try {
    const info = await stat(filePath);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function downloadFile(url, destination) {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await ensureDir(path.dirname(destination));
  await pipeline(response.body, createWriteStream(destination));
}

function unzipArchive(zipPath, extractDir) {
  execFileSync('unzip', ['-o', zipPath, '-d', extractDir], {
    stdio: 'ignore',
  });
}

export async function ensureDatasetFiles(datasets) {
  for (const dataset of datasets) {
    const hasJson = await fileExistsWithContent(dataset.jsonPath);

    if (hasJson) {
      continue;
    }

    const hasZip = await fileExistsWithContent(dataset.zipPath);

    if (!hasZip) {
      console.log(
        `[cache] Downloading ${dataset.displayName} ${dataset.releaseId} from USDA...`,
      );
      await downloadFile(dataset.downloadUrl, dataset.zipPath);
    }

    console.log(`[cache] Extracting ${path.basename(dataset.zipPath)}...`);
    await ensureDir(dataset.extractDir);
    unzipArchive(dataset.zipPath, dataset.extractDir);
  }
}

export async function* iterateDatasetFoods(dataset) {
  const pipelineStream = chain([
    fs.createReadStream(dataset.jsonPath),
    parser(),
    pick({ filter: dataset.rootKey }),
    streamArray(),
  ]);

  try {
    for await (const chunk of pipelineStream) {
      yield chunk.value;
    }
  } finally {
    pipelineStream.destroy();
  }
}
