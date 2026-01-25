export default function match(target: string, query: string): boolean {
  return target.toLowerCase().includes(query.toLowerCase());
}
