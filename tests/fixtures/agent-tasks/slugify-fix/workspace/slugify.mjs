// BUG: only replaces spaces, and does not lowercase, trim, or collapse runs of
// non-alphanumerics. The agent's job is to fix this.
export function slugify(input) {
  return input.replace(/ /g, '-');
}
