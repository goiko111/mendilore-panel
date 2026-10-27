// Secreto de los endpoints temporales de diagnóstico (app/api/webhook/*).
// Vive en la variable DIAG_SECRET de Cloudflare Pages, nunca en el código:
// el repo es público. Sin la variable, todo se rechaza.
export function secretoDiagValido(valor: string | null): boolean {
  const secreto = process.env.DIAG_SECRET;
  return !!secreto && valor === secreto;
}
