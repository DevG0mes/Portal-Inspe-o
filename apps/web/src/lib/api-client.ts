export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(
      status === 401
        ? 'Sua sessão expirou. Entre novamente para continuar.'
        : status === 403
          ? 'Seu perfil não permite esta operação.'
          : status === 409
            ? 'Os dados já existem ou foram alterados. Atualize a página e confira antes de tentar novamente.'
            : status === 400
              ? 'Confira os dados informados. A operação não foi realizada.'
              : 'Não foi possível concluir a operação. Tente novamente.',
    );
  }
}
/** Same-origin BFF; credentials never enter JavaScript storage or response bodies. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok)
    throw new ApiError(response.status, response.headers.get('x-request-id') ?? undefined);
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
