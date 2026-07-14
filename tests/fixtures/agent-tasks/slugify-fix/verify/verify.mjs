// Objective success check — exit 0 iff slugify() is correct. No dependencies.
import { slugify } from './slugify.mjs';

const cases = [
  ['Hello World', 'hello-world'],
  ['  Trim  Me  ', 'trim-me'],
  ['Foo_Bar!!Baz', 'foo-bar-baz'],
  ['Café del Mar 2024', 'caf-del-mar-2024'],
];

let ok = true;
for (const [input, expected] of cases) {
  const got = slugify(input);
  if (got !== expected) {
    console.error(`slugify(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(expected)}`);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
