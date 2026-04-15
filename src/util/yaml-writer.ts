import { stringify } from 'yaml';

export function toYaml(data: unknown): string {
  return stringify(data, { indent: 2, lineWidth: 0 });
}
