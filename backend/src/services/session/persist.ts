import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../../.data');

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadJsonFile<T>(filename: string, fallback: T): T {
  ensureDir();
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function saveJsonFile(filename: string, data: unknown): void {
  ensureDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
