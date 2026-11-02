// Secreto de los endpoints temporales de diagnóstico (app/api/webhook/*).
// El repo es público: aquí solo está el SHA-256 del secreto, que es un valor
// aleatorio de 192 bits y no se puede sacar del hash. La copia del valor está
// en ~/.config/mendilore/diag_secret (Mac de Goiko). Si algún día se crea la
// variable DIAG_SECRET en Cloudflare Pages, también vale.
const DIAG_SECRET_SHA256 = "b85a3aefdfbf7f5b6374088e6a081979c0ec2ac5adfa8f687bfc9dc70467e60c";

export async function secretoDiagValido(valor: string | null): Promise<boolean> {
  if (!valor) return false;
  const secreto = process.env.DIAG_SECRET;
  if (secreto && valor === secreto) return true;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  return hex === DIAG_SECRET_SHA256;
}
