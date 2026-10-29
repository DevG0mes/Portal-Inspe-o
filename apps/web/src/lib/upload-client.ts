import { ApiError } from './api-client';
/** Same-origin binary upload; progress refers to transfer to the portal, not finalization. */
export function uploadEvidence(id: string, file: File, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    if (!/^[a-f0-9-]{36}$/i.test(id)) {
      reject(new Error('Identificador de envio inválido.'));
      return;
    }
    const request = new XMLHttpRequest();
    request.open('PUT', `/api/files/${id}/content`);
    request.timeout = 90000;
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(
            new ApiError(request.status, request.getResponseHeader('x-request-id') ?? undefined),
          );
    request.onerror = () =>
      reject(new Error('A transferência falhou. Sua seleção foi mantida para tentar novamente.'));
    request.ontimeout = () =>
      reject(new Error('O envio demorou mais que o esperado. Tente novamente.'));
    request.onabort = () => reject(new Error('Envio interrompido.'));
    request.send(file);
  });
}
