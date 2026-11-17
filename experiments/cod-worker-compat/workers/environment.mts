import {requestContext} from './request-context';
// This getter keeps the existing access-token signer request-scoped without global process.env mutation.
export const requestEnvironment = {
  get SHOPIFY_API_SECRET() {return requestContext().env.SHOPIFY_API_SECRET;},
};
