import PocketBase from 'pocketbase'

// La app y la API se sirven desde el mismo sitio (PocketBase en producción, proxy de Vite en desarrollo).
export const pb = new PocketBase(window.location.origin)
pb.autoCancellation(false)
