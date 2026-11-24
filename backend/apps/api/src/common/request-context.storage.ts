import { AsyncLocalStorage } from 'node:async_hooks';
import { EMPTY_REQUEST_CONTEXT, type RequestContext } from './request-context';

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  return requestContextStorage.getStore() ?? EMPTY_REQUEST_CONTEXT;
}
