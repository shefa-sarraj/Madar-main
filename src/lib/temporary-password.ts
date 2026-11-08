const GROUPS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*+-=?"];

export function generateTemporaryPassword(): string {
  const random = globalThis.crypto;
  if (!random?.getRandomValues) throw new Error("Secure randomness is unavailable");
  function index(size: number) {
    const limit = Math.floor(0x100000000 / size) * size;
    const value = new Uint32Array(1);
    do random.getRandomValues(value);
    while (value[0]! >= limit);
    return value[0]! % size;
  }
  const alphabet = GROUPS.join("");
  const characters = GROUPS.map((group) => group[index(group.length)]!);
  while (characters.length < 20) characters.push(alphabet[index(alphabet.length)]!);
  for (let i = characters.length - 1; i > 0; i--) {
    const j = index(i + 1);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }
  return characters.join("");
}
