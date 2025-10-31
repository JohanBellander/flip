import * as fs from 'fs';
import * as path from 'path';

export function createRunFolder(baseDir = path.join('.flip', 'runs')): string {
  const ts = timestamp();
  const dir = path.join(baseDir, ts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function timestamp(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const MM = String(date.getMinutes()).padStart(2, '0');
  const SS = String(date.getSeconds()).padStart(2, '0');
  const mmm = String(date.getMilliseconds()).padStart(3, '0');
  return `${yyyy}${mm}${dd}-${HH}${MM}${SS}-${mmm}`;
}


