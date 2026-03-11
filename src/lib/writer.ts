import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

export function writeIndex(outputDir: string, filename: string, content: string) {
  ensureDir(outputDir);
  const filePath = join(outputDir, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

export function updateClaudeMd(claudeMdPath: string, section: string) {
  const START = "<!-- klix:start -->";
  const END = "<!-- klix:end -->";
  const block = `${START}\n${section}\n${END}`;

  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, block + "\n", "utf-8");
    return;
  }

  let content = readFileSync(claudeMdPath, "utf-8");

  if (content.includes(START) && content.includes(END)) {
    const startIdx = content.indexOf(START);
    const endIdx = content.indexOf(END) + END.length;
    content = content.slice(0, startIdx) + block + content.slice(endIdx);
  } else {
    content = block + "\n\n" + content;
  }

  writeFileSync(claudeMdPath, content, "utf-8");
}

export function writeIndexDir(outputDir: string, subDir: string, filename: string, content: string): string {
  const dirPath = join(outputDir, subDir);
  ensureDir(dirPath);
  return writeIndex(dirPath, filename, content);
}
